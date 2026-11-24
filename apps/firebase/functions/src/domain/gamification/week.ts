// household.week_closed (Parts B/C7): member streaks and rolling stats,
// earn.week_goal, streak milestones, achievements, the organizer's zelo week
// rules and streak, and the undo-rate alert. Streaks and achievements are
// evaluated ONLY here, once per closed week, idempotent per projection via
// streak.lastActionWeek plus the row keys.

import { isSpring, springSeasonKey } from './hemisphere';
import { evaluateMemberAchievements, evaluateOrganizerAchievements } from './achievements';
import { awardFor, applyAwardToWallet, localDateKey, resolvedAmount, whereMatch, LEVEL_UP_COPY_KEY } from './award';
import { organizerLevel } from './levels';
import { applyMemberStreakWeek, applyOrganizerStreakWeek, newlyReachedMilestones } from './streaks';
import { applyAwardToOrganizer, ensureOrganizer, ruleActive, type OrganizerSlot } from './projections';
import { monthOfDateKey } from './weeks';
import type {
  CelebrationPart,
  EvalContext,
  HouseholdWeekClosedEvent,
  ResultCollector,
  WalletProjection,
  WeekMemberStats,
} from './types';

const MILESTONE_WHERE_KEYS = new Set(['memberStreakMilestone', 'organizerStreakMilestone', 'achievementTierUnlocked']);

function totalWeekXp(event: HouseholdWeekClosedEvent): number {
  return Object.values(event.members).reduce((sum, member) => sum + member.xp, 0);
}

/** Where facts that only depend on the household week (zelo rules). */
function householdWeekFacts(event: HouseholdWeekClosedEvent): Record<string, unknown> {
  const members = Object.values(event.members);
  const totalXp = members.reduce((sum, member) => sum + member.xp, 0);
  const membersWithXp = members.filter((member) => member.xp > 0).length;
  const maxXp = members.reduce((max, member) => Math.max(max, member.xp), 0);
  const onTimeRatePercent =
    event.instancesDue > 0 ? (event.instancesOnTime * 100) / event.instancesDue : 0;
  return {
    goalReached: event.goalReached,
    minInstancesDue: event.instancesDue,
    minOnTimeRatePercent: onTimeRatePercent,
    minMembersWithXp: membersWithXp,
    maxTopSharePercent: totalXp > 0 ? (maxXp * 100) / totalXp : 0,
  };
}

function memberGoalSharePercent(event: HouseholdWeekClosedEvent, member: WeekMemberStats): number {
  if (event.weeklyGoalXp === null || event.weeklyGoalXp <= 0) return 0;
  return (member.xp * 100) / event.weeklyGoalXp;
}

export function processWeekClosed(
  event: HouseholdWeekClosedEvent,
  wallet: WalletProjection | null,
  slot: OrganizerSlot | null,
  ctx: EvalContext,
  res: ResultCollector,
): void {
  const weekStart = event.weekStart;
  const actionAt = event.closedAt;
  const dateKey = localDateKey(actionAt, ctx.timeZone);

  if (wallet !== null) processMemberWeek(event, wallet, ctx, res, weekStart, actionAt, dateKey);
  if (slot !== null) processOrganizerWeek(event, slot, ctx, res, weekStart, actionAt, dateKey);
}

function processMemberWeek(
  event: HouseholdWeekClosedEvent,
  wallet: WalletProjection,
  ctx: EvalContext,
  res: ResultCollector,
  weekStart: string,
  actionAt: Date,
  dateKey: string,
): void {
  const memberStats = event.members[wallet.memberId];
  if (!memberStats) return; // not an active member at close time
  if (wallet.streak.lastActionWeek !== null && wallet.streak.lastActionWeek >= weekStart) {
    return; // already processed this week (or a late replay of an older one)
  }

  const streakRule = ctx.rules.streak.member;
  const counted = memberStats.credits >= streakRule.minWeekCredits;
  const away = wallet.streak.awayWeeks?.includes(weekStart) ?? false;
  const previousStreak = wallet.streak.current;

  applyMemberStreakWeek({ wallet, weekStart, counted, away, ctx, res });
  wallet.streak.lastActionWeek = weekStart;
  res.walletDirty = true;

  // Rolling 4-week window for fit and pillar.
  wallet.stats.recentWeeks.push({ weekStart, counted, xp: memberStats.xp });
  if (wallet.stats.recentWeeks.length > 4) wallet.stats.recentWeeks.shift();
  wallet.stats.householdXpByWeek[weekStart] = totalWeekXp(event);
  const weekKeys = Object.keys(wallet.stats.householdXpByWeek).sort();
  while (weekKeys.length > 4) {
    delete wallet.stats.householdXpByWeek[weekKeys.shift() as string];
  }

  // Seasonal stats: spring subtasks (reset between seasons), December goal weeks.
  const seasonKey = springSeasonKey(weekStart, event.timeZone);
  if (wallet.stats.springSeasonKey !== seasonKey) {
    wallet.stats.springSeasonKey = seasonKey;
    wallet.stats.springSubtasks = 0;
  }
  if (isSpring(weekStart, event.timeZone)) {
    wallet.stats.springSubtasks += memberStats.credits;
  }
  if (monthOfDateKey(weekStart) === 12 && event.goalReached) {
    wallet.stats.decemberGoalWeeks += 1;
  }

  const parts: CelebrationPart[] = [];
  let copyKey: string | null = null;
  const memberFacts: Record<string, unknown> = {
    ...householdWeekFacts(event),
    minMemberGoalSharePercent: memberGoalSharePercent(event, memberStats),
  };

  // earn.week_goal and any other generic week rule.
  for (const rule of ctx.rules.earnRules) {
    if (rule.on.kind !== 'household.week_closed' || rule.track !== 'ganhos') continue;
    if (MILESTONE_WHERE_KEYS.has(Object.keys(rule.on.where ?? {})[0] ?? '')) continue; // pipeline rules below
    if (!ruleActive(rule, dateKey, ctx.householdMemberCount)) continue;
    if (!whereMatch(rule.on.where, memberFacts)) continue;
    const outcome = awardFor({
      ctx,
      res,
      rule,
      memberId: wallet.memberId,
      sourceRef: weekStart,
      actionAt,
      baseAmount: resolvedAmount(rule, memberFacts, 0),
      capCtx: { dateKey, weekStart, targetIds: [] },
      capsState: wallet.caps,
    });
    if (!outcome) continue;
    res.walletRows.push(outcome.row);
    applyAwardToWallet(wallet, outcome.row, ctx.now);
    parts.push({ ruleId: rule.id, amount: outcome.awarded });
    if (copyKey === null && rule.celebrate?.moment === 'toast') copyKey = rule.celebrate.copyKey;
  }

  // Streak milestones: once per milestone per run (C4 ladder).
  const milestoneRule = ctx.rules.earnRules.find(
    (rule) =>
      rule.track === 'ganhos' &&
      rule.on.kind === 'household.week_closed' &&
      rule.on.where?.memberStreakMilestone === true &&
      rule.award.milestones !== undefined,
  );
  if (milestoneRule && counted && !away) {
    for (const milestone of newlyReachedMilestones(
      milestoneRule,
      previousStreak,
      wallet.streak.current,
      wallet.stats.streakMilestonesPaid,
    )) {
      const outcome = awardFor({
        ctx,
        res,
        rule: milestoneRule,
        memberId: wallet.memberId,
        sourceRef: `${weekStart}#${milestone}`,
        actionAt,
        baseAmount: milestoneRule.award.milestones?.[String(milestone)] ?? 0,
        capCtx: { dateKey, weekStart, targetIds: [] },
        capsState: wallet.caps,
      });
      if (!outcome) continue;
      res.walletRows.push(outcome.row);
      applyAwardToWallet(wallet, outcome.row, ctx.now);
      wallet.stats.streakMilestonesPaid.push(milestone);
      parts.push({ ruleId: milestoneRule.id, amount: outcome.awarded });
      res.celebrations.push({
        id: `cel:streak:${weekStart}:${milestone}:${wallet.memberId}`,
        moment: 'streak',
        track: 'ganhos',
        amount: outcome.awarded,
        copyKey: milestoneRule.celebrate?.copyKey ?? 'gami.streak.milestone',
        data: { milestone },
      });
      res.serverEvents.push({
        name: 'gami_milestone',
        householdId: res.householdId,
        memberId: wallet.memberId,
        data: { milestone, amount: outcome.awarded },
        createdAt: ctx.now,
      });
    }
  }

  // C7: achievements are evaluated here, once per closed week.
  evaluateMemberAchievements(wallet, ctx, res, actionAt);

  if (parts.length > 0) {
    const amount = parts.reduce((sum, part) => sum + part.amount, 0);
    res.celebrations.push({
      id: `cel:toast:${weekStart}:${wallet.memberId}`,
      moment: 'toast',
      track: 'ganhos',
      amount,
      parts,
      copyKey: copyKey ?? 'gami.earn.week_goal',
    });
    res.serverEvents.push({
      name: 'gami_earned',
      householdId: res.householdId,
      memberId: wallet.memberId,
      data: { ruleIds: parts.map((part) => part.ruleId).join(','), amount },
      createdAt: ctx.now,
    });
  }

  res.serverEvents.push({
    name: 'gami_week_closed',
    householdId: res.householdId,
    memberId: wallet.memberId,
    data: { weekStart, weekEnd: event.weekEnd, counted },
    createdAt: ctx.now,
  });

  // C9: undo + revoke rate above 30% in the week.
  const gross = memberStats.credits + memberStats.undoCount + memberStats.revokeCount;
  if (gross > 0 && (memberStats.undoCount + memberStats.revokeCount) / gross > 0.3) {
    res.alerts.push({
      kind: 'undo-rate',
      householdId: res.householdId,
      memberId: wallet.memberId,
      data: {
        weekStart,
        undos: memberStats.undoCount,
        revokes: memberStats.revokeCount,
        credits: memberStats.credits,
      },
      createdAt: ctx.now,
    });
  }
}

function processOrganizerWeek(
  event: HouseholdWeekClosedEvent,
  slot: OrganizerSlot,
  ctx: EvalContext,
  res: ResultCollector,
  weekStart: string,
  actionAt: Date,
  dateKey: string,
): void {
  const organizer = ensureOrganizer(slot, event.householdId, ctx, res);
  if (organizer.streak.lastActionWeek !== null && organizer.streak.lastActionWeek >= weekStart) {
    return; // idempotent: this week already processed
  }

  const streakRule = ctx.rules.streak.organizer;
  const ratePercent =
    event.instancesDue > 0 ? (event.instancesOnTime * 100) / event.instancesDue : 0;
  const counted =
    event.instancesDue >= streakRule.minWeekInstancesDue &&
    ratePercent >= streakRule.minOnTimeRatePercent;
  const previousStreak = organizer.streak.current;

  if (!event.allAway) {
    applyOrganizerStreakWeek({ organizer, weekStart, counted, ctx, res });
  }
  organizer.streak.lastActionWeek = weekStart;
  res.organizerDirty = true;

  // Rolling stats for maestro and order.
  organizer.stats.orderWeeks.push({ weekStart, due: event.instancesDue, onTime: event.instancesOnTime });
  if (organizer.stats.orderWeeks.length > 4) organizer.stats.orderWeeks.shift();
  if (event.instancesDue >= streakRule.minWeekInstancesDue && ratePercent >= 90) {
    organizer.stats.maestroWeeks += 1;
  }

  const levelBefore = organizer.level;
  const facts = householdWeekFacts(event);
  const zeloParts: CelebrationPart[] = [];

  // zelo.on_time and zelo.even_split (plus any custom week zelo rules).
  for (const rule of ctx.rules.earnRules) {
    if (rule.on.kind !== 'household.week_closed' || rule.track !== 'zelo') continue;
    if (rule.on.where?.organizerStreakMilestone === true) continue; // milestone pipeline below
    if (!ruleActive(rule, dateKey, ctx.householdMemberCount)) continue;
    if (!whereMatch(rule.on.where, facts)) continue;
    const outcome = awardFor({
      ctx,
      res,
      rule,
      memberId: ctx.creatorUid,
      sourceRef: weekStart,
      actionAt,
      baseAmount: resolvedAmount(rule, facts, 0),
      capCtx: { dateKey, weekStart, targetIds: [] },
      capsState: organizer.caps,
    });
    if (!outcome) continue;
    res.zeloRows.push(outcome.row);
    applyAwardToOrganizer(organizer, outcome.awarded, ctx.rules);
    zeloParts.push({ ruleId: rule.id, amount: outcome.awarded });
    if (rule.id === 'zelo.even_split') organizer.stats.evenSplitWeeks += 1;
  }

  // Organizer streak milestones (C5 ladder), once per milestone per run.
  const milestoneRule = ctx.rules.earnRules.find(
    (rule) =>
      rule.track === 'zelo' &&
      rule.on.kind === 'household.week_closed' &&
      rule.on.where?.organizerStreakMilestone === true &&
      rule.award.milestones !== undefined,
  );
  if (milestoneRule && counted && !event.allAway) {
    for (const milestone of newlyReachedMilestones(
      milestoneRule,
      previousStreak,
      organizer.streak.current,
      organizer.stats.streakMilestonesPaid,
    )) {
      const outcome = awardFor({
        ctx,
        res,
        rule: milestoneRule,
        memberId: ctx.creatorUid,
        sourceRef: `${weekStart}#${milestone}`,
        actionAt,
        baseAmount: milestoneRule.award.milestones?.[String(milestone)] ?? 0,
        capCtx: { dateKey, weekStart, targetIds: [] },
        capsState: organizer.caps,
      });
      if (!outcome) continue;
      res.zeloRows.push(outcome.row);
      applyAwardToOrganizer(organizer, outcome.awarded, ctx.rules);
      organizer.stats.streakMilestonesPaid.push(milestone);
      zeloParts.push({ ruleId: milestoneRule.id, amount: outcome.awarded });
      res.serverEvents.push({
        name: 'gami_milestone',
        householdId: res.householdId,
        memberId: ctx.creatorUid,
        data: { milestone, amount: outcome.awarded },
        createdAt: ctx.now,
      });
    }
  }

  // C7: organizer achievements evaluated at week close; they pay no Ganhos.
  evaluateOrganizerAchievements(organizer, ctx, res, actionAt);

  if (zeloParts.length > 0) {
    const amount = zeloParts.reduce((sum, part) => sum + part.amount, 0);
    res.celebrations.push({
      id: `cel:toast:zelo:${weekStart}:${ctx.creatorUid}`,
      moment: 'toast',
      track: 'zelo',
      amount,
      parts: zeloParts,
      copyKey: 'gami.zelo.earned',
    });
    res.serverEvents.push({
      name: 'gami_earned',
      householdId: res.householdId,
      memberId: ctx.creatorUid,
      data: { ruleIds: zeloParts.map((part) => part.ruleId).join(','), amount },
      createdAt: ctx.now,
    });
  }

  // Organizer level-up: zelo crossed a threshold this week.
  const levelAfter = organizerLevel(organizer.zelo, ctx.rules.levels.organizer.thresholds).level;
  organizer.level = levelAfter;
  if (levelAfter > levelBefore) {
    res.celebrations.push({
      id: `cel:level:${levelAfter}:${ctx.creatorUid}`,
      moment: 'level',
      track: 'zelo',
      level: levelAfter,
      copyKey: LEVEL_UP_COPY_KEY,
    });
    res.serverEvents.push({
      name: 'gami_level_up',
      householdId: res.householdId,
      memberId: ctx.creatorUid,
      data: { level: levelAfter },
      createdAt: ctx.now,
    });
    res.organizerDirty = true;
  }
}
