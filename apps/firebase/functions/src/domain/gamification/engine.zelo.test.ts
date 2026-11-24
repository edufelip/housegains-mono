import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE_SET } from './default-rule-set';
import { evaluate } from './engine';
import type { EngineInput, LedgerSubtaskEvent, OrganizerProjection, WalletProjection } from './types';

const NOW = new Date('2026-11-24T12:00:00.000Z');
const CREATOR = 'creator';
const HH = 'hh1';

function wallet(memberId = 'uidA'): WalletProjection {
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

function subtaskEvent(overrides?: Partial<LedgerSubtaskEvent>): LedgerSubtaskEvent {
  return {
    kind: 'ledger.subtask',
    householdId: HH,
    ledgerRowId: 'row-1',
    instanceId: 'inst-1',
    subtaskId: 'wash',
    memberId: 'uidB',
    amount: 10,
    isAssist: false,
    isFinalCompleter: true,
    assigneeIds: ['uidB'],
    category: 'kitchen',
    choreId: 'chore-1',
    choreCreatedBy: CREATOR,
    choreIsCustom: true,
    choreUpdatedAt: null,
    completedAt: new Date('2026-11-24T10:00:00.000Z'),
    memberJoinedAt: null,
    xpPeakAfter: null,
    choreXpRaised: false,
    recentSubtaskTimestamps: [],
    ...overrides,
  };
}

describe('zelo.setup', () => {
  it('pays 50 once per household and creates the organizer projection', () => {
    const result = evaluate(
      { kind: 'household.setup_finished', householdId: HH, finishedAt: new Date('2026-11-24T10:00:00.000Z') },
      input({ organizer: null }),
    );
    expect(result.zeloRows).toEqual([
      expect.objectContaining({ key: 'zelo.setup:setup:creator', amount: 50, track: 'zelo', memberId: CREATOR }),
    ]);
    expect(result.organizer?.zelo).toBe(50);
    expect(result.organizer?.lifetimeZelo).toBe(50);
    expect(result.organizer?.level).toBe(1);
    expect(result.organizer?.caps['hh:zelo.setup']).toBe(1);

    const replay = evaluate(
      { kind: 'household.setup_finished', householdId: HH, finishedAt: NOW },
      input({ organizer: result.organizer, existingKeys: new Set(['zelo.setup:setup:creator']) }),
    );
    expect(replay.zeloRows).toEqual([]);
    expect(replay.organizer).toBeNull();
  });
});

describe('zelo.chore_done', () => {
  it('pays the creator 5 on the first non-creator completion of a creator chore', () => {
    const result = evaluate(subtaskEvent(), input({ wallet: wallet('uidB'), organizer: organizer() }));
    expect(result.zeloRows).toEqual([
      expect.objectContaining({ key: 'zelo.chore_done:chore-1:creator', amount: 5, sourceRef: 'chore-1' }),
    ]);
    expect(result.organizer?.zelo).toBe(5);
    expect(result.organizer?.caps['life:zelo.chore_done:target:chore-1']).toBe(1);
    expect(result.organizer?.caps['week:2026-11-23:zelo.chore_done']).toBe(1);
    expect(result.organizer?.caps['week:2026-11-23:zelo']).toBe(5);
  });

  it('counts custom chore completions for the architect achievement', () => {
    const result = evaluate(subtaskEvent(), input({ wallet: wallet('uidB'), organizer: organizer() }));
    expect(result.organizer?.stats.customChoreCompletions['chore-1']).toBe(1);
  });

  it('pays only once per chore', () => {
    const result = evaluate(
      subtaskEvent({ ledgerRowId: 'row-2', memberId: 'uidC' }),
      input({ wallet: wallet('uidC'), organizer: organizer({ caps: { 'life:zelo.chore_done:target:chore-1': 1 } }) }),
    );
    expect(result.zeloRows).toEqual([]);
  });

  it('does not pay when the creator completes their own chore', () => {
    const result = evaluate(
      subtaskEvent({ memberId: CREATOR }),
      input({ wallet: wallet(CREATOR), organizer: organizer() }),
    );
    expect(result.zeloRows).toEqual([]);
  });

  it('does not pay on chores created by someone else', () => {
    const result = evaluate(
      subtaskEvent({ choreCreatedBy: 'uidB' }),
      input({ wallet: wallet('uidB'), organizer: organizer() }),
    );
    expect(result.zeloRows).toEqual([]);
  });

  it('stops after 10 per week', () => {
    const result = evaluate(
      subtaskEvent({ choreId: 'chore-9' }),
      input({ wallet: wallet('uidB'), organizer: organizer({ caps: { 'week:2026-11-23:zelo.chore_done': 10 } }) }),
    );
    expect(result.zeloRows).toEqual([]);
  });
});

describe('zelo.member_activated', () => {
  const joined = new Date('2026-11-19T10:00:00.000Z'); // 5 days before the credit

  function activation(result: ReturnType<typeof evaluate>) {
    return result.zeloRows.find((row) => row.ruleId === 'zelo.member_activated');
  }

  it('pays 40 when a member credits 3 subtasks within 14 days of joining', () => {
    const result = evaluate(
      subtaskEvent({ memberJoinedAt: joined }),
      input({ wallet: { ...wallet('uidB'), stats: { ...wallet('uidB').stats, credits: 2 } }, organizer: organizer() }),
    );
    expect(activation(result)).toMatchObject({
      key: 'zelo.member_activated:uidB:creator',
      amount: 40,
      sourceRef: 'uidB',
    });
    expect(result.organizer?.stats.membersActivated).toBe(1);
    expect(result.organizer?.caps['hh:zelo.member_activated']).toBe(1);
  });

  it('needs three credits: two plus this one is exactly enough', () => {
    const notEnough = evaluate(
      subtaskEvent({ memberJoinedAt: joined }),
      input({ wallet: { ...wallet('uidB'), stats: { ...wallet('uidB').stats, credits: 1 } }, organizer: organizer() }),
    );
    expect(activation(notEnough)).toBeUndefined();
  });

  it('ignores credits after the joined window or without a joinedAt', () => {
    const late = evaluate(
      subtaskEvent({ memberJoinedAt: new Date('2026-11-01T10:00:00.000Z') }),
      input({ wallet: { ...wallet('uidB'), stats: { ...wallet('uidB').stats, credits: 5 } }, organizer: organizer() }),
    );
    expect(activation(late)).toBeUndefined();

    const noJoined = evaluate(
      subtaskEvent(),
      input({ wallet: { ...wallet('uidB'), stats: { ...wallet('uidB').stats, credits: 5 } }, organizer: organizer() }),
    );
    expect(activation(noJoined)).toBeUndefined();
  });

  it('stops at 11 activations per household', () => {
    const result = evaluate(
      subtaskEvent({ memberJoinedAt: joined }),
      input({
        wallet: { ...wallet('uidB'), stats: { ...wallet('uidB').stats, credits: 2 } },
        organizer: organizer({ caps: { 'hh:zelo.member_activated': 11 } }),
      }),
    );
    expect(activation(result)).toBeUndefined();
    expect(result.organizer?.stats.membersActivated).toBe(0);
  });

  it('does not count the creator as an activated member', () => {
    const result = evaluate(
      subtaskEvent({ memberId: CREATOR, memberJoinedAt: joined }),
      input({ wallet: wallet(CREATOR), organizer: organizer() }),
    );
    expect(activation(result)).toBeUndefined();
  });
});

describe('zelo.chore_done reversal (chore.deleted)', () => {
  const base = { 'zelo.chore_done:chore-1:creator': 1 };
  const orgCaps = { 'life:zelo.chore_done:target:chore-1': 1, 'week:2026-11-23:zelo.chore_done': 1, 'week:2026-11-23:zelo': 5 };

  it('reverses when the chore is deleted within 7 days of creation', () => {
    const result = evaluate(
      {
        kind: 'chore.deleted',
        householdId: HH,
        choreId: 'chore-1',
        createdBy: CREATOR,
        isCustom: true,
        createdAt: new Date('2026-11-20T10:00:00.000Z'),
        deletedAt: new Date('2026-11-24T10:00:00.000Z'),
      },
      input({ organizer: organizer({ zelo: 5, lifetimeZelo: 5, caps: orgCaps }), existingKeys: new Set(Object.keys(base)) }),
    );
    expect(result.zeloRows).toEqual([
      expect.objectContaining({
        key: 'rev:zelo.chore_done:chore-1:creator',
        amount: -5,
        reversesEntryId: 'zelo.chore_done:chore-1:creator',
        reason: 'chore.deleted',
      }),
    ]);
    expect(result.organizer?.zelo).toBe(0);
    expect(result.organizer?.caps['life:zelo.chore_done:target:chore-1']).toBe(0);
    expect(result.organizer?.caps['week:2026-11-23:zelo.chore_done']).toBe(0);
    expect(result.serverEvents.some((e) => e.name === 'gami_clawback')).toBe(true);
  });

  it('keeps the zelo when the chore lived longer than 7 days', () => {
    const result = evaluate(
      {
        kind: 'chore.deleted',
        householdId: HH,
        choreId: 'chore-1',
        createdBy: CREATOR,
        isCustom: true,
        createdAt: new Date('2026-11-01T10:00:00.000Z'),
        deletedAt: new Date('2026-11-24T10:00:00.000Z'),
      },
      input({ organizer: organizer({ zelo: 5, caps: orgCaps }), existingKeys: new Set(Object.keys(base)) }),
    );
    expect(result.zeloRows).toEqual([]);
  });

  it('does not reverse twice', () => {
    const keys = new Set([...Object.keys(base), 'rev:zelo.chore_done:chore-1:creator']);
    const result = evaluate(
      {
        kind: 'chore.deleted',
        householdId: HH,
        choreId: 'chore-1',
        createdBy: CREATOR,
        isCustom: true,
        createdAt: new Date('2026-11-20T10:00:00.000Z'),
        deletedAt: new Date('2026-11-24T10:00:00.000Z'),
      },
      input({ organizer: organizer({ zelo: 0, caps: orgCaps }), existingKeys: keys }),
    );
    expect(result.zeloRows).toEqual([]);
    expect(result.organizer).toBeNull();
  });

  it('does nothing when the chore never paid zelo', () => {
    const result = evaluate(
      {
        kind: 'chore.deleted',
        householdId: HH,
        choreId: 'chore-1',
        createdBy: CREATOR,
        isCustom: true,
        createdAt: new Date('2026-11-20T10:00:00.000Z'),
        deletedAt: new Date('2026-11-24T10:00:00.000Z'),
      },
      input({ organizer: organizer() }),
    );
    expect(result.zeloRows).toEqual([]);
  });
});

describe('zelo.member_activated reversal (member.removed)', () => {
  const base = { 'zelo.member_activated:uidB:creator': 1 };

  it('reverses when the member is removed within 30 days of joining', () => {
    const result = evaluate(
      {
        kind: 'member.removed',
        householdId: HH,
        memberId: 'uidB',
        joinedAt: new Date('2026-11-10T10:00:00.000Z'),
        removedAt: new Date('2026-11-24T10:00:00.000Z'),
      },
      input({
        organizer: organizer({
          zelo: 40,
          lifetimeZelo: 40,
          stats: { ...organizer().stats, membersActivated: 1 },
          caps: { 'hh:zelo.member_activated': 1, 'week:2026-11-23:zelo': 40 },
        }),
        existingKeys: new Set(Object.keys(base)),
      }),
    );
    expect(result.zeloRows).toEqual([
      expect.objectContaining({
        key: 'rev:zelo.member_activated:uidB:creator',
        amount: -40,
        reversesEntryId: 'zelo.member_activated:uidB:creator',
        reason: 'member.removed',
      }),
    ]);
    expect(result.organizer?.zelo).toBe(0);
    expect(result.organizer?.stats.membersActivated).toBe(0);
    expect(result.organizer?.caps['hh:zelo.member_activated']).toBe(0);
  });

  it('keeps the zelo when the member stayed longer than 30 days', () => {
    const result = evaluate(
      {
        kind: 'member.removed',
        householdId: HH,
        memberId: 'uidB',
        joinedAt: new Date('2026-09-01T10:00:00.000Z'),
        removedAt: new Date('2026-11-24T10:00:00.000Z'),
      },
      input({ organizer: organizer({ zelo: 40 }), existingKeys: new Set(Object.keys(base)) }),
    );
    expect(result.zeloRows).toEqual([]);
  });
});

describe('organizer level', () => {
  it('rises with zelo and drops back after reversals', () => {
    const start = organizer({ zelo: 195, lifetimeZelo: 195, level: 1 });
    const award = evaluate(subtaskEvent({ choreId: 'chore-2' }), input({ wallet: wallet('uidB'), organizer: start }));
    expect(award.organizer?.zelo).toBe(200);
    expect(award.organizer?.level).toBe(2);

    const reversal = evaluate(
      {
        kind: 'chore.deleted',
        householdId: HH,
        choreId: 'chore-2',
        createdBy: CREATOR,
        isCustom: true,
        createdAt: new Date('2026-11-24T09:00:00.000Z'),
        deletedAt: new Date('2026-11-24T12:00:00.000Z'),
      },
      input({ organizer: award.organizer, existingKeys: new Set(['zelo.chore_done:chore-2:creator']) }),
    );
    expect(reversal.organizer?.zelo).toBe(195);
    expect(reversal.organizer?.level).toBe(1);
  });
});

describe('zelo clawbacks reverse what was paid (G1)', () => {
  const removed = (joinedAt: string, removedAt: string) =>
    ({
      kind: 'member.removed',
      householdId: HH,
      memberId: 'uidB',
      joinedAt: new Date(joinedAt),
      removedAt: new Date(removedAt),
    }) as const;
  const KEY = 'zelo.member_activated:uidB:creator';

  it('claws back the trimmed amount and refunds the week the award was paid in', () => {
    // 20 was left in the weekly pool when the 40-point award was paid on 2026-11-12 (week of 11-09).
    const result = evaluate(
      removed('2026-11-10T10:00:00.000Z', '2026-11-24T10:00:00.000Z'),
      input({
        organizer: organizer({
          zelo: 20,
          lifetimeZelo: 20,
          stats: { ...organizer().stats, membersActivated: 1 },
          caps: { 'hh:zelo.member_activated': 1, 'week:2026-11-09:zelo': 200, 'week:2026-11-23:zelo': 30 },
        }),
        existingKeys: new Set([KEY]),
        existingRows: new Map([[KEY, { amount: 20, createdAt: new Date('2026-11-12T10:00:00.000Z') }]]),
      }),
    );
    expect(result.zeloRows).toEqual([expect.objectContaining({ key: `rev:${KEY}`, amount: -20 })]);
    expect(result.organizer?.zelo).toBe(0);
    expect(result.organizer?.lifetimeZelo).toBe(0);
    // The award's week gets its 20 back; the reversal week's pool is untouched.
    expect(result.organizer?.caps['week:2026-11-09:zelo']).toBe(180);
    expect(result.organizer?.caps['week:2026-11-23:zelo']).toBe(30);
  });

  it('claws back more than the flat amount when a campaign paid more', () => {
    const result = evaluate(
      removed('2026-11-10T10:00:00.000Z', '2026-11-24T10:00:00.000Z'),
      input({
        organizer: organizer({ zelo: 80, lifetimeZelo: 80, caps: { 'hh:zelo.member_activated': 1, 'week:2026-11-23:zelo': 80 } }),
        existingKeys: new Set([KEY]),
        existingRows: new Map([[KEY, { amount: 80, createdAt: new Date('2026-11-24T08:00:00.000Z') }]]),
      }),
    );
    expect(result.zeloRows[0].amount).toBe(-80);
    expect(result.organizer?.zelo).toBe(0);
  });

  it('never drives Zelo below zero', () => {
    const result = evaluate(
      removed('2026-11-10T10:00:00.000Z', '2026-11-24T10:00:00.000Z'),
      input({
        organizer: organizer({ zelo: 10, lifetimeZelo: 10, caps: { 'hh:zelo.member_activated': 1 } }),
        existingKeys: new Set([KEY]),
        existingRows: new Map([[KEY, { amount: 40, createdAt: new Date('2026-11-24T08:00:00.000Z') }]]),
      }),
    );
    expect(result.zeloRows[0].amount).toBe(-40); // the ledger stays exact
    expect(result.organizer?.zelo).toBe(0);
  });

  it('claws back the paid chore_done amount when the chore dies within 7 days', () => {
    const choreKey = 'zelo.chore_done:chore-1:creator';
    const result = evaluate(
      {
        kind: 'chore.deleted',
        householdId: HH,
        choreId: 'chore-1',
        createdBy: CREATOR,
        isCustom: true,
        createdAt: new Date('2026-11-20T10:00:00.000Z'),
        deletedAt: new Date('2026-11-24T10:00:00.000Z'),
      },
      input({
        organizer: organizer({ zelo: 3, lifetimeZelo: 3, caps: { 'week:2026-11-16:zelo': 200, 'week:2026-11-16:zelo.chore_done': 10, 'week:2026-11-23:zelo': 3 } }),
        existingKeys: new Set([choreKey]),
        existingRows: new Map([[choreKey, { amount: 3, createdAt: new Date('2026-11-21T10:00:00.000Z') }]]),
      }),
    );
    expect(result.zeloRows[0].amount).toBe(-3);
    expect(result.organizer?.zelo).toBe(0);
    expect(result.organizer?.caps['week:2026-11-16:zelo']).toBe(197);
    expect(result.organizer?.caps['week:2026-11-16:zelo.chore_done']).toBe(9);
    expect(result.organizer?.caps['week:2026-11-23:zelo']).toBe(3);
  });
});

describe('organizer level-ups (G5)', () => {
  it('celebrates a level reached by a subtask-credit award, with an organizer-scoped id', () => {
    const start = organizer({ zelo: 195, lifetimeZelo: 195, level: 1 });
    const result = evaluate(subtaskEvent({ choreId: 'chore-2' }), input({ wallet: wallet('uidB'), organizer: start }));
    expect(result.organizer?.level).toBe(2);
    expect(result.celebrations.find((c) => c.moment === 'level')).toMatchObject({
      id: 'cel:level:organizer:2:creator',
      track: 'zelo',
      level: 2,
    });
    expect(result.serverEvents.some((e) => e.name === 'gami_level_up' && e.memberId === CREATOR)).toBe(true);
  });

  it('keeps the member and organizer level ids distinct', () => {
    const member = evaluate(
      subtaskEvent({ memberId: 'uidB', xpPeakAfter: 100 }),
      input({ wallet: { ...wallet('uidB'), xpPeak: 95 }, organizer: organizer({ zelo: 195, lifetimeZelo: 195, level: 1 }) }),
    );
    const ids = member.celebrations.filter((c) => c.moment === 'level').map((c) => c.id);
    expect(ids.sort()).toEqual(['cel:level:member:2:uidB', 'cel:level:organizer:2:creator']);
  });

  it('celebrates when the setup award crosses a threshold', () => {
    const thresholds = DEFAULT_RULE_SET.levels.organizer.thresholds;
    const rules = {
      ...DEFAULT_RULE_SET,
      levels: { ...DEFAULT_RULE_SET.levels, organizer: { thresholds: thresholds.map((t, i) => (i === 1 ? { ...t, zelo: 40 } : t)) } },
    };
    const result = evaluate(
      { kind: 'household.setup_finished', householdId: HH, finishedAt: new Date('2026-11-24T10:00:00.000Z') },
      input({ rules, organizer: null }),
    );
    expect(result.celebrations.find((c) => c.moment === 'level')).toMatchObject({ id: 'cel:level:organizer:2:creator' });
  });
});
