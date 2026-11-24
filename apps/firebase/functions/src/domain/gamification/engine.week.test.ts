import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE_SET } from './default-rule-set';
import { evaluate } from './engine';
import type {
  EngineInput,
  HouseholdWeekClosedEvent,
  OrganizerProjection,
  WalletProjection,
  WeekMemberStats,
} from './types';

const NOW = new Date('2026-11-30T04:00:00.000Z');
const CREATOR = 'creator';
const HH = 'hh1';

function memberStats(overrides?: Partial<WeekMemberStats>): WeekMemberStats {
  return { xp: 50, credits: 4, assignedDue: 3, missed: 0, undoCount: 0, revokeCount: 0, ...overrides };
}

function wallet(memberId = 'uidA', overrides?: Partial<WalletProjection>): WalletProjection {
  return {
    householdId: HH,
    memberId,
    balance: 0,
    lifetimeEarned: 0,
    pendingBalance: 0,
    nextSpendableAt: null,
    level: 1,
    xpPeak: 0,
    streak: { current: 0, record: 0, lastCountedWeek: null, lastActionWeek: null, folgas: 0, folgaProgress: 0, awayWeeks: [] },
    achievements: {},
    stats: {
      assists: 0, finals: 0, onTime: 0, credits: 0, categories: {}, weeksCounted: 0,
      recentWeeks: [], householdXpByWeek: {}, springSubtasks: 0, springSeasonKey: null,
      decemberGoalWeeks: 0, streakMilestonesPaid: [],
    },
    caps: {},
    projectionVersion: 1,
    updatedAt: NOW,
    ...overrides,
  };
}

function organizer(overrides?: Partial<OrganizerProjection>): OrganizerProjection {
  return {
    householdId: HH,
    memberId: CREATOR,
    zelo: 0,
    lifetimeZelo: 0,
    level: 1,
    streak: { current: 0, record: 0, lastCountedWeek: null, lastActionWeek: null, folgas: 0, folgaProgress: 0 },
    achievements: {},
    stats: {
      membersActivated: 0, maestroWeeks: 0, evenSplitWeeks: 0, customChoreCompletions: {},
      weeksCounted: 0, orderWeeks: [], streakMilestonesPaid: [],
    },
    caps: {},
    updatedAt: NOW,
    ...overrides,
  };
}

function input(overrides?: Partial<EngineInput>): EngineInput {
  return {
    now: NOW,
    rules: DEFAULT_RULE_SET,
    ruleSetVersion: null,
    wallet: null,
    organizer: null,
    householdMemberCount: 3,
    timeZone: 'UTC',
    existingKeys: new Set<string>(),
    creatorUid: CREATOR,
    ...overrides,
  };
}

function weekEvent(overrides?: Partial<HouseholdWeekClosedEvent>): HouseholdWeekClosedEvent {
  return {
    kind: 'household.week_closed',
    householdId: HH,
    weekStart: '2026-11-23',
    weekEnd: '2026-11-29',
    timeZone: 'UTC',
    closedAt: NOW,
    weeklyGoalXp: null,
    goalReached: false,
    instancesDue: 5,
    instancesOnTime: 5,
    allAway: false,
    members: {
      // Uneven by default so zelo.even_split does not fire in every test.
      uidA: memberStats({ xp: 60 }),
      uidB: memberStats({ xp: 20 }),
      [CREATOR]: memberStats({ xp: 0, credits: 0 }),
    },
    ...overrides,
  };
}

describe('member weekly streak', () => {
  it('counts a week with at least 3 net credits', () => {
    const result = evaluate(weekEvent(), input({ wallet: wallet() }));
    const next = result.wallet as WalletProjection;
    expect(next.streak.current).toBe(1);
    expect(next.streak.record).toBe(1);
    expect(next.streak.lastCountedWeek).toBe('2026-11-23');
    expect(next.streak.folgaProgress).toBe(1);
    expect(next.stats.weeksCounted).toBe(1);
    expect(next.stats.recentWeeks).toEqual([{ weekStart: '2026-11-23', counted: true, xp: 60 }]);
    expect(result.serverEvents.some((e) => e.name === 'gami_streak_week_counted')).toBe(true);
    expect(result.serverEvents.some((e) => e.name === 'gami_week_closed')).toBe(true);
  });

  it('does not count a week with fewer than 3 credits', () => {
    const result = evaluate(
      weekEvent({ members: { ...weekEvent().members, uidA: memberStats({ credits: 2 }) } }),
      input({ wallet: wallet() }),
    );
    expect(result.wallet?.streak.current).toBe(0);
    expect(result.wallet?.stats.weeksCounted).toBe(0);
    expect(result.wallet?.stats.recentWeeks[0].counted).toBe(false);
  });

  it('breaks the streak on a missed week when no folga is held', () => {
    const start = wallet('uidA', {
      streak: { current: 3, record: 3, lastCountedWeek: '2026-11-16', lastActionWeek: '2026-11-16', folgas: 0, folgaProgress: 3, awayWeeks: [] },
    });
    const result = evaluate(
      weekEvent({ members: { ...weekEvent().members, uidA: memberStats({ credits: 0, xp: 0 }) } }),
      input({ wallet: start }),
    );
    expect(result.wallet?.streak.current).toBe(0);
    expect(result.wallet?.streak.record).toBe(3);
    expect(result.wallet?.stats.streakMilestonesPaid).toEqual([]);
    expect(result.serverEvents.some((e) => e.name === 'gami_streak_broken')).toBe(true);
  });

  it('consumes a folga instead of breaking', () => {
    const start = wallet('uidA', {
      streak: { current: 3, record: 3, lastCountedWeek: '2026-11-16', lastActionWeek: '2026-11-16', folgas: 1, folgaProgress: 0, awayWeeks: [] },
    });
    const result = evaluate(
      weekEvent({ members: { ...weekEvent().members, uidA: memberStats({ credits: 0, xp: 0 }) } }),
      input({ wallet: start }),
    );
    expect(result.wallet?.streak.current).toBe(3);
    expect(result.wallet?.streak.folgas).toBe(0);
    expect(result.serverEvents.some((e) => e.name === 'gami_folga_used')).toBe(true);
    expect(result.serverEvents.some((e) => e.name === 'gami_streak_broken')).toBe(false);
  });

  it('freezes the streak for an away week', () => {
    const start = wallet('uidA', {
      streak: { current: 3, record: 3, lastCountedWeek: '2026-11-16', lastActionWeek: '2026-11-16', folgas: 0, folgaProgress: 3, awayWeeks: ['2026-11-23'] },
    });
    const result = evaluate(
      weekEvent({ members: { ...weekEvent().members, uidA: memberStats({ credits: 0, xp: 0 }) } }),
      input({ wallet: start }),
    );
    expect(result.wallet?.streak.current).toBe(3);
    expect(result.wallet?.streak.folgas).toBe(0);
    expect(result.serverEvents.filter((e) => e.name === 'gami_streak_broken')).toEqual([]);
    expect(result.wallet?.streak.lastActionWeek).toBe('2026-11-23');
  });

  it('awards a folga every 4 counted weeks, holding at most 1 below level 8', () => {
    const almost = wallet('uidA', {
      xpPeak: 100,
      streak: { current: 1, record: 1, lastCountedWeek: '2026-11-16', lastActionWeek: '2026-11-16', folgas: 0, folgaProgress: 3, awayWeeks: [] },
    });
    const first = evaluate(weekEvent(), input({ wallet: almost }));
    expect(first.wallet?.streak.folgas).toBe(1);
    expect(first.wallet?.streak.folgaProgress).toBe(0);

    // Already holding one: the next boundary does not add a second below level 8.
    const holder = wallet('uidA', {
      xpPeak: 100,
      streak: { current: 2, record: 2, lastCountedWeek: '2026-11-16', lastActionWeek: '2026-11-16', folgas: 1, folgaProgress: 3, awayWeeks: [] },
    });
    const second = evaluate(weekEvent(), input({ wallet: holder }));
    expect(second.wallet?.streak.folgas).toBe(1);
  });

  it('holds 2 folgas from level 8 (the perk)', () => {
    const holder = wallet('uidA', {
      xpPeak: 2800, // level 8
      level: 8,
      streak: { current: 2, record: 2, lastCountedWeek: '2026-11-16', lastActionWeek: '2026-11-16', folgas: 1, folgaProgress: 3, awayWeeks: [] },
    });
    const result = evaluate(weekEvent(), input({ wallet: holder }));
    expect(result.wallet?.streak.folgas).toBe(2);
  });

  it('is idempotent per week: closing the same week twice changes nothing', () => {
    const first = evaluate(weekEvent(), input({ wallet: wallet() }));
    const second = evaluate(
      weekEvent(),
      input({
        wallet: first.wallet as WalletProjection,
        organizer: first.organizer,
        existingKeys: new Set(first.walletRows.map((r) => r.key)),
      }),
    );
    expect(second.wallet).toBeNull();
    expect(second.organizer).toBeNull();
    expect(second.walletRows).toEqual([]);
    expect(second.serverEvents).toEqual([]);
  });

  it('ignores late replays of older weeks', () => {
    const start = wallet('uidA', {
      streak: { current: 5, record: 5, lastCountedWeek: '2026-11-23', lastActionWeek: '2026-11-23', folgas: 0, folgaProgress: 1, awayWeeks: [] },
    });
    const result = evaluate(weekEvent({ weekStart: '2026-11-16' }), input({ wallet: start }));
    expect(result.wallet).toBeNull();
  });

  it('skips the member part for members not active at close', () => {
    const result = evaluate(
      weekEvent({ members: { uidB: memberStats(), [CREATOR]: memberStats({ xp: 0, credits: 0 }) } }),
      input({ wallet: wallet('uidA') }),
    );
    expect(result.wallet).toBeNull();
  });
});

describe('streak milestones', () => {
  it('pays each milestone once per run as the streak grows', () => {
    let current = wallet('uidA', {
      streak: { current: 1, record: 1, lastCountedWeek: '2026-11-16', lastActionWeek: '2026-11-16', folgas: 0, folgaProgress: 1, awayWeeks: [] },
    });
    const weekTwo = evaluate(weekEvent(), input({ wallet: current }));
    // current 1 -> 2: milestone 2 pays 25.
    expect(weekTwo.walletRows.map((row) => row.key)).toEqual(['earn.streak_milestone:2026-11-23#2:uidA']);
    expect(weekTwo.walletRows[0].amount).toBe(25);
    expect(weekTwo.wallet?.stats.streakMilestonesPaid).toEqual([2]);
    expect(weekTwo.celebrations.some((c) => c.moment === 'streak')).toBe(true);
    expect(weekTwo.serverEvents.some((e) => e.name === 'gami_milestone')).toBe(true);

    // current 2 -> 3: no milestone between 2 and 4.
    current = weekTwo.wallet as WalletProjection;
    const weekThree = evaluate(
      weekEvent({ weekStart: '2026-11-30', weekEnd: '2026-12-06' }),
      input({ wallet: current, existingKeys: new Set(weekTwo.walletRows.map((r) => r.key)) }),
    );
    expect(weekThree.walletRows).toEqual([]);

    // current 3 -> 4: milestone 4 pays 50.
    const weekFour = evaluate(
      weekEvent({ weekStart: '2026-12-07', weekEnd: '2026-12-13' }),
      input({ wallet: weekThree.wallet as WalletProjection, existingKeys: new Set(['earn.streak_milestone:2026-11-23#2:uidA']) }),
    );
    expect(weekFour.walletRows[0]).toMatchObject({ key: 'earn.streak_milestone:2026-12-07#4:uidA', amount: 50 });
  });

  it('pays milestones again after a break starts a new run', () => {
    const broken = wallet('uidA', {
      streak: { current: 1, record: 4, lastCountedWeek: '2026-11-16', lastActionWeek: '2026-11-16', folgas: 0, folgaProgress: 0, awayWeeks: [] },
      stats: { ...wallet().stats, streakMilestonesPaid: [] },
    });
    const result = evaluate(weekEvent(), input({ wallet: broken }));
    expect(result.walletRows[0].key).toBe('earn.streak_milestone:2026-11-23#2:uidA');
  });

  it('does not re-pay a milestone reached in the same run', () => {
    const start = wallet('uidA', {
      streak: { current: 3, record: 3, lastCountedWeek: '2026-11-16', lastActionWeek: '2026-11-16', folgas: 0, folgaProgress: 3, awayWeeks: [] },
      stats: { ...wallet().stats, streakMilestonesPaid: [2, 4] },
      achievements: { marathon: { tier: 'bronze', unlockedAt: NOW } },
    });
    const counted = evaluate(weekEvent(), input({ wallet: start }));
    expect(counted.walletRows.map((row) => row.ruleId)).toEqual([]);
    expect(counted.wallet?.stats.streakMilestonesPaid).toEqual([2, 4]);
  });
});

describe('earn.week_goal', () => {
  it('pays 30 when the goal was reached and the member carried at least 10%', () => {
    const result = evaluate(
      weekEvent({
        weeklyGoalXp: 100,
        goalReached: true,
        members: { ...weekEvent().members, uidA: memberStats({ xp: 10 }) },
      }),
      input({ wallet: wallet() }),
    );
    expect(result.walletRows).toEqual([
      expect.objectContaining({ key: 'earn.week_goal:2026-11-23:uidA', amount: 30 }),
    ]);
    expect(result.wallet?.caps['week:2026-11-23:earn.week_goal']).toBe(1);
  });

  it('needs the household goal and a 10% member share', () => {
    const belowShare = evaluate(
      weekEvent({
        weeklyGoalXp: 100,
        goalReached: true,
        members: { ...weekEvent().members, uidA: memberStats({ xp: 9 }) },
      }),
      input({ wallet: wallet() }),
    );
    expect(belowShare.walletRows).toEqual([]);

    const goalMissed = evaluate(
      weekEvent({
        weeklyGoalXp: 100,
        goalReached: false,
        members: { ...weekEvent().members, uidA: memberStats({ xp: 50 }) },
      }),
      input({ wallet: wallet() }),
    );
    expect(goalMissed.walletRows).toEqual([]);
  });
});

describe('zelo week rules', () => {
  it('pays 30 at >=70% on-time with 5+ instances due', () => {
    const result = evaluate(
      weekEvent({ instancesDue: 5, instancesOnTime: 4 }),
      input({ wallet: wallet(), organizer: organizer() }),
    );
    expect(result.zeloRows).toEqual([
      expect.objectContaining({ key: 'zelo.on_time:2026-11-23:creator', amount: 30, memberId: CREATOR }),
    ]);
    expect(result.organizer?.zelo).toBe(30);
  });

  it('pays 60 instead of 30 at >=90%', () => {
    const result = evaluate(weekEvent(), input({ wallet: wallet(), organizer: organizer() }));
    expect(result.zeloRows[0].amount).toBe(60);
  });

  it('pays nothing below 70% or with fewer than 5 instances due', () => {
    const lowRate = evaluate(
      weekEvent({ instancesDue: 10, instancesOnTime: 6 }),
      input({ wallet: wallet(), organizer: organizer() }),
    );
    expect(lowRate.zeloRows).toEqual([]);

    const fewDue = evaluate(
      weekEvent({ instancesDue: 4, instancesOnTime: 4 }),
      input({ wallet: wallet(), organizer: organizer() }),
    );
    expect(fewDue.zeloRows).toEqual([]);
  });

  it('pays even_split 20 when nobody holds more than 60% of week XP', () => {
    const result = evaluate(
      weekEvent({ instancesDue: 0, instancesOnTime: 0, members: { uidA: memberStats({ xp: 50 }), uidB: memberStats({ xp: 50 }) } }),
      input({ wallet: wallet(), organizer: organizer() }),
    );
    expect(result.zeloRows).toEqual([
      expect.objectContaining({ key: 'zelo.even_split:2026-11-23:creator', amount: 20 }),
    ]);
    expect(result.organizer?.stats.evenSplitWeeks).toBe(1);
  });

  it('skips even_split when one member dominates or too few earned XP', () => {
    const dominant = evaluate(
      weekEvent({ instancesDue: 0, instancesOnTime: 0, members: { uidA: memberStats({ xp: 70 }), uidB: memberStats({ xp: 30 }) } }),
      input({ wallet: wallet(), organizer: organizer() }),
    );
    expect(dominant.zeloRows).toEqual([]);

    const lonely = evaluate(
      weekEvent({ instancesDue: 0, instancesOnTime: 0, members: { uidA: memberStats({ xp: 100 }), [CREATOR]: memberStats({ xp: 0, credits: 0 }) } }),
      input({ wallet: wallet(), organizer: organizer() }),
    );
    expect(lonely.zeloRows).toEqual([]);
  });

  it('trims zelo awards against the 200 weekly pool', () => {
    const result = evaluate(
      weekEvent(),
      input({ wallet: wallet(), organizer: organizer({ caps: { 'week:2026-11-23:zelo': 190 } }) }),
    );
    expect(result.zeloRows[0].amount).toBe(10); // on_time trimmed from 60
    expect(result.zeloRows).toHaveLength(1); // even_split finds nothing left
  });

  it('celebrates an organizer level-up', () => {
    const result = evaluate(weekEvent(), input({ wallet: wallet(), organizer: organizer({ zelo: 160 }) }));
    expect(result.organizer?.zelo).toBe(220);
    expect(result.organizer?.level).toBe(2);
    expect(result.celebrations.some((c) => c.moment === 'level' && c.track === 'zelo')).toBe(true);
    expect(result.serverEvents.some((e) => e.name === 'gami_level_up' && e.memberId === CREATOR)).toBe(true);
  });
});

describe('organizer streak', () => {
  it('counts a week at >=60% on time with 5+ due, and pays milestone 4', () => {
    const start = organizer({ streak: { current: 3, record: 3, lastCountedWeek: '2026-11-16', lastActionWeek: '2026-11-16', folgas: 0, folgaProgress: 3 } });
    const result = evaluate(
      weekEvent({ instancesDue: 5, instancesOnTime: 3 }), // 60%
      input({ wallet: wallet(), organizer: start }),
    );
    expect(result.organizer?.streak.current).toBe(4);
    expect(result.zeloRows.map((row) => row.key)).toContain('zelo.streak_milestone:2026-11-23#4:creator');
    expect(result.zeloRows.find((row) => row.key === 'zelo.streak_milestone:2026-11-23#4:creator')?.amount).toBe(20);
    expect(result.organizer?.stats.streakMilestonesPaid).toEqual([4]);
  });

  it('breaks below 60% and consumes a folga when held', () => {
    const broken = evaluate(
      weekEvent({ instancesDue: 5, instancesOnTime: 2 }),
      input({
        wallet: wallet(),
        organizer: organizer({ streak: { current: 4, record: 4, lastCountedWeek: '2026-11-16', lastActionWeek: '2026-11-16', folgas: 0, folgaProgress: 1 } }),
      }),
    );
    expect(broken.organizer?.streak.current).toBe(0);

    const folga = evaluate(
      weekEvent({ instancesDue: 5, instancesOnTime: 2 }),
      input({
        wallet: wallet(),
        organizer: organizer({ streak: { current: 4, record: 4, lastCountedWeek: '2026-11-16', lastActionWeek: '2026-11-16', folgas: 1, folgaProgress: 1 } }),
      }),
    );
    expect(folga.organizer?.streak.current).toBe(4);
    expect(folga.organizer?.streak.folgas).toBe(0);
  });

  it('pauses when every member is away', () => {
    const result = evaluate(
      weekEvent({ allAway: true, instancesDue: 5, instancesOnTime: 0 }),
      input({
        wallet: wallet(),
        organizer: organizer({ streak: { current: 4, record: 4, lastCountedWeek: '2026-11-16', lastActionWeek: '2026-11-16', folgas: 0, folgaProgress: 1 } }),
      }),
    );
    expect(result.organizer?.streak.current).toBe(4);
    expect(result.serverEvents.filter((e) => e.name === 'gami_streak_broken' && e.memberId === CREATOR)).toEqual([]);
  });

  it('needs at least 5 instances due to count', () => {
    const result = evaluate(
      weekEvent({ instancesDue: 3, instancesOnTime: 3 }),
      input({ wallet: wallet(), organizer: organizer() }),
    );
    expect(result.organizer?.streak.current).toBe(0);
  });

  it('awards a folga every 6 counted weeks', () => {
    const result = evaluate(
      weekEvent({ instancesDue: 5, instancesOnTime: 3 }),
      input({
        wallet: wallet(),
        organizer: organizer({ streak: { current: 1, record: 1, lastCountedWeek: '2026-11-16', lastActionWeek: '2026-11-16', folgas: 0, folgaProgress: 5 } }),
      }),
    );
    expect(result.organizer?.streak.folgas).toBe(1);
    expect(result.organizer?.streak.folgaProgress).toBe(0);
  });

  it('tracks maestro weeks (>=90% on time) and order weeks', () => {
    const result = evaluate(weekEvent(), input({ wallet: wallet(), organizer: organizer() }));
    expect(result.organizer?.stats.maestroWeeks).toBe(1);
    expect(result.organizer?.stats.orderWeeks).toEqual([{ weekStart: '2026-11-23', due: 5, onTime: 5 }]);
  });
});

describe('week integrity alerts', () => {
  it('flags members above a 30% undo+revoke rate', () => {
    const result = evaluate(
      weekEvent({ members: { ...weekEvent().members, uidA: memberStats({ credits: 6, undoCount: 2, revokeCount: 1 }) } }),
      input({ wallet: wallet() }),
    );
    expect(result.alerts).toEqual([
      expect.objectContaining({ kind: 'undo-rate', memberId: 'uidA', data: expect.objectContaining({ undos: 2, revokes: 1 }) }),
    ]);
  });

  it('does not flag exactly 30%', () => {
    const result = evaluate(
      weekEvent({ members: { ...weekEvent().members, uidA: memberStats({ credits: 7, undoCount: 2, revokeCount: 1 }) } }),
      input({ wallet: wallet() }),
    );
    expect(result.alerts).toEqual([]);
  });

  it('does not flag members with no moderation this week', () => {
    const result = evaluate(weekEvent(), input({ wallet: wallet() }));
    expect(result.alerts).toEqual([]);
  });
});

describe('spring and yearend stats', () => {
  it('accumulates spring credits in local spring and resets between seasons', () => {
    const south = weekEvent({
      weekStart: '2026-10-05',
      weekEnd: '2026-10-11',
      timeZone: 'America/Sao_Paulo',
      members: { ...weekEvent().members, uidA: memberStats({ credits: 12 }) },
    });
    const result = evaluate(south, input({ wallet: wallet() }));
    expect(result.wallet?.stats.springSeasonKey).toBe('south:2026');
    expect(result.wallet?.stats.springSubtasks).toBe(12);

    const stale = wallet('uidA', {
      stats: { ...wallet().stats, springSeasonKey: 'south:2025', springSubtasks: 9 },
    });
    const fresh = evaluate(south, input({ wallet: stale }));
    expect(fresh.wallet?.stats.springSubtasks).toBe(12); // reset, then counted
  });

  it('counts December weeks with the household goal reached', () => {
    const december = weekEvent({ weekStart: '2026-12-07', weekEnd: '2026-12-13', goalReached: true });
    const first = evaluate(december, input({ wallet: wallet() }));
    expect(first.wallet?.stats.decemberGoalWeeks).toBe(1);

    const second = evaluate(
      weekEvent({ weekStart: '2026-12-14', weekEnd: '2026-12-20', goalReached: true }),
      input({ wallet: wallet('uidA', { stats: { ...wallet().stats, decemberGoalWeeks: 1 } }) }),
    );
    expect(second.wallet?.stats.decemberGoalWeeks).toBe(2);
  });
});
