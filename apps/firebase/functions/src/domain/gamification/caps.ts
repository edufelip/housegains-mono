// Cap reservation and restore (C4/C5/C9).
//
// Two kinds of caps share the projection `caps` map:
// - amount pools (dailyGanhos / perInstanceGanhos / weeklyZelo) TRIM an award
//   to the remaining budget;
// - per-rule occurrence caps (3/day, 1/week, once per life, per-target) GATE
//   the award: all-or-nothing, one unit per award.

import {
  dailyGanhosCapKey,
  householdCapKey,
  instanceGanhosCapKey,
  ruleCapKey,
  targetCapKey,
  zeloWeekCapKey,
} from './keys';
import type { CapPool, CapWindow, EarnRule, RuleSet } from './types';

export type CapsState = Record<string, number>;

export interface CapContext {
  /** Local date key of the awarding action. */
  dateKey: string;
  /** Monday of the local week of the awarding action. */
  weekStart: string;
  /** The chore instance for per-instance pools and 'instance' targets. */
  instanceId?: string;
  /** Resolved target ids for 'assignee' / 'chore' targets. */
  targetIds: string[];
}

export interface CapReservation {
  awarded: number;
  changes: Array<[string, number]>;
}

export function periodKeyFor(window: CapWindow, dateKey: string, weekStart: string): string {
  if (window === 'day') return dateKey;
  if (window === 'week') return weekStart;
  return '';
}

function poolSpec(
  pool: CapPool,
  caps: RuleSet['caps'],
  ctx: CapContext,
): { key: string; max: number } | null {
  if (pool === 'dailyGanhos') return { key: dailyGanhosCapKey(ctx.dateKey), max: caps.dailyGanhos };
  if (pool === 'perInstanceGanhos') {
    // A per-instance pool on an event without an instance cannot apply.
    return ctx.instanceId ? { key: instanceGanhosCapKey(ctx.instanceId), max: caps.perInstanceGanhos } : null;
  }
  return { key: zeloWeekCapKey(ctx.weekStart), max: caps.weeklyZelo };
}

/**
 * Applies the rule's caps to `amount`. Returns null when the award is fully
 * blocked; otherwise the (possibly trimmed) award plus the counter changes.
 */
export function reserveCaps(
  state: Readonly<CapsState>,
  capsConfig: RuleSet['caps'],
  rule: EarnRule,
  amount: number,
  ctx: CapContext,
): CapReservation | null {
  if (amount <= 0) return null;
  const poolKeys: string[] = [];
  let awarded = amount;
  for (const cap of rule.caps) {
    if (!cap.pool) continue;
    const spec = poolSpec(cap.pool, capsConfig, ctx);
    if (!spec) continue;
    const remaining = spec.max - (state[spec.key] ?? 0);
    if (remaining <= 0) return null;
    awarded = Math.min(awarded, remaining);
    poolKeys.push(spec.key);
  }
  if (awarded <= 0) return null;
  const changes: Array<[string, number]> = poolKeys.map((key) => [key, awarded]);
  for (const cap of rule.caps) {
    if (cap.pool) continue;
    const period = periodKeyFor(cap.window, ctx.dateKey, ctx.weekStart);
    if (cap.scope === 'member+target') {
      // No targets to key on means the cap can never be satisfied.
      if (ctx.targetIds.length === 0) return null;
      for (const targetId of ctx.targetIds) {
        const key = targetCapKey(rule.id, cap.window, period, targetId);
        if ((state[key] ?? 0) >= cap.max) return null;
        changes.push([key, 1]);
      }
    } else if (cap.scope === 'household' || cap.scope === 'lifetime') {
      const key = householdCapKey(rule.id, cap.window, period);
      if ((state[key] ?? 0) >= cap.max) return null;
      changes.push([key, 1]);
    } else {
      const key = ruleCapKey(rule.id, cap.window, period);
      if ((state[key] ?? 0) >= cap.max) return null;
      changes.push([key, 1]);
    }
  }
  return { awarded, changes };
}

/**
 * Applies cap changes. Restores clamp counters at zero: day- and week-scoped
 * counters are never read again after their period, so over-restoring a stale
 * period is harmless, and exact instance/lifetime counters stay exact.
 */
export function applyCapChanges(
  state: CapsState,
  changes: ReadonlyArray<readonly [string, number]>,
  direction: 1 | -1,
): void {
  for (const [key, delta] of changes) {
    const next = (state[key] ?? 0) + direction * delta;
    state[key] = next > 0 ? next : 0;
  }
}
