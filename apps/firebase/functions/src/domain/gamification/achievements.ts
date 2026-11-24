// Achievements (C7), evaluated on household.week_closed. Fixed achievements
// unlock and upgrade tiers and pay earn.achievement once per tier for life;
// active badges (fit, pillar, order) toggle `active` and only pay the first
// unlock; organizer achievements pay no Ganhos.

import { awardFor, applyAwardToWallet, localDateKey } from './award';
import { weekStartKeyForDateKey } from './weeks';
import type {
  AchievementDef,
  Celebration,
  EarnRule,
  EvalContext,
  OrganizerProjection,
  ResultCollector,
  Tier,
  WalletProjection,
} from './types';

const TIER_ORDER: Tier[] = ['bronze', 'silver', 'gold'];

function memberMetricValue(def: AchievementDef, wallet: WalletProjection): number {
  switch (def.metric) {
    case 'assists':
      return wallet.stats.assists;
    case 'finals':
      return wallet.stats.finals;
    case 'onTime':
      return wallet.stats.onTime;
    case 'streakWeeks':
      return wallet.streak.current;
    case 'fitRecentWeeks':
      return wallet.stats.recentWeeks.filter((week) => week.counted).length;
    case 'pillarSharePercent': {
      // "Over the last 28 days": the window must exist before a share counts.
      if (wallet.stats.recentWeeks.length < 4) return 0;
      const memberXp = wallet.stats.recentWeeks.reduce((sum, week) => sum + week.xp, 0);
      let householdXp = 0;
      for (const week of wallet.stats.recentWeeks) {
        householdXp += wallet.stats.householdXpByWeek[week.weekStart] ?? 0;
      }
      return householdXp > 0 ? (memberXp * 100) / householdXp : 0;
    }
    case 'springSubtasks':
      return wallet.stats.springSubtasks;
    case 'decemberGoalWeeks':
      return wallet.stats.decemberGoalWeeks;
    default:
      if (def.metric.startsWith('category.')) {
        return wallet.stats.categories[def.metric.slice('category.'.length)] ?? 0;
      }
      return 0;
  }
}

function organizerMetricValue(def: AchievementDef, organizer: OrganizerProjection): number {
  switch (def.metric) {
    case 'membersActivated':
      return organizer.stats.membersActivated;
    case 'maestroWeeks':
      return organizer.stats.maestroWeeks;
    case 'evenSplitWeeks':
      return organizer.stats.evenSplitWeeks;
    case 'customChoresDone10':
      return Object.values(organizer.stats.customChoreCompletions).filter((count) => count >= 10).length;
    case 'orderRatePercent': {
      const weeks = organizer.stats.orderWeeks;
      if (weeks.length < 4) return 0;
      const due = weeks.reduce((sum, week) => sum + week.due, 0);
      const onTime = weeks.reduce((sum, week) => sum + week.onTime, 0);
      return due > 0 ? (onTime * 100) / due : 0;
    }
    default:
      return 0;
  }
}

/** Highest tier whose threshold the value reaches, or null. */
function targetTier(def: AchievementDef, value: number): Tier | null {
  let target: Tier | null = null;
  for (const tier of TIER_ORDER) {
    const threshold = def.tiers[tier];
    if (typeof threshold === 'number' && threshold <= value) target = tier;
  }
  return target;
}

function payRuleFor(ctx: EvalContext): EarnRule | undefined {
  return ctx.rules.earnRules.find(
    (rule) =>
      rule.on.kind === 'household.week_closed' &&
      rule.on.where?.achievementTierUnlocked === true &&
      rule.track === 'ganhos',
  );
}

function badgeCelebration(input: {
  achievementId: string;
  tier: Tier;
  memberId: string;
  track: 'ganhos' | 'zelo';
  amount?: number;
  copyKey: string;
}): Celebration {
  return {
    id: `cel:badge:${input.achievementId}:${input.memberId}`,
    moment: 'badge',
    track: input.track,
    achievementId: input.achievementId,
    tier: input.tier,
    fullScreen: input.tier !== 'bronze',
    copyKey: input.copyKey,
    ...(input.amount === undefined ? {} : { amount: input.amount }),
  };
}

export function evaluateMemberAchievements(
  wallet: WalletProjection,
  ctx: EvalContext,
  res: ResultCollector,
  actionAt: Date,
): void {
  const payRule = payRuleFor(ctx);
  const dateKey = localDateKey(actionAt, ctx.timeZone);
  const weekStart = weekStartKeyForDateKey(dateKey);
  for (const def of ctx.rules.achievements) {
    if (def.track !== 'member') continue;
    const value = memberMetricValue(def, wallet);
    const target = targetTier(def, value);
    const state = wallet.achievements[def.id];

    if (def.active) {
      // Active badge: on/off follows the metric; pays only the first unlock.
      if (target === null) {
        if (state && state.active !== false) {
          state.active = false;
          res.serverEvents.push({
            name: 'gami_achievement_lost',
            householdId: res.householdId,
            memberId: wallet.memberId,
            data: { achievementId: def.id },
            createdAt: ctx.now,
          });
          res.walletDirty = true;
        }
        continue;
      }
      if (!state) {
        wallet.achievements[def.id] = { tier: target, unlockedAt: ctx.now, active: true };
        res.walletDirty = true;
        let paid: number | undefined;
        if (payRule) {
          const outcome = awardFor({
            ctx,
            res,
            rule: payRule,
            memberId: wallet.memberId,
            sourceRef: `${def.id}#${target}`,
            actionAt,
            baseAmount: payRule.award.tiers?.[target] ?? payRule.award.amount,
            capCtx: { dateKey, weekStart, targetIds: [] },
            capsState: wallet.caps,
          });
          if (outcome) {
            res.walletRows.push(outcome.row);
            applyAwardToWallet(wallet, outcome.row, ctx.now);
            paid = outcome.awarded;
          }
        }
        res.celebrations.push(
          badgeCelebration({
            achievementId: def.id,
            tier: target,
            memberId: wallet.memberId,
            track: 'ganhos',
            copyKey: payRule?.celebrate?.copyKey ?? 'gami.achievement.unlocked',
            ...(paid === undefined ? {} : { amount: paid }),
          }),
        );
        res.serverEvents.push({
          name: 'gami_achievement_unlocked',
          householdId: res.householdId,
          memberId: wallet.memberId,
          data: { achievementId: def.id, tier: target },
          createdAt: ctx.now,
        });
      } else if (state.active !== true) {
        state.active = true;
        res.walletDirty = true;
      }
      continue;
    }

    // Fixed achievement: unlock once, upgrade tiers, never downgrade.
    if (target === null) continue;
    if (!state) {
      wallet.achievements[def.id] = { tier: target, unlockedAt: ctx.now };
      res.walletDirty = true;
    } else if (TIER_ORDER.indexOf(target) <= TIER_ORDER.indexOf(state.tier)) {
      continue;
    } else {
      state.tier = target;
      state.unlockedAt = ctx.now;
      res.walletDirty = true;
    }
    let paid: number | undefined;
    if (payRule) {
      const outcome = awardFor({
        ctx,
        res,
        rule: payRule,
        memberId: wallet.memberId,
        sourceRef: `${def.id}#${target}`,
        actionAt,
        baseAmount: payRule.award.tiers?.[target] ?? payRule.award.amount,
        capCtx: { dateKey, weekStart, targetIds: [] },
        capsState: wallet.caps,
      });
      if (outcome) {
        res.walletRows.push(outcome.row);
        applyAwardToWallet(wallet, outcome.row, ctx.now);
        paid = outcome.awarded;
      }
    }
    res.celebrations.push(
      badgeCelebration({
        achievementId: def.id,
        tier: target,
        memberId: wallet.memberId,
        track: 'ganhos',
        copyKey: payRule?.celebrate?.copyKey ?? 'gami.achievement.unlocked',
        ...(paid === undefined ? {} : { amount: paid }),
      }),
    );
    res.serverEvents.push({
      name: 'gami_achievement_unlocked',
      householdId: res.householdId,
      memberId: wallet.memberId,
      data: { achievementId: def.id, tier: target },
      createdAt: ctx.now,
    });
  }
}

export function evaluateOrganizerAchievements(
  organizer: OrganizerProjection,
  ctx: EvalContext,
  res: ResultCollector,
  actionAt: Date,
): void {
  for (const def of ctx.rules.achievements) {
    if (def.track !== 'organizer') continue;
    const value = organizerMetricValue(def, organizer);
    const target = targetTier(def, value);
    const state = organizer.achievements[def.id];

    if (def.active) {
      if (target === null) {
        if (state && state.active !== false) {
          state.active = false;
          res.serverEvents.push({
            name: 'gami_achievement_lost',
            householdId: res.householdId,
            memberId: organizer.memberId,
            data: { achievementId: def.id },
            createdAt: ctx.now,
          });
          res.organizerDirty = true;
        }
        continue;
      }
      if (!state) {
        organizer.achievements[def.id] = { tier: target, unlockedAt: ctx.now, active: true };
        res.organizerDirty = true;
        res.celebrations.push(
          badgeCelebration({
            achievementId: def.id,
            tier: target,
            memberId: organizer.memberId,
            track: 'zelo',
            copyKey: 'gami.achievement.unlocked',
          }),
        );
        res.serverEvents.push({
          name: 'gami_achievement_unlocked',
          householdId: res.householdId,
          memberId: organizer.memberId,
          data: { achievementId: def.id, tier: target },
          createdAt: ctx.now,
        });
      } else if (state.active !== true) {
        state.active = true;
        res.organizerDirty = true;
      }
      continue;
    }

    if (target === null) continue;
    if (!state) {
      organizer.achievements[def.id] = { tier: target, unlockedAt: ctx.now };
      res.organizerDirty = true;
    } else if (TIER_ORDER.indexOf(target) <= TIER_ORDER.indexOf(state.tier)) {
      continue;
    } else {
      state.tier = target;
      state.unlockedAt = ctx.now;
      res.organizerDirty = true;
    }
    // Organizer achievements pay no Ganhos (C7): badge only.
    res.celebrations.push(
      badgeCelebration({
        achievementId: def.id,
        tier: target,
        memberId: organizer.memberId,
        track: 'zelo',
        copyKey: 'gami.achievement.unlocked',
      }),
    );
    res.serverEvents.push({
      name: 'gami_achievement_unlocked',
      householdId: res.householdId,
      memberId: organizer.memberId,
      data: { achievementId: def.id, tier: target },
      createdAt: ctx.now,
    });
  }
}
