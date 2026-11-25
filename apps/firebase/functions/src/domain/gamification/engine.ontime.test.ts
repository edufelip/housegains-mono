import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE_SET } from './default-rule-set';
import { evaluate } from './engine';
import type { EngineInput, InstanceCompletedOnTimeEvent, WalletProjection } from './types';

const NOW = new Date('2026-11-24T12:00:00.000Z');
const CREATOR = 'creator';
const HH = 'hh1';

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

function onTimeEvent(overrides?: Partial<InstanceCompletedOnTimeEvent>): InstanceCompletedOnTimeEvent {
  return {
    kind: 'instance.completed_on_time',
    householdId: HH,
    instanceId: 'inst-1',
    dueAt: new Date('2026-11-24T18:00:00.000Z'),
    completedAt: new Date('2026-11-24T10:00:00.000Z'),
    assigneeIds: ['uidA', 'uidB'],
    contributorIds: ['uidA', 'uidB'],
    finalCompleterId: 'uidA',
    finalRowId: 'row-final',
    choreId: 'chore-1',
    choreUpdatedAt: null,
    ...overrides,
  };
}

describe('earn.on_time', () => {
  it('pays 10 to each assignee who contributed', () => {
    const result = evaluate(onTimeEvent(), input({ wallet: wallet('uidA') }));
    expect(result.walletRows).toEqual([
      expect.objectContaining({
        key: 'earn.on_time:inst-1|row-final:uidA',
        amount: 10,
        sourceRef: 'inst-1/row-final',
        memberId: 'uidA',
      }),
    ]);
    expect(result.wallet?.balance).toBe(10);
    expect(result.wallet?.stats.onTime).toBe(1);
    expect(result.wallet?.caps['day:2026-11-24:earn.on_time']).toBe(1);
    expect(result.celebrations[0]).toMatchObject({ moment: 'toast', amount: 10, copyKey: 'gami.earn.on_time' });
    expect(result.serverEvents.some((e) => e.name === 'gami_earned')).toBe(true);
  });

  it('ignores members who are not assignees or did not contribute', () => {
    const notAssignee = evaluate(
      onTimeEvent({ assigneeIds: ['uidB'], contributorIds: ['uidA', 'uidB'] }),
      input({ wallet: wallet('uidA') }),
    );
    expect(notAssignee.walletRows).toEqual([]);
    expect(notAssignee.wallet).toBeNull();

    const notContributor = evaluate(
      onTimeEvent({ contributorIds: ['uidB'] }),
      input({ wallet: wallet('uidA') }),
    );
    expect(notContributor.walletRows).toEqual([]);
  });

  it('pays at most three on-time awards per day', () => {
    const result = evaluate(
      onTimeEvent(),
      input({ wallet: wallet('uidA', { caps: { 'day:2026-11-24:earn.on_time': 3 } }) }),
    );
    expect(result.walletRows).toEqual([]);
  });

  it('skips chores inside the new-chore cooldown', () => {
    const result = evaluate(
      onTimeEvent({ choreUpdatedAt: new Date('2026-11-24T09:00:00.000Z') }),
      input({ wallet: wallet('uidA') }),
    );
    expect(result.walletRows).toEqual([]);
  });

  it('is idempotent per completion generation', () => {
    const first = evaluate(onTimeEvent(), input({ wallet: wallet('uidA') }));
    const replay = evaluate(
      onTimeEvent(),
      input({ wallet: first.wallet as WalletProjection, existingKeys: new Set(first.walletRows.map((r) => r.key)) }),
    );
    expect(replay.walletRows).toEqual([]);
    expect(replay.wallet).toBeNull();
  });

  it('pays again after a re-completion with a new final row id', () => {
    const first = evaluate(onTimeEvent(), input({ wallet: wallet('uidA') }));
    const recompleted = evaluate(
      onTimeEvent({ finalRowId: 'row-final-2' }),
      input({ wallet: first.wallet as WalletProjection, existingKeys: new Set(first.walletRows.map((r) => r.key)) }),
    );
    expect(recompleted.walletRows[0].key).toBe('earn.on_time:inst-1|row-final-2:uidA');
    // The re-completion's toast must not collide with the first one in the inbox.
    expect(recompleted.celebrations[0].id).not.toBe(first.celebrations[0].id);
  });

  it('does nothing for a member without a wallet (never contributed)', () => {
    const result = evaluate(onTimeEvent(), input({ wallet: null }));
    expect(result.walletRows).toEqual([]);
    expect(result.wallet).toBeNull();
  });
});
