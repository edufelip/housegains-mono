import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE_SET } from './default-rule-set';
import { evaluate } from './engine';
import type { EngineInput, HouseholdWeekClosedEvent, OrganizerProjection, WalletProjection } from './types';

const NOW = new Date('2026-11-30T04:00:00.000Z');
const CREATOR = 'creator';
const HH = 'hh1';

function wallet(memberId = 'uidA', overrides?: Partial<WalletProjection>): WalletProjection {
  const base: WalletProjection = {
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
  };
  return { ...base, ...overrides, stats: { ...base.stats, ...(overrides?.stats ?? {}) } };
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
    instancesDue: 0,
    instancesOnTime: 0,
    allAway: false,
    members: { uidA: { xp: 50, credits: 4, assignedDue: 3, missed: 0, undoCount: 0, revokeCount: 0 } },
    ...overrides,
  };
}

describe('member achievements at week close', () => {
  it('unlocks helper bronze at 5 assists and pays 20 once for life', () => {
    const result = evaluate(weekEvent(), input({ wallet: wallet('uidA', { stats: { ...wallet().stats, assists: 5 } }) }));
    expect(result.walletRows).toEqual([
      expect.objectContaining({ key: 'earn.achievement:helper#bronze:uidA', amount: 20, sourceRef: 'helper#bronze' }),
    ]);
    expect(result.wallet?.achievements['helper']).toMatchObject({ tier: 'bronze' });
    expect(result.celebrations.some((c) => c.moment === 'badge' && c.fullScreen === false)).toBe(true);
    expect(result.serverEvents.some((e) => e.name === 'gami_achievement_unlocked')).toBe(true);

    const again = evaluate(
      weekEvent({ weekStart: '2026-11-30', weekEnd: '2026-12-06' }),
      input({ wallet: result.wallet as WalletProjection, existingKeys: new Set(result.walletRows.map((r) => r.key)) }),
    );
    expect(again.walletRows.filter((row) => row.ruleId === 'earn.achievement')).toEqual([]);
  });

  it('upgrades tiers and pays only the new tier', () => {
    const silver = evaluate(
      weekEvent(),
      input({ wallet: wallet('uidA', { stats: { ...wallet().stats, assists: 25 }, achievements: { helper: { tier: 'bronze', unlockedAt: NOW } } }) }),
    );
    expect(silver.walletRows).toEqual([
      expect.objectContaining({ key: 'earn.achievement:helper#silver:uidA', amount: 50 }),
    ]);
    expect(silver.wallet?.achievements['helper']?.tier).toBe('silver');
    expect(silver.celebrations.some((c) => c.moment === 'badge' && c.fullScreen === true)).toBe(true);
    // A tier upgrade is a new celebration: its id (the inbox key) differs from the bronze unlock's.
    expect(silver.celebrations.find((c) => c.moment === 'badge')?.id).toBe('cel:badge:helper:silver:uidA');

    const gold = evaluate(
      weekEvent({ weekStart: '2026-11-30', weekEnd: '2026-12-06' }),
      input({ wallet: wallet('uidA', { stats: { ...wallet().stats, assists: 100 }, achievements: { helper: { tier: 'silver', unlockedAt: NOW } } }) }),
    );
    expect(gold.walletRows[0]).toMatchObject({ key: 'earn.achievement:helper#gold:uidA', amount: 120 });
  });

  it('unlocks closer, ontime, kitchen and pets on their stats', () => {
    const result = evaluate(
      weekEvent(),
      input({
        wallet: wallet('uidA', {
          stats: {
            ...wallet().stats,
            finals: 10,
            onTime: 10,
            categories: { kitchen: 20, pets: 20 },
          },
        }),
      }),
    );
    expect(result.walletRows.map((row) => row.key)).toEqual([
      'earn.achievement:closer#bronze:uidA',
      'earn.achievement:ontime#bronze:uidA',
      'earn.achievement:kitchen#bronze:uidA',
      'earn.achievement:pets#bronze:uidA',
    ]);
  });

  it('unlocks marathon from the current streak', () => {
    const bronze = evaluate(
      weekEvent(),
      input({ wallet: wallet('uidA', { streak: { ...wallet().streak, current: 4 }, stats: { ...wallet().stats } }) }),
    );
    expect(bronze.walletRows[0].key).toBe('earn.achievement:marathon#bronze:uidA');

    const gold = evaluate(
      weekEvent(),
      input({ wallet: wallet('uidA', { streak: { ...wallet().streak, current: 52 } }) }),
    );
    expect(gold.walletRows[0].key).toBe('earn.achievement:marathon#gold:uidA');
  });

  it('unlocks the seasonal spring achievement from spring credits', () => {
    const result = evaluate(
      weekEvent({ weekStart: '2026-10-05', weekEnd: '2026-10-11', timeZone: 'America/Sao_Paulo' }),
      input({ wallet: wallet('uidA', { stats: { ...wallet().stats, springSubtasks: 30, springSeasonKey: 'south:2026' } }) }),
    );
    expect(result.walletRows[0].key).toBe('earn.achievement:spring#bronze:uidA');

    const northern = evaluate(
      weekEvent({ weekStart: '2026-04-06', weekEnd: '2026-04-12', timeZone: 'Europe/Berlin' }),
      input({ wallet: wallet('uidA', { stats: { ...wallet().stats, springSubtasks: 30, springSeasonKey: 'north:2026' } }) }),
    );
    expect(northern.walletRows[0].key).toBe('earn.achievement:spring#bronze:uidA');
  });

  it('unlocks yearend after two December goal weeks', () => {
    const result = evaluate(
      weekEvent({ weekStart: '2026-12-14', weekEnd: '2026-12-20', goalReached: true }),
      input({ wallet: wallet('uidA', { stats: { ...wallet().stats, decemberGoalWeeks: 1 } }) }),
    );
    expect(result.walletRows[0].key).toBe('earn.achievement:yearend#bronze:uidA');
  });
});

describe('active achievements (fit, pillar)', () => {
  it('fit unlocks and pays once when 3 of the last 4 weeks counted', () => {
    const recentWeeks = [
      { weekStart: '2026-10-26', counted: true, xp: 10 },
      { weekStart: '2026-11-02', counted: true, xp: 10 },
      { weekStart: '2026-11-09', counted: false, xp: 0 },
      { weekStart: '2026-11-16', counted: true, xp: 10 },
    ];
    const result = evaluate(weekEvent(), input({ wallet: wallet('uidA', { stats: { ...wallet().stats, recentWeeks: recentWeeks } }) }));
    expect(result.walletRows[0].key).toBe('earn.achievement:fit#bronze:uidA');
    expect(result.wallet?.achievements['fit']?.active).toBe(true);
  });

  it('fit toggles off with gami_achievement_lost and never re-pays', () => {
    const weak = [
      { weekStart: '2026-11-02', counted: true, xp: 10 },
      { weekStart: '2026-11-09', counted: false, xp: 0 },
      { weekStart: '2026-11-16', counted: false, xp: 0 },
    ];
    // A household mate with plenty of XP keeps the pillar share below 25%.
    const members = {
      uidA: { xp: 0, credits: 0, assignedDue: 0, missed: 0, undoCount: 0, revokeCount: 0 },
      uidB: { xp: 900, credits: 9, assignedDue: 3, missed: 0, undoCount: 0, revokeCount: 0 },
    };
    const result = evaluate(
      weekEvent({ members }),
      input({
        wallet: wallet('uidA', {
          stats: { ...wallet().stats, recentWeeks: weak },
          achievements: { fit: { tier: 'bronze', unlockedAt: NOW, active: true } },
        }),
      }),
    );
    expect(result.wallet?.achievements['fit']?.active).toBe(false);
    expect(result.serverEvents.some((e) => e.name === 'gami_achievement_lost')).toBe(true);
    expect(result.walletRows.filter((row) => row.ruleId === 'earn.achievement')).toEqual([]);

    // Active again: no second payout.
    const strong = evaluate(
      weekEvent({
        weekStart: '2026-11-30',
        weekEnd: '2026-12-06',
        members: {
          uidA: { xp: 10, credits: 4, assignedDue: 0, missed: 0, undoCount: 0, revokeCount: 0 },
          uidB: { xp: 900, credits: 9, assignedDue: 3, missed: 0, undoCount: 0, revokeCount: 0 },
        },
      }),
      input({
        wallet: wallet('uidA', {
          stats: {
            ...wallet().stats,
            recentWeeks: [
              { weekStart: '2026-11-02', counted: true, xp: 10 },
              { weekStart: '2026-11-09', counted: true, xp: 10 },
              { weekStart: '2026-11-16', counted: false, xp: 0 },
              { weekStart: '2026-11-23', counted: true, xp: 10 },
            ],
          },
          achievements: { fit: { tier: 'bronze', unlockedAt: NOW, active: false } },
        }),
      }),
    );
    expect(strong.wallet?.achievements['fit']?.active).toBe(true);
    expect(strong.walletRows.filter((row) => row.ruleId === 'earn.achievement')).toEqual([]);
  });

  it('pillar unlocks at a 25% share of household XP over the last 4 weeks', () => {
    const stats = {
      ...wallet().stats,
      recentWeeks: [
        { weekStart: '2026-10-26', counted: true, xp: 25 },
        { weekStart: '2026-11-02', counted: true, xp: 25 },
        { weekStart: '2026-11-09', counted: false, xp: 25 },
        { weekStart: '2026-11-16', counted: false, xp: 25 },
      ],
      householdXpByWeek: { '2026-10-26': 100, '2026-11-02': 100, '2026-11-09': 100, '2026-11-16': 100 },
    };
    const result = evaluate(weekEvent(), input({ wallet: wallet('uidA', { stats }) }));
    expect(result.walletRows.map((row) => row.key)).toEqual(['earn.achievement:pillar#bronze:uidA']);

    const lowShare = evaluate(
      weekEvent(),
      input({
        wallet: wallet('uidA', {
          stats: { ...stats, householdXpByWeek: { '2026-10-26': 500, '2026-11-02': 500, '2026-11-09': 500, '2026-11-16': 500 } },
        }),
      }),
    );
    expect(lowShare.walletRows).toEqual([]);
  });
});

describe('organizer achievements', () => {
  it('host unlocks by activated members but pays no Ganhos', () => {
    const result = evaluate(
      weekEvent(),
      input({
        wallet: wallet(),
        organizer: organizer({ stats: { ...organizer().stats, membersActivated: 1 } }),
      }),
    );
    expect(result.organizer?.achievements['host']).toMatchObject({ tier: 'bronze' });
    expect(result.walletRows.filter((row) => row.ruleId === 'earn.achievement')).toEqual([]);
    expect(result.zeloRows.filter((row) => row.ruleId === 'earn.achievement')).toEqual([]);
    expect(result.celebrations.some((c) => c.moment === 'badge' && c.track === 'zelo')).toBe(true);
  });

  it('maestro unlocks after 4 weeks at >=90% on time', () => {
    const result = evaluate(
      weekEvent(),
      input({ wallet: wallet(), organizer: organizer({ stats: { ...organizer().stats, maestroWeeks: 4 } }) }),
    );
    expect(result.organizer?.achievements['maestro']?.tier).toBe('bronze');
  });

  it('architect counts custom chores done 10+ times', () => {
    const result = evaluate(
      weekEvent(),
      input({
        wallet: wallet(),
        organizer: organizer({ stats: { ...organizer().stats, customChoreCompletions: { a: 10, b: 11, c: 12, d: 9 } } }),
      }),
    );
    expect(result.organizer?.achievements['architect']?.tier).toBe('bronze'); // three chores with >=10
    const gold = evaluate(
      weekEvent(),
      input({
        wallet: wallet(),
        organizer: organizer({
          achievements: { architect: { tier: 'silver', unlockedAt: NOW } },
          stats: { ...organizer().stats, customChoreCompletions: Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`c${i}`, 10])) },
        }),
      }),
    );
    expect(gold.organizer?.achievements['architect']?.tier).toBe('gold');
  });

  it('fair unlocks from even-split weeks', () => {
    const result = evaluate(
      weekEvent(),
      input({ wallet: wallet(), organizer: organizer({ stats: { ...organizer().stats, evenSplitWeeks: 4 } }) }),
    );
    expect(result.organizer?.achievements['fair']?.tier).toBe('bronze');
  });

  it('order toggles on the last 4 weeks aggregate rate', () => {
    const weeks = [
      { weekStart: '2026-10-26', due: 10, onTime: 9 },
      { weekStart: '2026-11-02', due: 10, onTime: 8 },
      { weekStart: '2026-11-09', due: 10, onTime: 8 },
      { weekStart: '2026-11-16', due: 10, onTime: 9 },
    ]; // 34/40 = 85%
    const active = evaluate(
      weekEvent(),
      input({ wallet: wallet(), organizer: organizer({ stats: { ...organizer().stats, orderWeeks: weeks } }) }),
    );
    expect(active.organizer?.achievements['order']?.active).toBe(true);

    const weak = [
      { weekStart: '2026-10-26', due: 10, onTime: 6 },
      { weekStart: '2026-11-02', due: 10, onTime: 7 },
      { weekStart: '2026-11-09', due: 10, onTime: 6 },
      { weekStart: '2026-11-16', due: 10, onTime: 7 },
    ]; // 26/40 = 65%
    const lost = evaluate(
      weekEvent({ weekStart: '2026-11-30', weekEnd: '2026-12-06' }),
      input({
        wallet: wallet(),
        organizer: organizer({
          achievements: { order: { tier: 'bronze', unlockedAt: NOW, active: true } },
          stats: { ...organizer().stats, orderWeeks: weak },
        }),
      }),
    );
    expect(lost.organizer?.achievements['order']?.active).toBe(false);
    expect(lost.serverEvents.some((e) => e.name === 'gami_achievement_lost' && e.memberId === CREATOR)).toBe(true);
  });
});
