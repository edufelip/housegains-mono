// Flat earn events: ledger.subtask, ledger.bonus, instance.completed_on_time
// and feed.post, plus the welcome pipeline and the zelo rules that ride on
// subtask completions (zelo.chore_done, zelo.member_activated).

import type { CapContext } from './caps';
import {
  awardFor,
  applyAwardToWallet,
  baseAmountFor,
  bumpXpPeak,
  choreRecentlyUpdated,
  localDateKey,
  whereMatch,
  HOUR_MS,
  DAY_MS,
} from './award';
import { ensureOrganizer, applyAwardToOrganizer, ruleActive, type OrganizerSlot } from './projections';
import { weekStartKeyForDateKey } from './weeks';
import type {
  CelebrationPart,
  EarnRule,
  EvalContext,
  FeedPostEvent,
  InstanceCompletedOnTimeEvent,
  LedgerBonusEvent,
  LedgerSubtaskEvent,
  ResultCollector,
  WalletProjection,
} from './types';

/** Where keys the engine consumes as parameters, not as facts. */
const SUBTASK_PARAMS = new Set(['joinedWithinDays', 'requiredCredits']);

function subtaskFacts(
  rule: EarnRule,
  event: LedgerSubtaskEvent,
  wallet: WalletProjection,
  ctx: EvalContext,
  actionAt: Date,
): Record<string, unknown> {
  const where = rule.on.where ?? {};
  const requiredCredits = typeof where.requiredCredits === 'number' ? where.requiredCredits : 3;
  const joinedWithinDays = typeof where.joinedWithinDays === 'number' ? where.joinedWithinDays : 14;
  const joinedDays = event.memberJoinedAt
    ? (actionAt.getTime() - event.memberJoinedAt.getTime()) / DAY_MS
    : Number.POSITIVE_INFINITY;
  return {
    isAssist: event.isAssist,
    firstNonCreatorCompletion: event.memberId !== ctx.creatorUid && event.choreCreatedBy === ctx.creatorUid,
    newMemberActivation: wallet.stats.credits + 1 >= requiredCredits && joinedDays <= joinedWithinDays,
    paidAtFirstSubtaskCredit: !wallet.stats.welcomePaid,
  };
}

function targetIdsFor(rule: EarnRule, event: LedgerSubtaskEvent): string[] {
  const target = rule.caps.find((cap) => cap.target === 'assignee')?.target;
  if (target === 'assignee') return event.assigneeIds.filter((id) => id !== event.memberId);
  const choreTarget = rule.caps.find((cap) => cap.target === 'chore')?.target;
  if (choreTarget === 'chore') return [event.choreId];
  return [];
}

function sourceRefFor(rule: EarnRule, event: LedgerSubtaskEvent): string {
  if (rule.ref === 'chore') return event.choreId;
  if (rule.ref === 'member') return event.memberId;
  if (rule.ref === 'instance') return event.instanceId;
  return event.ledgerRowId;
}

export function processSubtaskEvent(
  event: LedgerSubtaskEvent,
  wallet: WalletProjection,
  walletExisted: boolean,
  slot: OrganizerSlot | null,
  ctx: EvalContext,
  res: ResultCollector,
): void {
  const actionAt = event.completedAt;
  const dateKey = localDateKey(actionAt, ctx.timeZone);
  const weekStart = weekStartKeyForDateKey(dateKey);
  const cooldown = choreRecentlyUpdated(
    event.choreUpdatedAt,
    actionAt,
    ctx.rules.caps.newChoreCooldownHours,
  );
  // Idempotency: a replayed XP ledger row must change nothing at all.
  if (ctx.existingKeys.has(`${'earn.subtask'}:${event.ledgerRowId}:${event.memberId}`)) return;

  const ganhosParts: CelebrationPart[] = [];
  const zeloParts: CelebrationPart[] = [];
  let copyKey: string | null = null;
  let zeloCopyKey: string | null = null;
  let primaryAwarded = false;

  for (const rule of ctx.rules.earnRules) {
    if (rule.on.kind !== 'ledger.subtask') continue;
    if (!ruleActive(rule, dateKey, ctx.householdMemberCount)) continue;
    if (!whereMatch(rule.on.where, subtaskFacts(rule, event, wallet, ctx, actionAt), SUBTASK_PARAMS)) continue;
    if (rule.track === 'ganhos' && cooldown) continue; // C4: new chores mint no Ganhos
    const capCtx: CapContext = {
      dateKey,
      weekStart,
      instanceId: event.instanceId,
      targetIds: targetIdsFor(rule, event),
    };
    if (rule.track === 'zelo') {
      if (slot === null) continue; // no organizer context this call
      const organizer = ensureOrganizer(slot, event.householdId, ctx, res);
      const outcome = awardFor({
        ctx,
        res,
        rule,
        memberId: ctx.creatorUid,
        sourceRef: sourceRefFor(rule, event),
        actionAt,
        baseAmount: baseAmountFor(rule, event.amount),
        capCtx,
        capsState: organizer.caps,
      });
      if (!outcome) continue;
      res.zeloRows.push(outcome.row);
      applyAwardToOrganizer(organizer, outcome.awarded, ctx.rules);
      if (rule.id === 'zelo.member_activated') organizer.stats.membersActivated += 1;
      zeloParts.push({ ruleId: rule.id, amount: outcome.awarded });
      if (zeloCopyKey === null && rule.celebrate?.moment === 'toast') zeloCopyKey = rule.celebrate.copyKey;
      res.organizerDirty = true;
      continue;
    }
    const outcome = awardFor({
      ctx,
      res,
      rule,
      memberId: event.memberId,
      sourceRef: sourceRefFor(rule, event),
      actionAt,
      baseAmount: baseAmountFor(rule, event.amount),
      capCtx,
      capsState: wallet.caps,
    });
    if (!outcome) continue;
    res.walletRows.push(outcome.row);
    applyAwardToWallet(wallet, outcome.row, ctx.now);
    if (rule.id === 'earn.subtask') primaryAwarded = true;
    ganhosParts.push({ ruleId: rule.id, amount: outcome.awarded });
    if (copyKey === null && rule.celebrate?.moment === 'toast') copyKey = rule.celebrate.copyKey;
    res.walletDirty = true;
  }

  // Welcome (C4): declared on member.joined, paid at the first subtask credit.
  const welcomeRule = ctx.rules.earnRules.find(
    (rule) => rule.on.kind === 'member.joined' && rule.on.where?.paidAtFirstSubtaskCredit === true,
  );
  if (
    welcomeRule &&
    !wallet.stats.welcomePaid &&
    ruleActive(welcomeRule, dateKey, ctx.householdMemberCount)
  ) {
    const outcome = awardFor({
      ctx,
      res,
      rule: welcomeRule,
      memberId: event.memberId,
      sourceRef: event.ledgerRowId,
      actionAt,
      baseAmount: welcomeRule.award.amount,
      capCtx: { dateKey, weekStart, targetIds: [] },
      capsState: wallet.caps,
    });
    if (outcome) {
      res.walletRows.push(outcome.row);
      applyAwardToWallet(wallet, outcome.row, ctx.now);
      wallet.stats.welcomePaid = true;
      ganhosParts.push({ ruleId: welcomeRule.id, amount: outcome.awarded });
      if (copyKey === null && welcomeRule.celebrate?.moment === 'toast') {
        copyKey = welcomeRule.celebrate.copyKey;
      }
      res.walletDirty = true;
    }
  }

  if (primaryAwarded) {
    wallet.stats.credits += 1;
    if (event.isAssist) wallet.stats.assists += 1;
    if (event.isFinalCompleter) wallet.stats.finals += 1;
    if (event.category) {
      wallet.stats.categories[event.category] = (wallet.stats.categories[event.category] ?? 0) + 1;
    }
    if (event.choreIsCustom && slot) {
      const organizer = ensureOrganizer(slot, event.householdId, ctx, res);
      organizer.stats.customChoreCompletions[event.choreId] =
        (organizer.stats.customChoreCompletions[event.choreId] ?? 0) + 1;
      res.organizerDirty = true;
    }
    res.walletDirty = true;
  }

  bumpXpPeak(wallet, event.xpPeakAfter, ctx, res, walletExisted);

  // C9 velocity: more than 12 subtask credits in 10 minutes by one member.
  const stamps = event.recentSubtaskTimestamps ?? [];
  const velocityCount = stamps.filter(
    (stamp) => stamp.getTime() >= actionAt.getTime() - 10 * 60 * 1000 && stamp.getTime() <= actionAt.getTime(),
  ).length;
  if (velocityCount > 12) {
    res.alerts.push({
      kind: 'velocity',
      householdId: res.householdId,
      memberId: event.memberId,
      data: { count: velocityCount, windowMinutes: 10 },
      createdAt: ctx.now,
    });
  }
  // C9: chore XP raised, then completed by the creator within 48h.
  if (
    event.choreXpRaised &&
    event.memberId === ctx.creatorUid &&
    event.choreUpdatedAt !== null &&
    actionAt.getTime() - event.choreUpdatedAt.getTime() <= 48 * HOUR_MS
  ) {
    res.alerts.push({
      kind: 'chore-xp-raise',
      householdId: res.householdId,
      memberId: event.memberId,
      data: { choreId: event.choreId },
      createdAt: ctx.now,
    });
  }

  if (ganhosParts.length > 0) {
    const amount = ganhosParts.reduce((sum, part) => sum + part.amount, 0);
    res.celebrations.push({
      id: `cel:toast:${event.ledgerRowId}:${event.memberId}`,
      moment: 'toast',
      track: 'ganhos',
      amount,
      parts: ganhosParts,
      copyKey: copyKey ?? 'gami.earn.chore',
    });
    res.serverEvents.push({
      name: 'gami_earned',
      householdId: res.householdId,
      memberId: event.memberId,
      data: { ruleIds: ganhosParts.map((part) => part.ruleId).join(','), amount },
      createdAt: ctx.now,
    });
  }
  if (zeloParts.length > 0) {
    const amount = zeloParts.reduce((sum, part) => sum + part.amount, 0);
    res.celebrations.push({
      id: `cel:toast:zelo:${event.ledgerRowId}:${ctx.creatorUid}`,
      moment: 'toast',
      track: 'zelo',
      amount,
      parts: zeloParts,
      copyKey: zeloCopyKey ?? 'gami.zelo.earned',
    });
    res.serverEvents.push({
      name: 'gami_earned',
      householdId: res.householdId,
      memberId: ctx.creatorUid,
      data: { ruleIds: zeloParts.map((part) => part.ruleId).join(','), amount },
      createdAt: ctx.now,
    });
  }
}

export function processBonusEvent(
  event: LedgerBonusEvent,
  wallet: WalletProjection,
  walletExisted: boolean,
  ctx: EvalContext,
  res: ResultCollector,
): void {
  const actionAt = event.completedAt;
  const dateKey = localDateKey(actionAt, ctx.timeZone);
  const weekStart = weekStartKeyForDateKey(dateKey);
  const cooldown = choreRecentlyUpdated(
    event.choreUpdatedAt,
    actionAt,
    ctx.rules.caps.newChoreCooldownHours,
  );
  if (ctx.existingKeys.has(`earn.bonus:${event.ledgerRowId}:${event.memberId}`)) return;

  const parts: CelebrationPart[] = [];
  let copyKey: string | null = null;
  for (const rule of ctx.rules.earnRules) {
    if (rule.on.kind !== 'ledger.bonus' || rule.track !== 'ganhos') continue;
    if (!ruleActive(rule, dateKey, ctx.householdMemberCount)) continue;
    if (cooldown) continue;
    const outcome = awardFor({
      ctx,
      res,
      rule,
      memberId: event.memberId,
      sourceRef: event.ledgerRowId,
      actionAt,
      baseAmount: baseAmountFor(rule, event.amount),
      capCtx: { dateKey, weekStart, instanceId: event.instanceId, targetIds: [] },
      capsState: wallet.caps,
    });
    if (!outcome) continue;
    res.walletRows.push(outcome.row);
    applyAwardToWallet(wallet, outcome.row, ctx.now);
    parts.push({ ruleId: rule.id, amount: outcome.awarded });
    if (copyKey === null && rule.celebrate?.moment === 'toast') copyKey = rule.celebrate.copyKey;
    res.walletDirty = true;
  }

  bumpXpPeak(wallet, event.xpPeakAfter, ctx, res, walletExisted);

  if (parts.length > 0) {
    const amount = parts.reduce((sum, part) => sum + part.amount, 0);
    res.celebrations.push({
      id: `cel:toast:${event.ledgerRowId}:${event.memberId}`,
      moment: 'toast',
      track: 'ganhos',
      amount,
      parts,
      copyKey: copyKey ?? 'gami.earn.bonus',
    });
    res.serverEvents.push({
      name: 'gami_earned',
      householdId: res.householdId,
      memberId: event.memberId,
      data: { ruleIds: parts.map((part) => part.ruleId).join(','), amount },
      createdAt: ctx.now,
    });
  }
}

export function processOnTimeEvent(
  event: InstanceCompletedOnTimeEvent,
  wallet: WalletProjection,
  ctx: EvalContext,
  res: ResultCollector,
): void {
  // Eligibility (C4): member in assigneeIds who contributed. A member without
  // a wallet never contributed, so the wiring can skip those calls.
  if (!event.assigneeIds.includes(wallet.memberId) || !event.contributorIds.includes(wallet.memberId)) {
    return;
  }
  const actionAt = event.completedAt;
  const dateKey = localDateKey(actionAt, ctx.timeZone);
  const weekStart = weekStartKeyForDateKey(dateKey);
  const sourceRef = `${event.instanceId}/${event.finalRowId}`;
  if (ctx.existingKeys.has(`earn.on_time:${sourceRef.replace(/\//g, '|')}:${wallet.memberId}`)) return;
  const cooldown = choreRecentlyUpdated(
    event.choreUpdatedAt,
    actionAt,
    ctx.rules.caps.newChoreCooldownHours,
  );

  const parts: CelebrationPart[] = [];
  let copyKey: string | null = null;
  let awarded = false;
  for (const rule of ctx.rules.earnRules) {
    if (rule.on.kind !== 'instance.completed_on_time' || rule.track !== 'ganhos') continue;
    if (!ruleActive(rule, dateKey, ctx.householdMemberCount)) continue;
    if (cooldown) continue;
    const outcome = awardFor({
      ctx,
      res,
      rule,
      memberId: wallet.memberId,
      sourceRef,
      actionAt,
      baseAmount: baseAmountFor(rule, 0),
      capCtx: { dateKey, weekStart, targetIds: [] },
      capsState: wallet.caps,
    });
    if (!outcome) continue;
    res.walletRows.push(outcome.row);
    applyAwardToWallet(wallet, outcome.row, ctx.now);
    awarded = true;
    parts.push({ ruleId: rule.id, amount: outcome.awarded });
    if (copyKey === null && rule.celebrate?.moment === 'toast') copyKey = rule.celebrate.copyKey;
    res.walletDirty = true;
  }
  if (awarded) {
    wallet.stats.onTime += 1;
  }

  if (parts.length > 0) {
    const amount = parts.reduce((sum, part) => sum + part.amount, 0);
    res.celebrations.push({
      id: `cel:toast:${event.instanceId}:${wallet.memberId}`,
      moment: 'toast',
      track: 'ganhos',
      amount,
      parts,
      copyKey: copyKey ?? 'gami.earn.on_time',
    });
    res.serverEvents.push({
      name: 'gami_earned',
      householdId: res.householdId,
      memberId: wallet.memberId,
      data: { ruleIds: parts.map((part) => part.ruleId).join(','), amount },
      createdAt: ctx.now,
    });
  }
}

export function processShareEvent(
  event: FeedPostEvent,
  wallet: WalletProjection,
  ctx: EvalContext,
  res: ResultCollector,
): void {
  const actionAt = event.postedAt;
  const dateKey = localDateKey(actionAt, ctx.timeZone);
  const weekStart = weekStartKeyForDateKey(dateKey);
  if (ctx.existingKeys.has(`earn.share:${event.postId}:${event.memberId}`)) return;

  const parts: CelebrationPart[] = [];
  let copyKey: string | null = null;
  for (const rule of ctx.rules.earnRules) {
    if (rule.on.kind !== 'feed.post' || rule.track !== 'ganhos') continue;
    if (!ruleActive(rule, dateKey, ctx.householdMemberCount)) continue;
    const outcome = awardFor({
      ctx,
      res,
      rule,
      memberId: event.memberId,
      sourceRef: event.postId,
      actionAt,
      baseAmount: baseAmountFor(rule, 0),
      capCtx: { dateKey, weekStart, targetIds: [] },
      capsState: wallet.caps,
    });
    if (!outcome) continue;
    res.walletRows.push(outcome.row);
    applyAwardToWallet(wallet, outcome.row, ctx.now);
    parts.push({ ruleId: rule.id, amount: outcome.awarded });
    if (copyKey === null && rule.celebrate?.moment === 'toast') copyKey = rule.celebrate.copyKey;
    res.walletDirty = true;
  }

  if (parts.length > 0) {
    const amount = parts.reduce((sum, part) => sum + part.amount, 0);
    res.celebrations.push({
      id: `cel:toast:${event.postId}:${event.memberId}`,
      moment: 'toast',
      track: 'ganhos',
      amount,
      parts,
      copyKey: copyKey ?? 'gami.earn.share',
    });
    res.serverEvents.push({
      name: 'gami_earned',
      householdId: res.householdId,
      memberId: event.memberId,
      data: { ruleIds: parts.map((part) => part.ruleId).join(','), amount },
      createdAt: ctx.now,
    });
  }
}
