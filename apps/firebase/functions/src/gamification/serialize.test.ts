import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { createOrganizer, createWallet, type WalletProjection } from '../domain/gamification';
import { onTimeCounts } from './facts';
import { storedWeekAggregates } from './week-close';
import { celebrationToDoc, organizerFromDoc, organizerToDoc, walletFromDoc, walletToDoc } from './serialize';

// The Firestore round trip of the C3 projections: what the runner writes is what the next run reads.

const NOW = new Date('2026-11-24T12:00:00.000Z');

describe('wallet projection serialization', () => {
  it('round-trips every field the engine keeps', () => {
    const wallet: WalletProjection = {
      ...createWallet('h1', 'uidA', NOW),
      balance: 120,
      lifetimeEarned: 150,
      pendingBalance: 30,
      nextSpendableAt: new Date('2026-11-25T12:00:00.000Z'),
      level: 3,
      xpPeak: 340,
      achievements: {
        helper: { tier: 'silver', unlockedAt: NOW },
        fit: { tier: 'bronze', unlockedAt: NOW, active: false },
      },
      caps: { 'day:2026-11-24:ganhos': 40 },
    };
    wallet.streak = { current: 4, record: 6, lastCountedWeek: '2026-11-16', lastActionWeek: '2026-11-16', folgas: 1, folgaProgress: 2, awayWeeks: ['2026-12-07'] };
    wallet.stats = {
      ...wallet.stats,
      assists: 3,
      finals: 2,
      onTime: 4,
      credits: 9,
      categories: { kitchen: 5 },
      welcomePaid: true,
      recentWeeks: [{ weekStart: '2026-11-16', counted: true, xp: 90 }],
      householdXpByWeek: { '2026-11-16': 400 },
      streakMilestonesPaid: [2],
    };
    expect(walletFromDoc(walletToDoc(wallet), 'h1', 'uidA')).toEqual(wallet);
  });

  it('loads a bare wallet written by setAwayWeeks or by an older version', () => {
    const loaded = walletFromDoc({ streak: { awayWeeks: ['2026-12-07'] }, stats: { welcomePaid: true } }, 'h1', 'uidA');
    expect(loaded).toMatchObject({ balance: 0, level: 1, xpPeak: 0, householdId: 'h1', memberId: 'uidA' });
    expect(loaded.streak).toMatchObject({ current: 0, awayWeeks: ['2026-12-07'] });
    expect(loaded.stats.welcomePaid).toBe(true);
    expect(loaded.achievements).toEqual({});
  });

  it('writes plain Firestore values (timestamps, no undefined)', () => {
    const doc = walletToDoc(createWallet('h1', 'uidA', NOW));
    expect(doc.updatedAt).toBeInstanceOf(Timestamp);
    expect(doc.nextSpendableAt).toBeNull();
    expect(JSON.stringify(doc)).not.toContain('undefined');
  });
});

describe('organizer projection serialization', () => {
  it('round-trips', () => {
    const organizer = createOrganizer('h1', 'creator', NOW);
    organizer.zelo = 110;
    organizer.lifetimeZelo = 110;
    organizer.streak = { current: 2, record: 2, lastCountedWeek: '2026-11-16', lastActionWeek: '2026-11-16', folgas: 0, folgaProgress: 2 };
    organizer.stats.customChoreCompletions = { c1: 4 };
    organizer.stats.orderWeeks = [{ weekStart: '2026-11-16', due: 5, onTime: 5 }];
    organizer.achievements = { host: { tier: 'bronze', unlockedAt: NOW } };
    expect(organizerFromDoc(organizerToDoc(organizer), 'h1', 'creator')).toEqual(organizer);
  });
});

describe('inbox rows', () => {
  it('keep the celebration fields and start unseen', () => {
    const doc = celebrationToDoc(
      { id: 'cel:toast:r1:uidA', moment: 'toast', track: 'ganhos', amount: 15, parts: [{ ruleId: 'earn.subtask', amount: 10 }], copyKey: 'gami.earn.chore' },
      NOW,
    );
    expect(doc).toMatchObject({ id: 'cel:toast:r1:uidA', moment: 'toast', amount: 15, seen: false, copyKey: 'gami.earn.chore' });
    expect(doc.createdAt).toBeInstanceOf(Timestamp);
    expect('level' in doc).toBe(false);
  });
});

describe('onTimeCounts', () => {
  const at = (iso: string) => Timestamp.fromDate(new Date(iso));
  const instance = (fields: Record<string, unknown>) => ({ get: (field: string) => fields[field] });

  it('counts done instances whose last completion beat the due time', () => {
    const counts = onTimeCounts([
      instance({ status: 'done', dueAt: at('2026-11-18T20:00:00Z'), completions: [{ completedAt: at('2026-11-18T10:00:00Z') }] }),
      instance({ status: 'done', dueAt: at('2026-11-18T20:00:00Z'), completions: [{ completedAt: at('2026-11-18T10:00:00Z') }, { completedAt: at('2026-11-18T21:00:00Z') }] }),
      instance({ status: 'partial', dueAt: at('2026-11-18T20:00:00Z'), completions: [] }),
    ]);
    expect(counts).toEqual({ due: 3, onTime: 1 });
  });
});

describe('onTimeCounts retired instances', () => {
  it('skips retired instances: they are not due work', () => {
    const doc = (fields: Record<string, unknown>) => ({ get: (field: string) => fields[field] });
    const counts = onTimeCounts([
      doc({ status: 'done', dueAt: Timestamp.fromDate(NOW), completions: [] }),
      doc({ status: 'partial', dueAt: Timestamp.fromDate(NOW), retiredAt: Timestamp.fromDate(NOW) }),
    ]);
    expect(counts).toEqual({ due: 1, onTime: 1 });
  });
});

describe('storedWeekAggregates', () => {
  it('reads the stored snapshot, and null when it is absent or malformed', () => {
    expect(
      storedWeekAggregates({ onTimeRate: 80, dueInstances: 5, doneOnTime: 4, goalReached: true, weeklyGoalXp: 400 }),
    ).toEqual({ due: 5, onTime: 4, goalReached: true, weeklyGoalXp: 400 });
    expect(storedWeekAggregates({ dueInstances: 5, doneOnTime: 4, goalReached: false, weeklyGoalXp: null })).toEqual({
      due: 5,
      onTime: 4,
      goalReached: false,
      weeklyGoalXp: null,
    });
    // A doc that predates weeklyGoalXp still reuses the rest.
    expect(storedWeekAggregates({ dueInstances: 5, doneOnTime: 4, goalReached: false })).toMatchObject({
      weeklyGoalXp: undefined,
    });
    expect(storedWeekAggregates(undefined)).toBeNull();
    expect(storedWeekAggregates({ processedAt: 'x', skipped: 'no-creator' })).toBeNull();
    expect(storedWeekAggregates({ dueInstances: 5, doneOnTime: 4 })).toBeNull();
  });
});
