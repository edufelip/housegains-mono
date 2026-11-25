// The pure gamification engine (Part C). evaluate() is the only entry the
// wiring needs: feed it one GamiEvent plus the member's wallet (and, for
// events that can award Zelo, the organizer projection), and it returns the
// ledger rows to append, the next projections, celebrations, server events
// and integrity alerts. Deterministic: no clocks, no randomness, no I/O.
//
// Multi-member flows (instance.completed_on_time, household.week_closed) are
// evaluated once per affected member: the wiring loops members, chains the
// organizer projection between calls and unions the emitted keys.

import { awardFor, applyAwardToWallet, baseAmountFor, localDateKey } from './award';
import { processBonusEvent, processOnTimeEvent, processShareEvent, processSubtaskEvent } from './earn';
import {
  processBonusReversal,
  processChoreDeleted,
  processMemberRemoved,
  processSubtaskReversal,
} from './clawback';
import { processWeekClosed } from './week';
import { weekStartKeyForDateKey } from './weeks';
import {
  cloneOrganizer,
  cloneWallet,
  createOrganizer,
  createWallet,
  ensureOrganizer,
  applyAwardToOrganizer,
  ruleActive,
  type OrganizerSlot,
} from './projections';
import { levelForXp } from './levels';
import type {
  EngineInput,
  EngineResult,
  EvalContext,
  GamiEvent,
  HouseholdSetupFinishedEvent,
  LedgerRowDraft,
  ResultCollector,
  WalletProjection,
} from './types';
import { PROJECTION_VERSION } from './types';

export function evaluate(event: GamiEvent, input: EngineInput): EngineResult {
  const ctx: EvalContext = {
    now: input.now,
    rules: input.rules,
    ruleSetVersion: input.ruleSetVersion,
    timeZone: input.timeZone,
    creatorUid: input.creatorUid,
    householdMemberCount: input.householdMemberCount,
    existingKeys: input.existingKeys,
    existingRows: input.existingRows ?? new Map(),
    emittedKeys: new Set<string>(),
  };
  const res: ResultCollector = {
    householdId: event.householdId,
    walletRows: [],
    zeloRows: [],
    celebrations: [],
    serverEvents: [],
    alerts: [],
    walletDirty: false,
    organizerDirty: false,
  };
  const wallet = input.wallet !== null ? cloneWallet(input.wallet) : null;
  const slot: OrganizerSlot | null =
    input.organizer !== undefined
      ? { organizer: input.organizer !== null ? cloneOrganizer(input.organizer) : null }
      : null;
  let memberWallet = wallet;

  switch (event.kind) {
    case 'ledger.subtask': {
      memberWallet = memberWallet ?? createWallet(event.householdId, event.memberId, input.now);
      processSubtaskEvent(event, memberWallet, input.wallet !== null, slot, ctx, res);
      break;
    }
    case 'ledger.bonus': {
      memberWallet = memberWallet ?? createWallet(event.householdId, event.memberId, input.now);
      processBonusEvent(event, memberWallet, input.wallet !== null, ctx, res);
      break;
    }
    case 'ledger.undo-subtask':
    case 'ledger.revoke-subtask': {
      // Reversals only make sense against an existing projection; the wiring
      // calls evaluate per affected member with that member's wallet.
      if (wallet !== null) processSubtaskReversal(event, wallet, ctx, res);
      break;
    }
    case 'ledger.undo-bonus':
    case 'ledger.revoke-bonus': {
      if (wallet !== null) processBonusReversal(event, wallet, ctx, res);
      break;
    }
    case 'instance.completed_on_time': {
      // A member without a wallet never contributed, so cannot earn on_time.
      if (wallet !== null) processOnTimeEvent(event, wallet, ctx, res);
      break;
    }
    case 'feed.post': {
      memberWallet = memberWallet ?? createWallet(event.householdId, event.memberId, input.now);
      processShareEvent(event, memberWallet, ctx, res);
      break;
    }
    case 'household.setup_finished': {
      if (slot !== null) processSetupFinished(event, slot, ctx, res);
      break;
    }
    case 'chore.deleted': {
      if (slot !== null) {
        const organizer = ensureOrganizer(slot, event.householdId, ctx, res);
        processChoreDeleted(event, organizer, ctx, res);
      }
      break;
    }
    case 'member.removed': {
      if (slot !== null) {
        const organizer = ensureOrganizer(slot, event.householdId, ctx, res);
        processMemberRemoved(event, organizer, ctx, res);
      }
      break;
    }
    case 'household.week_closed': {
      processWeekClosed(event, wallet, slot, ctx, res);
      break;
    }
    case 'member.joined':
    case 'member.activated':
    case 'chore.created':
      // Informational: the engine acts on credits, not on membership churn.
      break;
  }

  const nextWallet = res.walletDirty && memberWallet !== null ? memberWallet : null;
  const nextOrganizer = res.organizerDirty && slot !== null ? slot.organizer : null;
  return {
    walletRows: res.walletRows,
    zeloRows: res.zeloRows,
    wallet: nextWallet,
    organizer: nextOrganizer,
    celebrations: res.celebrations,
    serverEvents: res.serverEvents,
    alerts: res.alerts,
  };
}

function processSetupFinished(
  event: HouseholdSetupFinishedEvent,
  slot: OrganizerSlot,
  ctx: EvalContext,
  res: ResultCollector,
): void {
  const organizer = ensureOrganizer(slot, event.householdId, ctx, res);
  const actionAt = event.finishedAt;
  const dateKey = localDateKey(actionAt, ctx.timeZone);
  const weekStart = weekStartKeyForDateKey(dateKey);
  for (const rule of ctx.rules.earnRules) {
    if (rule.on.kind !== 'household.setup_finished' || rule.track !== 'zelo') continue;
    if (!ruleActive(rule, dateKey, ctx.householdMemberCount)) continue;
    const outcome = awardFor({
      ctx,
      res,
      rule,
      memberId: ctx.creatorUid,
      sourceRef: 'setup',
      actionAt,
      baseAmount: baseAmountFor(rule, 0),
      capCtx: { dateKey, weekStart, targetIds: [] },
      capsState: organizer.caps,
    });
    if (!outcome) continue;
    res.zeloRows.push(outcome.row);
    applyAwardToOrganizer(organizer, outcome.awarded, ctx, res);
    res.organizerDirty = true;
    res.celebrations.push({
      id: `cel:toast:setup:${ctx.creatorUid}`,
      moment: 'toast',
      track: 'zelo',
      amount: outcome.awarded,
      parts: [{ ruleId: rule.id, amount: outcome.awarded }],
      copyKey: rule.celebrate?.copyKey ?? 'gami.zelo.earned',
    });
    res.serverEvents.push({
      name: 'gami_earned',
      householdId: res.householdId,
      memberId: ctx.creatorUid,
      data: { ruleIds: rule.id, amount: outcome.awarded },
      createdAt: ctx.now,
    });
  }
}

/**
 * Replays wallet ledger rows into a fresh projection (C10 rebuildWallet).
 * Balance, lifetimeEarned, pendingBalance and nextSpendableAt come from the
 * rows (reversals pair back to their original key); xpPeak and identity come
 * with the input. Cap counters and stats start empty: they are engine
 * bookkeeping, not derivable from the wallet ledger alone.
 */
export interface WalletLedgerRowInput {
  key?: string;
  amount: number;
  spendableAt?: Date | null;
  /** The original row key this row negates, when it is a reversal. */
  reversesEntryId?: string;
}

export function rebuildWalletProjection(
  rows: readonly WalletLedgerRowInput[],
  input: { now: Date; xpPeak: number; householdId: string; memberId: string },
): WalletProjection {
  const byKey = new Map<string, WalletLedgerRowInput>();
  for (const row of rows) {
    if (row.key !== undefined) byKey.set(row.key, row);
  }
  let balance = 0;
  let lifetimeEarned = 0;
  const pendingEntries: Array<{ key?: string; amount: number; spendableAt: Date; reversed: boolean }> = [];
  for (const row of rows) {
    balance += row.amount;
    if (row.amount > 0) {
      lifetimeEarned += row.amount;
      const spendableAt = row.spendableAt ?? null;
      if (spendableAt !== null && spendableAt.getTime() > input.now.getTime()) {
        pendingEntries.push({ key: row.key, amount: row.amount, spendableAt, reversed: false });
      }
      continue;
    }
    // Reversal: subtract from lifetime only when it negates a real positive
    // row of this wallet (append-only ledgers also carry admin adjustments).
    if (row.amount < 0 && row.reversesEntryId !== undefined) {
      const original = byKey.get(row.reversesEntryId);
      if (original === undefined || original.amount <= 0) continue;
      lifetimeEarned = Math.max(0, lifetimeEarned + row.amount);
      const originalSpendableAt = original.spendableAt ?? null;
      if (originalSpendableAt !== null && originalSpendableAt.getTime() > input.now.getTime()) {
        const pending = pendingEntries.find((entry) => entry.key === row.reversesEntryId && !entry.reversed);
        if (pending) pending.reversed = true;
      }
    }
  }
  const standing = pendingEntries.filter((entry) => !entry.reversed);
  const pendingBalance = standing.reduce((sum, entry) => sum + entry.amount, 0);
  const nextSpendableAt =
    standing.length > 0
      ? standing.reduce((min, entry) => (entry.spendableAt.getTime() < min.getTime() ? entry.spendableAt : min), standing[0].spendableAt)
      : null;
  const projection = createWallet(input.householdId, input.memberId, input.now);
  projection.balance = balance;
  projection.lifetimeEarned = lifetimeEarned;
  projection.pendingBalance = pendingBalance;
  projection.nextSpendableAt = nextSpendableAt;
  projection.xpPeak = input.xpPeak;
  projection.level = levelForXp(input.xpPeak);
  projection.projectionVersion = PROJECTION_VERSION;
  return projection;
}

export type { LedgerRowDraft };
