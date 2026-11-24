// Weekly streaks (C7): counting, folgas, breaks, and milestone ladders.
// "Away" weeks freeze a member streak; a missed week burns a folga or breaks.
// Organizer streaks pause when every member is away.

import type {
  EarnRule,
  EvalContext,
  OrganizerProjection,
  ResultCollector,
  WalletProjection,
} from './types';
import { levelForXp } from './levels';

export interface StreakWeekOutcome {
  changed: boolean;
  counted: boolean;
  usedFolga: boolean;
  broke: boolean;
}

export function applyMemberStreakWeek(input: {
  wallet: WalletProjection;
  weekStart: string;
  counted: boolean;
  away: boolean;
  ctx: EvalContext;
  res: ResultCollector;
}): StreakWeekOutcome {
  const { wallet, weekStart, counted, away, ctx, res } = input;
  const streak = wallet.streak;
  const rule = ctx.rules.streak.member;
  if (away) {
    return { changed: false, counted: false, usedFolga: false, broke: false };
  }
  if (counted) {
    streak.current += 1;
    streak.record = Math.max(streak.record, streak.current);
    streak.lastCountedWeek = weekStart;
    streak.folgaProgress += 1;
    wallet.stats.weeksCounted += 1;
    const folgaCap =
      levelForXp(wallet.xpPeak, ctx.rules.levels.member.base) >= rule.folgaHighLevelFrom
        ? rule.folgaMaxHighLevel
        : rule.folgaMax;
    if (streak.folgaProgress >= rule.folgaEveryWeeks) {
      streak.folgaProgress = 0;
      if (streak.folgas < folgaCap) streak.folgas += 1;
    }
    res.serverEvents.push({
      name: 'gami_streak_week_counted',
      householdId: res.householdId,
      memberId: wallet.memberId,
      data: { current: streak.current, weekStart },
      createdAt: ctx.now,
    });
    return { changed: true, counted: true, usedFolga: false, broke: false };
  }
  if (streak.folgas > 0) {
    streak.folgas -= 1;
    res.serverEvents.push({
      name: 'gami_folga_used',
      householdId: res.householdId,
      memberId: wallet.memberId,
      data: { weekStart },
      createdAt: ctx.now,
    });
    return { changed: true, counted: false, usedFolga: true, broke: false };
  }
  if (streak.current > 0) {
    res.serverEvents.push({
      name: 'gami_streak_broken',
      householdId: res.householdId,
      memberId: wallet.memberId,
      data: { record: streak.record, weekStart },
      createdAt: ctx.now,
    });
    streak.current = 0;
    wallet.stats.streakMilestonesPaid = [];
    return { changed: true, counted: false, usedFolga: false, broke: true };
  }
  return { changed: false, counted: false, usedFolga: false, broke: false };
}

export function applyOrganizerStreakWeek(input: {
  organizer: OrganizerProjection;
  weekStart: string;
  counted: boolean;
  ctx: EvalContext;
  res: ResultCollector;
}): StreakWeekOutcome {
  const { organizer, weekStart, counted, ctx, res } = input;
  const streak = organizer.streak;
  const memberId = organizer.memberId;
  const rule = ctx.rules.streak.organizer;
  if (counted) {
    streak.current += 1;
    streak.record = Math.max(streak.record, streak.current);
    streak.lastCountedWeek = weekStart;
    streak.folgaProgress += 1;
    organizer.stats.weeksCounted += 1;
    if (streak.folgaProgress >= rule.folgaEveryWeeks) {
      streak.folgaProgress = 0;
      if (streak.folgas < rule.folgaMax) streak.folgas += 1;
    }
    res.serverEvents.push({
      name: 'gami_streak_week_counted',
      householdId: res.householdId,
      memberId,
      data: { current: streak.current, weekStart },
      createdAt: ctx.now,
    });
    return { changed: true, counted: true, usedFolga: false, broke: false };
  }
  if (streak.folgas > 0) {
    streak.folgas -= 1;
    res.serverEvents.push({
      name: 'gami_folga_used',
      householdId: res.householdId,
      memberId,
      data: { weekStart },
      createdAt: ctx.now,
    });
    return { changed: true, counted: false, usedFolga: true, broke: false };
  }
  if (streak.current > 0) {
    res.serverEvents.push({
      name: 'gami_streak_broken',
      householdId: res.householdId,
      memberId,
      data: { record: streak.record, weekStart },
      createdAt: ctx.now,
    });
    streak.current = 0;
    organizer.stats.streakMilestonesPaid = [];
    return { changed: true, counted: false, usedFolga: false, broke: true };
  }
  return { changed: false, counted: false, usedFolga: false, broke: false };
}

/**
 * Milestones newly crossed this week (e.g. current 1 -> 2 unlocks milestone 2),
 * excluding ones already paid in this streak run.
 */
export function newlyReachedMilestones(rule: EarnRule, previous: number, current: number, paid: number[]): number[] {
  const milestones = Object.keys(rule.award.milestones ?? {})
    .map(Number)
    .sort((a, b) => a - b);
  return milestones.filter((milestone) => milestone > previous && milestone <= current && !paid.includes(milestone));
}
