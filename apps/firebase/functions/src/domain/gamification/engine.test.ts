import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE_SET } from './default-rule-set';
import { evaluate, rebuildWalletProjection } from './engine';
import type { EngineInput, WalletProjection } from './types';

const NOW = new Date('2026-11-24T12:00:00.000Z');
const CREATOR = 'creator';
const HH = 'hh1';

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

describe('rebuildWalletProjection', () => {
  it('replays rows into balance, lifetime, pending and next spendable', () => {
    const rows = [
      { key: 'r1', amount: 50, createdAt: new Date('2026-11-20T10:00:00.000Z'), spendableAt: new Date('2026-11-21T10:00:00.000Z') },
      { key: 'r2', amount: 30, createdAt: new Date('2026-11-24T10:00:00.000Z'), spendableAt: new Date('2026-11-25T10:00:00.000Z') },
      { key: 'r3', amount: 20, createdAt: new Date('2026-11-24T11:00:00.000Z'), spendableAt: new Date('2026-11-25T11:00:00.000Z') },
      { key: 'rev:r2', amount: -30, createdAt: new Date('2026-11-24T12:00:00.000Z'), spendableAt: new Date('2026-11-24T12:00:00.000Z'), reversesEntryId: 'r2' },
    ];
    const projection = rebuildWalletProjection(rows, {
      now: NOW,
      xpPeak: 1840,
      householdId: HH,
      memberId: 'uidA',
    });
    expect(projection.balance).toBe(70);
    expect(projection.lifetimeEarned).toBe(70); // 100 earned minus the reversed 30
    expect(projection.pendingBalance).toBe(20); // the reversed 30 was still pending
    expect(projection.nextSpendableAt?.toISOString()).toBe('2026-11-25T11:00:00.000Z');
    expect(projection.level).toBe(6);
    expect(projection.xpPeak).toBe(1840);
    expect(projection.memberId).toBe('uidA');
    expect(projection.caps).toEqual({});
    expect(projection.streak.current).toBe(0);
  });

  it('treats rows without spendableAt as immediately spendable', () => {
    const projection = rebuildWalletProjection(
      [
        { amount: 10, createdAt: NOW },
        { amount: 5, createdAt: NOW, spendableAt: new Date('2026-11-26T10:00:00.000Z') },
      ],
      { now: NOW, xpPeak: 0, householdId: HH, memberId: 'uidA' },
    );
    expect(projection.balance).toBe(15);
    expect(projection.pendingBalance).toBe(5);
    expect(projection.nextSpendableAt?.toISOString()).toBe('2026-11-26T10:00:00.000Z');
  });

  it('returns a spendable-only wallet with no next date when nothing is pending', () => {
    const projection = rebuildWalletProjection(
      [{ amount: 10, createdAt: NOW, spendableAt: new Date('2026-11-23T10:00:00.000Z') }],
      { now: NOW, xpPeak: 0, householdId: HH, memberId: 'uidA' },
    );
    expect(projection.pendingBalance).toBe(0);
    expect(projection.nextSpendableAt).toBeNull();
  });
});

describe('engine output hygiene', () => {
  it('marks emitted rows with the rule set version and household', () => {
    const result = evaluate(
      {
        kind: 'feed.post',
        householdId: HH,
        postId: 'post-1',
        memberId: 'uidA',
        postedAt: new Date('2026-11-24T10:00:00.000Z'),
      },
      input({ ruleSetVersion: 7 }),
    );
    expect(result.walletRows[0].ruleSetVersion).toBe(7);
    expect(result.walletRows[0].householdId).toBe(HH);
    expect(result.serverEvents.every((event) => event.householdId === HH)).toBe(true);
  });

  it('uses the action time for rows and the input now for projections', () => {
    const result = evaluate(
      {
        kind: 'feed.post',
        householdId: HH,
        postId: 'post-1',
        memberId: 'uidA',
        postedAt: new Date('2026-11-24T10:00:00.000Z'),
      },
      input(),
    );
    expect(result.walletRows[0].createdAt.toISOString()).toBe('2026-11-24T10:00:00.000Z');
    expect(result.wallet?.updatedAt.toISOString()).toBe('2026-11-24T12:00:00.000Z');
  });

  it('keeps organizer projections untouched on member-only events', () => {
    const result = evaluate(
      {
        kind: 'feed.post',
        householdId: HH,
        postId: 'post-1',
        memberId: 'uidA',
        postedAt: NOW,
      },
      input(),
    );
    expect(result.organizer).toBeNull();
    expect(result.zeloRows).toEqual([]);
  });
});

describe('wallet projection type shape', () => {
  it('exposes the C3 projection fields', () => {
    const projection: WalletProjection = rebuildWalletProjection([], {
      now: NOW,
      xpPeak: 0,
      householdId: HH,
      memberId: 'uidA',
    });
    for (const key of [
      'balance',
      'lifetimeEarned',
      'pendingBalance',
      'nextSpendableAt',
      'level',
      'xpPeak',
      'streak',
      'achievements',
      'stats',
      'caps',
      'projectionVersion',
      'updatedAt',
    ] as const) {
      expect(projection, key).toHaveProperty(key);
    }
    expect(projection.projectionVersion).toBe(1);
  });
});
