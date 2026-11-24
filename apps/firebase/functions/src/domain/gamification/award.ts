// Shared awarding primitives: eligibility, where-matching, campaign
// multipliers, the award/cap/key pipeline, and wallet balance bookkeeping.

import { dateKeyInTimeZone } from '../time';
import { applyCapChanges, reserveCaps, type CapContext, type CapsState } from './caps';
import { levelForXp } from './levels';
import { walletKey } from './keys';
import { weekStartKeyForDateKey } from './weeks';
import type {
  EarnRule,
  EvalContext,
  LedgerRowDraft,
  ResultCollector,
  WalletProjection,
} from './types';

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const LEVEL_UP_COPY_KEY = 'gami.level.up';

export function localDateKey(actionAt: Date, timeZone: string): string {
  return dateKeyInTimeZone(actionAt, timeZone);
}

export function localWeekStart(actionAt: Date, timeZone: string): string {
  return weekStartKeyForDateKey(dateKeyInTimeZone(actionAt, timeZone));
}

/** C4: chores created or edited inside the cooldown mint no Ganhos. */
export function choreRecentlyUpdated(
  choreUpdatedAt: Date | null,
  completedAt: Date,
  cooldownHours: number,
): boolean {
  return (
    choreUpdatedAt !== null &&
    completedAt.getTime() - choreUpdatedAt.getTime() < cooldownHours * HOUR_MS
  );
}

/**
 * Where-clause matching. `min*` keys are minimums, `max*` keys are maximums,
 * everything else is equality. Unknown keys never match (fail safe).
 * `params` are configuration the engine consumed before matching
 * (e.g. joinedWithinDays) and are skipped here.
 */
export function whereMatch(
  where: Record<string, unknown> | undefined,
  facts: Record<string, unknown>,
  params?: ReadonlySet<string>,
): boolean {
  if (!where) return true;
  for (const [key, expected] of Object.entries(where)) {
    if (params?.has(key)) continue;
    const actual = facts[key];
    if (actual === undefined) return false;
    if (key.startsWith('min')) {
      if (!(typeof actual === 'number' && typeof expected === 'number' && actual >= expected)) return false;
    } else if (key.startsWith('max')) {
      if (!(typeof actual === 'number' && typeof expected === 'number' && actual <= expected)) return false;
    } else if (actual !== expected) return false;
  }
  return true;
}

/** Turbo campaigns (C2): the largest active multiplier for the rule wins. */
export function campaignMultiplier(
  ctx: EvalContext,
  ruleId: string,
  dateKey: string,
): number {
  let multiplier = 1;
  for (const campaign of ctx.rules.campaigns) {
    if (!campaign.ruleIds.includes(ruleId)) continue;
    if (dateKey < campaign.activeFrom) continue;
    if (campaign.activeTo !== null && dateKey > campaign.activeTo) continue;
    const min = campaign.audience?.minHouseholdMembers;
    if (typeof min === 'number' && ctx.householdMemberCount < min) continue;
    multiplier = Math.max(multiplier, campaign.multiplier);
  }
  return multiplier;
}

export function baseAmountFor(rule: EarnRule, eventAmount: number): number {
  return rule.award.perXp ? rule.award.amount * eventAmount : rule.award.amount;
}

/** Amount after the first matching override (zelo.on_time >=90% -> 60). */
export function resolvedAmount(rule: EarnRule, facts: Record<string, unknown>, eventAmount: number): number {
  for (const override of rule.award.overrides ?? []) {
    if (whereMatch(override.where, facts)) return override.amount;
  }
  return baseAmountFor(rule, eventAmount);
}

export interface AwardOutcome {
  row: LedgerRowDraft;
  awarded: number;
  changes: ReadonlyArray<readonly [string, number]>;
}

/**
 * The single award pipeline: idempotency (existing + emitted keys), campaign
 * multiplier (rounded down), cap reservation, row draft. Returns null when
 * the award is blocked or already present.
 */
export function awardFor(input: {
  ctx: EvalContext;
  res: ResultCollector;
  rule: EarnRule;
  memberId: string;
  sourceRef: string;
  actionAt: Date;
  baseAmount: number;
  capCtx: CapContext;
  capsState: CapsState;
}): AwardOutcome | null {
  const { ctx, res, rule, memberId, sourceRef, actionAt, baseAmount, capCtx, capsState } = input;
  const key = walletKey(rule.id, sourceRef, memberId);
  if (ctx.existingKeys.has(key) || ctx.emittedKeys.has(key)) return null;
  const multiplier = campaignMultiplier(ctx, rule.id, capCtx.dateKey);
  const amount = Math.floor(baseAmount * multiplier);
  const reservation = reserveCaps(capsState, ctx.rules.caps, rule, amount, capCtx);
  if (!reservation) return null;
  applyCapChanges(capsState, reservation.changes, 1);
  const row: LedgerRowDraft = {
    key,
    ruleId: rule.id,
    ruleSetVersion: ctx.ruleSetVersion,
    track: rule.track,
    amount: reservation.awarded,
    sourceRef,
    householdId: res.householdId,
    memberId,
    createdAt: actionAt,
    spendableAt: new Date(actionAt.getTime() + rule.spendableAfterHours * HOUR_MS),
  };
  ctx.emittedKeys.add(key);
  return { row, awarded: reservation.awarded, changes: reservation.changes };
}

/** Books a positive wallet row: balance, lifetime, pending, next spendable. */
export function applyAwardToWallet(wallet: WalletProjection, row: LedgerRowDraft, now: Date): void {
  wallet.balance += row.amount;
  wallet.lifetimeEarned += row.amount;
  if (row.spendableAt.getTime() > now.getTime()) {
    wallet.pendingBalance += row.amount;
    wallet.nextSpendableAt =
      wallet.nextSpendableAt === null
        ? row.spendableAt
        : new Date(Math.min(wallet.nextSpendableAt.getTime(), row.spendableAt.getTime()));
  }
}

/**
 * Books a negative reversal row. `originalPending` tells whether the reversed
 * award was still pending (known from the original row's awardedAt); null
 * means unknown and the pending balance is only clamped.
 * shortcut: nextSpendableAt is a hint and only resets when pending hits zero.
 */
export function applyReversalToWallet(
  wallet: WalletProjection,
  row: LedgerRowDraft,
  originalPending: boolean | null,
): void {
  wallet.balance += row.amount;
  wallet.lifetimeEarned = Math.max(0, wallet.lifetimeEarned + row.amount);
  if (originalPending === true || originalPending === null) {
    wallet.pendingBalance = Math.max(0, wallet.pendingBalance + row.amount);
    if (wallet.pendingBalance === 0) wallet.nextSpendableAt = null;
  }
}

/**
 * Follows the member's xpPeak (max xp ever, C3) and celebrates level-ups.
 * Level-ups only fire for wallets that already existed: a brand-new wallet
 * starts at its curve level silently.
 */
export function bumpXpPeak(
  wallet: WalletProjection,
  xpPeakAfter: number | null | undefined,
  ctx: EvalContext,
  res: ResultCollector,
  walletExisted: boolean,
): void {
  if (typeof xpPeakAfter !== 'number' || !Number.isFinite(xpPeakAfter)) return;
  if (xpPeakAfter <= wallet.xpPeak) return;
  const base = ctx.rules.levels.member.base;
  const previousLevel = levelForXp(wallet.xpPeak, base);
  wallet.xpPeak = xpPeakAfter;
  wallet.level = levelForXp(xpPeakAfter, base);
  res.walletDirty = true;
  if (!walletExisted || wallet.level <= previousLevel) return;
  res.celebrations.push({
    id: `cel:level:member:${wallet.level}:${wallet.memberId}`,
    moment: 'level',
    track: 'ganhos',
    level: wallet.level,
    copyKey: LEVEL_UP_COPY_KEY,
  });
  res.serverEvents.push({
    name: 'gami_level_up',
    householdId: res.householdId,
    memberId: wallet.memberId,
    data: { level: wallet.level },
    createdAt: ctx.now,
  });
}
