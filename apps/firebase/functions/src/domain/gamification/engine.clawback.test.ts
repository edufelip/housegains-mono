import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE_SET } from './default-rule-set';
import { evaluate } from './engine';
import type { EngineInput, LedgerRevokeSubtaskEvent, LedgerUndoBonusEvent, LedgerUndoSubtaskEvent, WalletProjection } from './types';

const NOW = new Date('2026-11-24T12:00:00.000Z');
const CREATOR = 'creator';
const HH = 'hh1';
const AWARDED_AT = new Date('2026-11-24T10:00:00.000Z');

function wallet(overrides?: Partial<WalletProjection>): WalletProjection {
  return {
    householdId: HH,
    memberId: 'uidA',
    balance: 15,
    lifetimeEarned: 15,
    pendingBalance: 15,
    nextSpendableAt: new Date('2026-11-25T10:00:00.000Z'),
    level: 1,
    xpPeak: 10,
    streak: { current: 0, record: 0, lastCountedWeek: null, lastActionWeek: null, folgas: 0, folgaProgress: 0, awayWeeks: [] },
    achievements: {},
    stats: {
      assists: 1,
      finals: 1,
      onTime: 0,
      credits: 1,
      categories: { kitchen: 1 },
      weeksCounted: 0,
      recentWeeks: [],
      householdXpByWeek: {},
      springSubtasks: 0,
      springSeasonKey: null,
      decemberGoalWeeks: 0,
      streakMilestonesPaid: [],
    },
    caps: {
      // Only earn.subtask carries the dailyGanhos pool; the assist counts
      // toward the per-instance pool but has its own occurrence caps.
      'day:2026-11-24:ganhos': 10,
      'instance:inst-1:ganhos': 15,
      'day:2026-11-24:earn.assist': 1,
      'day:2026-11-24:earn.assist:target:uidB': 1,
    },
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
    existingKeys: new Set(['earn.subtask:row-1:uidA', 'earn.assist:row-1:uidA']),
    creatorUid: CREATOR,
    ...overrides,
  };
}

function undoEvent(overrides?: Partial<LedgerUndoSubtaskEvent>): LedgerUndoSubtaskEvent {
  return {
    kind: 'ledger.undo-subtask',
    householdId: HH,
    instanceId: 'inst-1',
    subtaskId: 'wash',
    memberId: 'uidA',
    reversedRowId: 'row-1',
    reversedAmount: 10,
    isAssist: true,
    category: 'kitchen',
    isFinalCompleter: true,
    instanceStatusAfter: 'open',
    assigneeIds: ['uidA', 'uidB'],
    completedAt: NOW,
    reversedAward: { subtask: { amount: 10, awardedAt: AWARDED_AT }, assist: { amount: 5, awardedAt: AWARDED_AT } },
    ...overrides,
  };
}

describe('subtask clawbacks', () => {
  it('reverses the subtask and assist rows, restoring caps, stats and balance', () => {
    const result = evaluate(undoEvent(), input({ wallet: wallet() }));
    expect(result.walletRows.map((row) => row.key)).toEqual([
      'rev:earn.subtask:row-1:uidA',
      'rev:earn.assist:row-1:uidA',
    ]);
    expect(result.walletRows[0]).toMatchObject({
      amount: -10,
      reversesEntryId: 'earn.subtask:row-1:uidA',
      reason: 'undo',
      sourceRef: 'row-1',
      memberId: 'uidA',
    });
    expect(result.walletRows[1].amount).toBe(-5);

    const next = result.wallet as WalletProjection;
    expect(next.balance).toBe(0);
    expect(next.lifetimeEarned).toBe(0);
    expect(next.pendingBalance).toBe(0);
    expect(next.nextSpendableAt).toBeNull();
    expect(next.caps['day:2026-11-24:ganhos']).toBe(0);
    expect(next.caps['instance:inst-1:ganhos']).toBe(0);
    expect(next.caps['day:2026-11-24:earn.assist']).toBe(0);
    expect(next.caps['day:2026-11-24:earn.assist:target:uidB']).toBe(0);
    expect(next.stats.credits).toBe(0);
    expect(next.stats.assists).toBe(0);
    expect(next.stats.finals).toBe(0);
    expect(next.stats.categories['kitchen']).toBe(0);
    expect(result.serverEvents.some((e) => e.name === 'gami_clawback')).toBe(true);
  });

  it('frees the daily cap so the next award is full again', () => {
    const result = evaluate(
      undoEvent({ reversedAward: { subtask: { amount: 40, awardedAt: AWARDED_AT }, assist: null } }),
      input({
        wallet: wallet({
          balance: 400,
          lifetimeEarned: 400,
          pendingBalance: 400,
          caps: { 'day:2026-11-24:ganhos': 400, 'instance:inst-1:ganhos': 40 },
        }),
      }),
    );
    expect(result.wallet?.caps['day:2026-11-24:ganhos']).toBe(360);
  });

  it('refunds the counters of the day the award was paid, not the reversal day (G3)', () => {
    // Day 1 earned 150, day 2 earned 400 (the cap). Revoking day 1's award on day 2 must free day 1's
    // counter and leave day 2's alone: lowering day 2's would let day 2 earn 550.
    const result = evaluate(
      undoEvent({
        completedAt: new Date('2026-11-25T12:00:00.000Z'),
        reversedAward: { subtask: { amount: 150, awardedAt: AWARDED_AT }, assist: null },
      }),
      input({
        wallet: wallet({
          caps: { 'day:2026-11-24:ganhos': 150, 'day:2026-11-25:ganhos': 400, 'instance:inst-1:ganhos': 150 },
        }),
      }),
    );
    expect(result.wallet?.caps['day:2026-11-24:ganhos']).toBe(0);
    expect(result.wallet?.caps['day:2026-11-25:ganhos']).toBe(400);
    expect(result.wallet?.caps['instance:inst-1:ganhos']).toBe(0);
  });

  it('refunds the award day for the assist occurrence caps too (G3)', () => {
    const result = evaluate(
      undoEvent({ completedAt: new Date('2026-11-25T12:00:00.000Z') }),
      input({
        wallet: wallet({
          caps: {
            'day:2026-11-24:earn.assist': 2,
            'day:2026-11-24:earn.assist:target:uidB': 1,
            'day:2026-11-25:earn.assist': 3,
            'day:2026-11-25:earn.assist:target:uidB': 2,
          },
        }),
      }),
    );
    expect(result.wallet?.caps['day:2026-11-24:earn.assist']).toBe(1);
    expect(result.wallet?.caps['day:2026-11-24:earn.assist:target:uidB']).toBe(0);
    expect(result.wallet?.caps['day:2026-11-25:earn.assist']).toBe(3);
    expect(result.wallet?.caps['day:2026-11-25:earn.assist:target:uidB']).toBe(2);
  });

  it('keeps pendingBalance when the reversed award was already spendable', () => {
    const result = evaluate(
      undoEvent({ completedAt: new Date('2026-11-25T12:00:00.000Z') }),
      input({
        wallet: wallet({
          pendingBalance: 0,
          nextSpendableAt: null,
          caps: { 'instance:inst-1:ganhos': 15 },
        }),
      }),
    );
    expect(result.wallet?.pendingBalance).toBe(0);
    expect(result.wallet?.balance).toBe(0);
  });

  it('reverses only the rows the event says were paid', () => {
    const result = evaluate(
      undoEvent({ reversedAward: { subtask: { amount: 10, awardedAt: AWARDED_AT }, assist: null } }),
      input({ wallet: wallet() }),
    );
    expect(result.walletRows.map((row) => row.key)).toEqual(['rev:earn.subtask:row-1:uidA']);
    expect(result.wallet?.stats.assists).toBe(1); // untouched: the assist row still stands
  });

  it('is idempotent: an already reversed key produces nothing', () => {
    const result = evaluate(
      undoEvent(),
      input({ existingKeys: new Set(['earn.subtask:row-1:uidA', 'rev:earn.subtask:row-1:uidA', 'earn.assist:row-1:uidA', 'rev:earn.assist:row-1:uidA']) }),
    );
    expect(result.walletRows).toEqual([]);
    expect(result.wallet).toBeNull();
  });

  it('does nothing when the original award never existed', () => {
    const result = evaluate(undoEvent(), input({ existingKeys: new Set<string>() }));
    expect(result.walletRows).toEqual([]);
  });

  it('labels moderation reversals with the verdict', () => {
    const revoke = {
      ...undoEvent(),
      kind: 'ledger.revoke-subtask',
      actorUid: CREATOR,
      verdict: 'not_done' as const,
      disputeId: 'disp-1',
    } as LedgerRevokeSubtaskEvent;
    const result = evaluate(revoke, input({ wallet: wallet() }));
    expect(result.walletRows[0].reason).toBe('revoke:not_done');
  });
});

describe('on_time clawbacks on reopened instances', () => {
  it('reverses the wallet owner’s on_time row when the instance reopens', () => {
    const result = evaluate(
      undoEvent({ reversedAward: { subtask: null, assist: null }, isAssist: false, isFinalCompleter: false }),
      input({
        wallet: wallet({
          stats: { ...wallet().stats, onTime: 1, credits: 0, assists: 0, finals: 0 },
          caps: { 'day:2026-11-24:earn.on_time': 1 },
        }),
        existingKeys: new Set(['earn.on_time:inst-1|row-final:uidA']),
      }),
    );
    expect(result.walletRows).toEqual([
      expect.objectContaining({
        key: 'rev:earn.on_time:inst-1|row-final:uidA',
        amount: -10,
        reversesEntryId: 'earn.on_time:inst-1|row-final:uidA',
      }),
    ]);
    expect(result.wallet?.stats.onTime).toBe(0);
    expect(result.wallet?.caps['day:2026-11-24:earn.on_time']).toBe(0);
  });

  it('reverses on_time when a partial revocation leaves the instance partial', () => {
    const result = evaluate(
      undoEvent({ reversedAward: { subtask: null, assist: null }, instanceStatusAfter: 'partial' }),
      input({ wallet: wallet(), existingKeys: new Set(['earn.on_time:inst-1|row-final:uidA']) }),
    );
    expect(result.walletRows).toHaveLength(1);
  });

  it('keeps on_time when the instance stays done', () => {
    const result = evaluate(
      undoEvent({ reversedAward: { subtask: null, assist: null }, instanceStatusAfter: 'done' }),
      input({ existingKeys: new Set(['earn.on_time:inst-1|row-final:uidA']) }),
    );
    expect(result.walletRows).toEqual([]);
  });

  const ON_TIME_KEY = 'earn.on_time:inst-1|row-final:uidA';
  const onTimeInput = (paid: { amount: number; createdAt: Date }, extra?: Partial<EngineInput>) =>
    input({
      wallet: wallet({
        pendingBalance: 20,
        stats: { ...wallet().stats, onTime: 1, credits: 0, assists: 0, finals: 0 },
        caps: { 'day:2026-11-24:earn.on_time': 1 },
      }),
      existingKeys: new Set([ON_TIME_KEY]),
      existingRows: new Map([[ON_TIME_KEY, paid]]),
      ...extra,
    });
  const reopen = (overrides?: Partial<LedgerUndoSubtaskEvent>) =>
    undoEvent({ reversedAward: { subtask: null, assist: null }, isAssist: false, isFinalCompleter: false, ...overrides });

  it('claws back what the on_time row actually paid, not the rule amount (G2)', () => {
    // A Turbo campaign paid 20 where the rule says 10; a trimmed row paid 4.
    const campaign = evaluate(reopen(), onTimeInput({ amount: 20, createdAt: AWARDED_AT }));
    expect(campaign.walletRows[0].amount).toBe(-20);
    expect(campaign.wallet?.pendingBalance).toBe(0);
    const trimmed = evaluate(reopen(), onTimeInput({ amount: 4, createdAt: AWARDED_AT }));
    expect(trimmed.walletRows[0].amount).toBe(-4);
    expect(trimmed.wallet?.pendingBalance).toBe(16);
  });

  it('refunds the on_time counter of the day it was paid (G3)', () => {
    const result = evaluate(
      reopen({ completedAt: new Date('2026-11-25T12:00:00.000Z') }),
      onTimeInput(
        { amount: 10, createdAt: AWARDED_AT },
        { wallet: wallet({ caps: { 'day:2026-11-24:earn.on_time': 1, 'day:2026-11-25:earn.on_time': 3 } }) },
      ),
    );
    expect(result.wallet?.caps['day:2026-11-24:earn.on_time']).toBe(0);
    expect(result.wallet?.caps['day:2026-11-25:earn.on_time']).toBe(3);
  });

  it('derives the on_time counter window from the rule caps instead of assuming a day (G6)', () => {
    const weekly = {
      ...DEFAULT_RULE_SET,
      earnRules: DEFAULT_RULE_SET.earnRules.map((rule) =>
        rule.id === 'earn.on_time' ? { ...rule, caps: [{ scope: 'member' as const, window: 'week' as const, max: 5 }] } : rule,
      ),
    };
    const result = evaluate(
      reopen(),
      onTimeInput(
        { amount: 10, createdAt: AWARDED_AT },
        {
          rules: weekly,
          wallet: wallet({ caps: { 'week:2026-11-23:earn.on_time': 2, 'day:2026-11-24:earn.on_time': 2 } }),
        },
      ),
    );
    expect(result.wallet?.caps['week:2026-11-23:earn.on_time']).toBe(1);
    expect(result.wallet?.caps['day:2026-11-24:earn.on_time']).toBe(2);
  });

  it('skips rows that were already reversed (older completion generation)', () => {
    const result = evaluate(
      undoEvent({ reversedAward: { subtask: null, assist: null } }),
      input({
        wallet: wallet(),
        existingKeys: new Set([
          'earn.on_time:inst-1|row-final:uidA',
          'rev:earn.on_time:inst-1|row-final:uidA',
          'earn.on_time:inst-1|row-final-2:uidA',
        ]),
      }),
    );
    expect(result.walletRows.map((row) => row.key)).toEqual(['rev:earn.on_time:inst-1|row-final-2:uidA']);
  });
});

describe('bonus clawbacks', () => {
  function undoBonus(overrides?: Partial<LedgerUndoBonusEvent>): LedgerUndoBonusEvent {
    return {
      kind: 'ledger.undo-bonus',
      householdId: HH,
      instanceId: 'inst-1',
      memberId: 'uidA',
      reversedRowId: 'bonus-row-1',
      reversedAmount: 5,
      completedAt: NOW,
      reversedAward: { bonus: { amount: 5, awardedAt: AWARDED_AT } },
      ...overrides,
    };
  }

  it('reverses the bonus row and its pools', () => {
    const result = evaluate(
      undoBonus(),
      input({
        wallet: wallet({
          balance: 5,
          lifetimeEarned: 5,
          pendingBalance: 5,
          caps: { 'day:2026-11-24:ganhos': 5, 'instance:inst-1:ganhos': 5 },
        }),
        existingKeys: new Set(['earn.bonus:bonus-row-1:uidA']),
      }),
    );
    expect(result.walletRows).toEqual([
      expect.objectContaining({ key: 'rev:earn.bonus:bonus-row-1:uidA', amount: -5, reason: 'undo' }),
    ]);
    expect(result.wallet?.balance).toBe(0);
    expect(result.wallet?.caps['day:2026-11-24:ganhos']).toBe(0);
    expect(result.wallet?.caps['instance:inst-1:ganhos']).toBe(0);
  });

  it('refunds the award day for a bonus reversed on a later day (G3)', () => {
    const result = evaluate(
      undoBonus({ completedAt: new Date('2026-11-25T12:00:00.000Z') }),
      input({
        wallet: wallet({
          balance: 5,
          lifetimeEarned: 5,
          pendingBalance: 5,
          caps: { 'day:2026-11-24:ganhos': 5, 'day:2026-11-25:ganhos': 400, 'instance:inst-1:ganhos': 5 },
        }),
        existingKeys: new Set(['earn.bonus:bonus-row-1:uidA']),
      }),
    );
    expect(result.wallet?.caps['day:2026-11-24:ganhos']).toBe(0);
    expect(result.wallet?.caps['day:2026-11-25:ganhos']).toBe(400);
  });

  it('is idempotent too', () => {
    const result = evaluate(
      undoBonus(),
      input({
        existingKeys: new Set(['earn.bonus:bonus-row-1:uidA', 'rev:earn.bonus:bonus-row-1:uidA']),
      }),
    );
    expect(result.walletRows).toEqual([]);
  });
});
