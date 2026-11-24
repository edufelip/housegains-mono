// Clawbacks (A3/C4/C5): undo-subtask, revoke-subtask, undo-bonus, revoke-bonus
// and the zelo reversals on chore.deleted / member.removed. Every reversal
// emits a `rev:{key}` row, restores cap counters and stats, and is idempotent
// through the reversal key.

import { applyCapChanges, periodKeyFor } from './caps';
import { applyReversalToWallet, localDateKey } from './award';
import {
  dailyGanhosCapKey,
  instanceGanhosCapKey,
  reversalKey,
  ruleCapKey,
  targetCapKey,
  walletKey,
  zeloWeekCapKey,
  householdCapKey,
} from './keys';
import { applyReversalToOrganizer } from './projections';
import { weekStartKeyForDateKey } from './weeks';
import type {
  ChoreDeletedEvent,
  EarnRule,
  EvalContext,
  LedgerRevokeBonusEvent,
  LedgerRevokeSubtaskEvent,
  LedgerUndoBonusEvent,
  LedgerUndoSubtaskEvent,
  LedgerRowDraft,
  MemberRemovedEvent,
  OrganizerProjection,
  ReversedRow,
  ResultCollector,
  WalletProjection,
} from './types';
import { HOUR_MS, DAY_MS } from './award';

function reversalReason(event: { kind: string; verdict?: string }): string {
  if (event.kind === 'ledger.revoke-subtask' || event.kind === 'ledger.revoke-bonus') {
    return `revoke:${event.verdict ?? 'partial'}`;
  }
  if (event.kind === 'ledger.undo-subtask' || event.kind === 'ledger.undo-bonus') return 'undo';
  if (event.kind === 'chore.deleted') return 'chore.deleted';
  return 'member.removed';
}

/** Cap counters the original award consumed, restored by the reversal. */
function restoreChangesFor(
  rule: EarnRule,
  awarded: number,
  event: { instanceId: string; assigneeIds?: string[] },
  dateKey: string,
  weekStart: string,
): Array<[string, number]> {
  const restore: Array<[string, number]> = [];
  for (const cap of rule.caps) {
    if (cap.pool === 'dailyGanhos') {
      restore.push([dailyGanhosCapKey(dateKey), awarded]);
    } else if (cap.pool === 'perInstanceGanhos' || (cap.scope === 'member+target' && cap.target === 'instance')) {
      restore.push([instanceGanhosCapKey(event.instanceId), awarded]);
    } else if (cap.scope === 'member+target' && cap.target === 'assignee') {
      for (const assigneeId of event.assigneeIds ?? []) {
        restore.push([targetCapKey(rule.id, cap.window, periodKeyFor(cap.window, dateKey, weekStart), assigneeId), 1]);
      }
    } else if (cap.scope === 'member') {
      restore.push([ruleCapKey(rule.id, cap.window, periodKeyFor(cap.window, dateKey, weekStart)), 1]);
    }
  }
  return restore;
}

function ruleById(ctx: EvalContext, ruleId: string): EarnRule | undefined {
  return ctx.rules.earnRules.find((rule) => rule.id === ruleId);
}

export function processSubtaskReversal(
  event: LedgerUndoSubtaskEvent | LedgerRevokeSubtaskEvent,
  wallet: WalletProjection,
  ctx: EvalContext,
  res: ResultCollector,
): void {
  const actionAt = event.completedAt;
  const dateKey = localDateKey(actionAt, ctx.timeZone);
  const weekStart = weekStartKeyForDateKey(dateKey);
  const reason = reversalReason(event);
  const reversedRuleIds: string[] = [];

  // Only the undone completer's call reverses their subtask/assist rows; the
  // wiring also calls evaluate for each on_time-paid assignee (handled below).
  if (event.memberId === wallet.memberId) {
    let statsReversed = false;
    let assistReversed = false;
    const entries: Array<{ ruleId: string; awarded: ReversedRow | null }> = [
      { ruleId: 'earn.subtask', awarded: event.reversedAward.subtask },
      { ruleId: 'earn.assist', awarded: event.reversedAward.assist },
    ];
    for (const entry of entries) {
      if (entry.awarded === null) continue;
      const rule = ruleById(ctx, entry.ruleId);
      if (!rule) continue;
      const originalKey = walletKey(entry.ruleId, event.reversedRowId, event.memberId);
      const revKey = reversalKey(originalKey);
      if (!ctx.existingKeys.has(originalKey)) continue; // nothing to reverse
      if (ctx.existingKeys.has(revKey) || ctx.emittedKeys.has(revKey)) continue; // already reversed
      const spendableAfterHours = rule.spendableAfterHours;
      const originalPending =
        entry.awarded.awardedAt.getTime() + spendableAfterHours * HOUR_MS > ctx.now.getTime();
      const row: LedgerRowDraft = {
        key: revKey,
        ruleId: entry.ruleId,
        ruleSetVersion: ctx.ruleSetVersion,
        track: 'ganhos',
        amount: -entry.awarded.amount,
        sourceRef: event.reversedRowId,
        householdId: res.householdId,
        memberId: event.memberId,
        reversesEntryId: originalKey,
        reason,
        createdAt: actionAt,
        spendableAt: actionAt,
      };
      ctx.emittedKeys.add(revKey);
      res.walletRows.push(row);
      applyReversalToWallet(wallet, row, originalPending);
      applyCapChanges(
        wallet.caps,
        restoreChangesFor(rule, entry.awarded.amount, event, dateKey, weekStart),
        -1,
      );
      if (entry.ruleId === 'earn.subtask') statsReversed = true;
      if (entry.ruleId === 'earn.assist') assistReversed = true;
      reversedRuleIds.push(entry.ruleId);
      res.walletDirty = true;
    }
    if (statsReversed) {
      wallet.stats.credits = Math.max(0, wallet.stats.credits - 1);
      // The assist stat follows the assist ROW, which may still stand even
      // when the credit itself was undone (event.reversedAward.assist null).
      if (assistReversed && event.isAssist) {
        wallet.stats.assists = Math.max(0, wallet.stats.assists - 1);
      }
      if (event.isFinalCompleter) wallet.stats.finals = Math.max(0, wallet.stats.finals - 1);
      if (event.category) {
        wallet.stats.categories[event.category] = Math.max(
          0,
          (wallet.stats.categories[event.category] ?? 0) - 1,
        );
      }
    }
  }

  // on_time (C4): reversed when a reversal reopens the instance. Rows are
  // found by scanning this wallet's keys for the instance prefix, skipping
  // already reversed generations.
  if (event.instanceStatusAfter !== 'done') {
    const onTimeRule = ctx.rules.earnRules.find(
      (rule) => rule.on.kind === 'instance.completed_on_time' && rule.track === 'ganhos',
    );
    if (onTimeRule) {
      const prefix = `earn.on_time:${event.instanceId.replace(/\//g, '|')}|`;
      for (const key of ctx.existingKeys) {
        if (!key.startsWith(prefix)) continue;
        const revKey = reversalKey(key);
        if (ctx.existingKeys.has(revKey) || ctx.emittedKeys.has(revKey)) continue;
        const withoutRule = key.slice('earn.on_time:'.length);
        const sourceRef = withoutRule.slice(0, withoutRule.lastIndexOf(':'));
        const memberId = key.slice(key.lastIndexOf(':') + 1);
        if (memberId !== wallet.memberId) continue; // this call owns this wallet only
        const row: LedgerRowDraft = {
          key: revKey,
          ruleId: onTimeRule.id,
          ruleSetVersion: ctx.ruleSetVersion,
          track: 'ganhos',
          amount: -onTimeRule.award.amount,
          sourceRef,
          householdId: res.householdId,
          memberId,
          reversesEntryId: key,
          reason,
          createdAt: actionAt,
          spendableAt: actionAt,
        };
        ctx.emittedKeys.add(revKey);
        res.walletRows.push(row);
        // shortcut: the original award time is unknown here, so pending is
        // only clamped; rebuildWalletProjection fixes any drift.
        applyReversalToWallet(wallet, row, null);
        wallet.stats.onTime = Math.max(0, wallet.stats.onTime - 1);
        applyCapChanges(
          wallet.caps,
          [[ruleCapKey(onTimeRule.id, 'day', dateKey), 1]],
          -1,
        );
        reversedRuleIds.push(onTimeRule.id);
        res.walletDirty = true;
      }
    }
  }

  if (reversedRuleIds.length > 0) {
    res.serverEvents.push({
      name: 'gami_clawback',
      householdId: res.householdId,
      memberId: wallet.memberId,
      data: { ruleIds: [...new Set(reversedRuleIds)].join(','), reason },
      createdAt: ctx.now,
    });
  }
}

export function processBonusReversal(
  event: LedgerUndoBonusEvent | LedgerRevokeBonusEvent,
  wallet: WalletProjection,
  ctx: EvalContext,
  res: ResultCollector,
): void {
  if (event.memberId !== wallet.memberId) return;
  const awarded = event.reversedAward.bonus;
  if (awarded === null) return;
  const rule = ruleById(ctx, 'earn.bonus');
  if (!rule) return;
  const actionAt = event.completedAt;
  const dateKey = localDateKey(actionAt, ctx.timeZone);
  const weekStart = weekStartKeyForDateKey(dateKey);
  const originalKey = walletKey('earn.bonus', event.reversedRowId, event.memberId);
  const revKey = reversalKey(originalKey);
  if (!ctx.existingKeys.has(originalKey)) return;
  if (ctx.existingKeys.has(revKey) || ctx.emittedKeys.has(revKey)) return;

  const originalPending =
    awarded.awardedAt.getTime() + rule.spendableAfterHours * HOUR_MS > ctx.now.getTime();
  const row: LedgerRowDraft = {
    key: revKey,
    ruleId: 'earn.bonus',
    ruleSetVersion: ctx.ruleSetVersion,
    track: 'ganhos',
    amount: -awarded.amount,
    sourceRef: event.reversedRowId,
    householdId: res.householdId,
    memberId: event.memberId,
    reversesEntryId: originalKey,
    reason: reversalReason(event),
    createdAt: actionAt,
    spendableAt: actionAt,
  };
  ctx.emittedKeys.add(revKey);
  res.walletRows.push(row);
  applyReversalToWallet(wallet, row, originalPending);
  applyCapChanges(wallet.caps, restoreChangesFor(rule, awarded.amount, event, dateKey, weekStart), -1);
  res.walletDirty = true;
  res.serverEvents.push({
    name: 'gami_clawback',
    householdId: res.householdId,
    memberId: event.memberId,
    data: { ruleIds: 'earn.bonus', reason: reversalReason(event) },
    createdAt: ctx.now,
  });
}

/** C5: zelo.chore_done is reversed when the chore dies within 7 days. */
export function processChoreDeleted(
  event: ChoreDeletedEvent,
  organizer: OrganizerProjection,
  ctx: EvalContext,
  res: ResultCollector,
): void {
  if (event.deletedAt.getTime() - event.createdAt.getTime() > 7 * DAY_MS) return;
  const rule = ruleById(ctx, 'zelo.chore_done');
  if (!rule) return;
  const originalKey = walletKey('zelo.chore_done', event.choreId, ctx.creatorUid);
  const revKey = reversalKey(originalKey);
  if (!ctx.existingKeys.has(originalKey)) return;
  if (ctx.existingKeys.has(revKey) || ctx.emittedKeys.has(revKey)) return;

  const actionAt = event.deletedAt;
  const dateKey = localDateKey(actionAt, ctx.timeZone);
  const weekStart = weekStartKeyForDateKey(dateKey);
  const row: LedgerRowDraft = {
    key: revKey,
    ruleId: rule.id,
    ruleSetVersion: ctx.ruleSetVersion,
    track: 'zelo',
    amount: -rule.award.amount,
    sourceRef: event.choreId,
    householdId: res.householdId,
    memberId: ctx.creatorUid,
    reversesEntryId: originalKey,
    reason: reversalReason(event),
    createdAt: actionAt,
    spendableAt: actionAt,
  };
  ctx.emittedKeys.add(revKey);
  res.zeloRows.push(row);
  applyReversalToOrganizer(organizer, row.amount, ctx.rules);
  applyCapChanges(
    organizer.caps,
    [
      [ruleCapKey(rule.id, 'week', weekStart), 1],
      [targetCapKey(rule.id, 'life', '', event.choreId), 1],
      [zeloWeekCapKey(weekStart), rule.award.amount],
    ],
    -1,
  );
  res.organizerDirty = true;
  res.serverEvents.push({
    name: 'gami_clawback',
    householdId: res.householdId,
    memberId: ctx.creatorUid,
    data: { ruleIds: rule.id, reason: reversalReason(event) },
    createdAt: ctx.now,
  });
}

/** C5: zelo.member_activated is reversed by removeMember within 30 days. */
export function processMemberRemoved(
  event: MemberRemovedEvent,
  organizer: OrganizerProjection,
  ctx: EvalContext,
  res: ResultCollector,
): void {
  if (event.removedAt.getTime() - event.joinedAt.getTime() > 30 * DAY_MS) return;
  const rule = ruleById(ctx, 'zelo.member_activated');
  if (!rule) return;
  const originalKey = walletKey(rule.id, event.memberId, ctx.creatorUid);
  const revKey = reversalKey(originalKey);
  if (!ctx.existingKeys.has(originalKey)) return;
  if (ctx.existingKeys.has(revKey) || ctx.emittedKeys.has(revKey)) return;

  const actionAt = event.removedAt;
  const dateKey = localDateKey(actionAt, ctx.timeZone);
  const weekStart = weekStartKeyForDateKey(dateKey);
  const row: LedgerRowDraft = {
    key: revKey,
    ruleId: rule.id,
    ruleSetVersion: ctx.ruleSetVersion,
    track: 'zelo',
    amount: -rule.award.amount,
    sourceRef: event.memberId,
    householdId: res.householdId,
    memberId: ctx.creatorUid,
    reversesEntryId: originalKey,
    reason: reversalReason(event),
    createdAt: actionAt,
    spendableAt: actionAt,
  };
  ctx.emittedKeys.add(revKey);
  res.zeloRows.push(row);
  applyReversalToOrganizer(organizer, row.amount, ctx.rules);
  organizer.stats.membersActivated = Math.max(0, organizer.stats.membersActivated - 1);
  applyCapChanges(
    organizer.caps,
    [
      [householdCapKey(rule.id, 'life', ''), 1],
      [zeloWeekCapKey(weekStart), rule.award.amount],
    ],
    -1,
  );
  res.organizerDirty = true;
  res.serverEvents.push({
    name: 'gami_clawback',
    householdId: res.householdId,
    memberId: ctx.creatorUid,
    data: { ruleIds: rule.id, reason: reversalReason(event) },
    createdAt: ctx.now,
  });
}
