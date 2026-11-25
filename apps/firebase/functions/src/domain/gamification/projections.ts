// Projection lifecycle: deep clones, fresh projections, and the small
// balance/level helpers every engine module shares. The engine never mutates
// caller objects; it clones at the entry point (engine.ts).

import { LEVEL_UP_COPY_KEY, levelUpEventId } from './award';
import { organizerLevel } from './levels';
import type {
  EarnRule,
  EvalContext,
  OrganizerProjection,
  OrganizerStats,
  ResultCollector,
  RuleSet,
  StreakState,
  WalletProjection,
  WalletStats,
} from './types';
import { PROJECTION_VERSION } from './types';

/**
 * The organizer the current evaluate() call works on. `organizer` is null when
 * the household has no projection yet; the slot lets modules create it lazily.
 * A null SLOT means the caller passed no organizer context at all.
 */
export interface OrganizerSlot {
  organizer: OrganizerProjection | null;
}

export function cloneAchievements(achievements: WalletProjection['achievements']): WalletProjection['achievements'] {
  const clone: WalletProjection['achievements'] = {};
  for (const [id, state] of Object.entries(achievements)) {
    clone[id] = { ...state, unlockedAt: state.unlockedAt };
  }
  return clone;
}

export function emptyWalletStats(): WalletStats {
  return {
    assists: 0,
    finals: 0,
    onTime: 0,
    credits: 0,
    categories: {},
    weeksCounted: 0,
    recentWeeks: [],
    householdXpByWeek: {},
    springSubtasks: 0,
    springSeasonKey: null,
    decemberGoalWeeks: 0,
    streakMilestonesPaid: [],
  };
}

export function emptyOrganizerStats(): OrganizerStats {
  return {
    membersActivated: 0,
    maestroWeeks: 0,
    evenSplitWeeks: 0,
    customChoreCompletions: {},
    weeksCounted: 0,
    orderWeeks: [],
    streakMilestonesPaid: [],
  };
}

export function cloneWallet(wallet: WalletProjection): WalletProjection {
  return {
    ...wallet,
    streak: {
      ...wallet.streak,
      awayWeeks: wallet.streak.awayWeeks ? [...wallet.streak.awayWeeks] : undefined,
    },
    achievements: cloneAchievements(wallet.achievements),
    stats: {
      ...wallet.stats,
      categories: { ...wallet.stats.categories },
      recentWeeks: wallet.stats.recentWeeks.map((week) => ({ ...week })),
      householdXpByWeek: { ...wallet.stats.householdXpByWeek },
      streakMilestonesPaid: [...wallet.stats.streakMilestonesPaid],
    },
    caps: { ...wallet.caps },
  };
}

export function cloneOrganizer(organizer: OrganizerProjection): OrganizerProjection {
  return {
    ...organizer,
    streak: { ...organizer.streak },
    achievements: cloneAchievements(organizer.achievements),
    stats: {
      ...organizer.stats,
      customChoreCompletions: { ...organizer.stats.customChoreCompletions },
      orderWeeks: organizer.stats.orderWeeks.map((week) => ({ ...week })),
      streakMilestonesPaid: [...organizer.stats.streakMilestonesPaid],
    },
    caps: { ...organizer.caps },
  };
}

export function createWallet(householdId: string, memberId: string, now: Date): WalletProjection {
  return {
    householdId,
    memberId,
    balance: 0,
    lifetimeEarned: 0,
    pendingBalance: 0,
    nextSpendableAt: null,
    level: 1,
    xpPeak: 0,
    streak: {
      current: 0,
      record: 0,
      lastCountedWeek: null,
      lastActionWeek: null,
      folgas: 0,
      folgaProgress: 0,
      awayWeeks: [],
    },
    achievements: {},
    stats: emptyWalletStats(),
    caps: {},
    projectionVersion: PROJECTION_VERSION,
    updatedAt: now,
  };
}

export function createOrganizer(householdId: string, memberId: string, now: Date): OrganizerProjection {
  return {
    householdId,
    memberId,
    zelo: 0,
    lifetimeZelo: 0,
    level: 1,
    streak: {
      current: 0,
      record: 0,
      lastCountedWeek: null,
      lastActionWeek: null,
      folgas: 0,
      folgaProgress: 0,
    },
    achievements: {},
    stats: emptyOrganizerStats(),
    caps: {},
    updatedAt: now,
  };
}

/** Creates the organizer projection inside the slot when it does not exist. */
export function ensureOrganizer(
  slot: OrganizerSlot,
  householdId: string,
  ctx: EvalContext,
  res: ResultCollector,
): OrganizerProjection {
  if (slot.organizer === null) slot.organizer = createOrganizer(householdId, ctx.creatorUid, ctx.now);
  return slot.organizer;
}

/**
 * Books a positive zelo award and recomputes the organizer level. Every place Zelo is paid goes
 * through here, so a level crossed by any award (a subtask credit, setup, the week close) is
 * celebrated right where it happens: a level-up toast and the `gami_level_up` event.
 */
export function applyAwardToOrganizer(
  organizer: OrganizerProjection,
  awarded: number,
  ctx: EvalContext,
  res: ResultCollector,
): void {
  const levelBefore = organizer.level;
  organizer.zelo += awarded;
  organizer.lifetimeZelo += awarded;
  organizer.level = organizerLevel(organizer.zelo, ctx.rules.levels.organizer.thresholds).level;
  res.organizerDirty = true;
  if (organizer.level <= levelBefore) return;
  res.celebrations.push({
    id: `cel:level:organizer:${organizer.level}:${organizer.memberId}`,
    moment: 'level',
    track: 'zelo',
    level: organizer.level,
    copyKey: LEVEL_UP_COPY_KEY,
  });
  res.serverEvents.push({
    docId: levelUpEventId('zelo', organizer.memberId, organizer.level),
    name: 'gami_level_up',
    householdId: res.householdId,
    memberId: organizer.memberId,
    data: { level: organizer.level },
    createdAt: ctx.now,
  });
}

/** Books a negative zelo reversal; lifetime and level follow down. Zelo never goes below zero. */
export function applyReversalToOrganizer(organizer: OrganizerProjection, amount: number, rules: RuleSet): void {
  organizer.zelo = Math.max(0, organizer.zelo + amount);
  organizer.lifetimeZelo = Math.max(0, organizer.lifetimeZelo + amount);
  organizer.level = organizerLevel(organizer.zelo, rules.levels.organizer.thresholds).level;
}

/** True when the rule's audience and active window admit the action. */
export function ruleActive(rule: EarnRule, dateKey: string, householdMemberCount: number): boolean {
  if (rule.status !== 'active') return false;
  if (typeof rule.activeFrom === 'string' && dateKey < rule.activeFrom) return false;
  if (typeof rule.activeTo === 'string' && dateKey > rule.activeTo) return false;
  const min = rule.audience?.minHouseholdMembers;
  if (typeof min === 'number' && householdMemberCount < min) return false;
  return true;
}
