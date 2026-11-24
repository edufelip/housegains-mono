import { Timestamp, Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dateKeyInTimeZone } from '../../src/domain/time';
import { weekStartKeyForDateKey } from '../../src/domain/gamification';
import { closeAllWeeks } from '../../src/scheduled';
import { adminDb, createHousehold, must, withProfile, type TestUser } from './helpers';
import {
  LIVE,
  gamiHousehold,
  inboxOf,
  nextOpenInstance,
  organizerLedger,
  resetGamiConfig,
  setGamiConfig,
  walletLedger,
  walletOf,
} from './gami-helpers';

// Review fixes for the gamification wiring: Zelo clawbacks reverse what was paid (G1) and the week close
// is retryable (G4), plus a week close that survives a failing dispute expiry (B2).

afterAll(resetGamiConfig);
beforeEach(resetGamiConfig);

const WEEK = '2026-11-16';
const CLOSE_AT = new Date('2026-11-23T03:00:00Z');
const T = (iso: string) => Timestamp.fromDate(new Date(iso));

describe('Zelo clawbacks reverse the paid amount (G1)', () => {
  it('removeMember claws back what member_activated actually paid after the weekly Zelo pool trimmed it', async () => {
    await setGamiConfig(LIVE);
    const { member, creator, householdId, choreId } = await gamiHousehold('g1', {
      subtasks: [
        { id: 'a', name: 'A', xp: 5, position: 0 },
        { id: 'b', name: 'B', xp: 5, position: 1 },
        { id: 'c', name: 'C', xp: 5, position: 2 },
      ],
      bonusXp: 0,
    });
    // 190 of this week's 200 Zelo pool is already used: chore_done pays its 5, member_activated is trimmed 40 -> 5.
    const weekStart = weekStartKeyForDateKey(dateKeyInTimeZone(new Date(), 'UTC'));
    await adminDb()
      .doc(`households/${householdId}/organizer/${creator.uid}`)
      .set({
        householdId,
        memberId: creator.uid,
        zelo: 190,
        lifetimeZelo: 190,
        level: 1,
        caps: { [`week:${weekStart}:zelo`]: 190 },
      });
    const instance = await nextOpenInstance(householdId, choreId);
    for (const subtaskId of ['a', 'b', 'c']) {
      await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId });
    }
    const key = `zelo.member_activated:${member.uid}:${creator.uid}`;
    expect((await organizerLedger(householdId))[key]).toMatchObject({ amount: 5 });

    await must('removeMember', creator.token, { householdId, uid: member.uid });

    const zelo = await organizerLedger(householdId);
    expect(zelo[`rev:${key}`]).toMatchObject({ amount: -5, reversesEntryId: key });
    const organizer = (await adminDb().doc(`households/${householdId}/organizer/${creator.uid}`).get()).data()!;
    // 190 + 5 (chore_done) + 5 (member_activated) - 5: the old flat -40 would have left 160 and refunded 40 to the pool.
    expect(organizer.zelo).toBe(195);
    expect(organizer.caps[`week:${weekStart}:zelo`]).toBe(195);
  });
});

interface WeekHousehold {
  creator: TestUser;
  a: TestUser;
  b: TestUser;
  householdId: string;
}

async function weekHousehold(label: string): Promise<WeekHousehold> {
  const creator = await withProfile(`${label}-c`, 'Alex');
  const { householdId, code } = await createHousehold(creator);
  const a = await withProfile(`${label}-a`, 'Sam');
  const b = await withProfile(`${label}-b`, 'Bea');
  await must('joinHousehold', a.token, { code });
  await must('joinHousehold', b.token, { code });
  // A goal every seeded week reaches, so each member earns a week_goal row.
  await adminDb().doc(`households/${householdId}`).update({ weeklyGoalXp: 100 });
  const ledger = adminDb().collection(`households/${householdId}/ledger`);
  await Promise.all(
    [
      { memberId: a.uid, at: '2026-11-16T12:00:00Z' },
      { memberId: a.uid, at: '2026-11-17T12:00:00Z' },
      { memberId: a.uid, at: '2026-11-18T12:00:00Z' },
      { memberId: b.uid, at: '2026-11-19T12:00:00Z' },
    ].map((row) => ledger.add({ memberId: row.memberId, amount: 100, source: 'subtask', createdAt: T(row.at) })),
  );
  // The engine only processes members that already have a wallet (welcome bonus burnt, so only the week pays).
  await Promise.all(
    [a, b].map((user) =>
      adminDb().doc(`wallets/${user.uid}`).set({
        householdId,
        memberId: user.uid,
        balance: 0,
        stats: { welcomePaid: true },
        streak: { current: 0, record: 0, lastCountedWeek: null, lastActionWeek: null, folgas: 0, folgaProgress: 0 },
      }),
    ),
  );
  return { creator, a, b, householdId };
}

const weekDoc = (householdId: string) => adminDb().doc(`households/${householdId}/weeks/${WEEK}`);

describe('the weekly gamification close is retryable (G4)', () => {
  it('replays a failed engine run on the next pass, once, and then leaves the week alone', async () => {
    await setGamiConfig(LIVE);
    const { a, householdId } = await weekHousehold('g4');

    // The engine run for this household fails (a wallet write throws) after the week doc was created.
    const original = Transaction.prototype.create;
    const spy = vi
      .spyOn(Transaction.prototype, 'create')
      .mockImplementation(function (this: Transaction, ref: DocumentReference, data: Record<string, unknown>) {
        if (ref.path.startsWith(`wallets/${a.uid}/`)) throw new Error('injected engine failure');
        return original.call(this, ref, data);
      });
    try {
      await closeAllWeeks(CLOSE_AT);
    } finally {
      spy.mockRestore();
    }
    const failed = await weekDoc(householdId).get();
    expect(failed.exists).toBe(true);
    expect(failed.get('gamification.processedAt')).toBeUndefined();
    expect(await walletLedger(a.uid)).toEqual({});

    // The next hourly pass finds the week without its marker and runs the close again.
    await closeAllWeeks(new Date('2026-11-23T04:00:00Z'));
    const retried = await weekDoc(householdId).get();
    expect(retried.get('gamification.processedAt')).toBeInstanceOf(Timestamp);
    expect(retried.get('closedAt').toDate().toISOString()).toBe('2026-11-23T03:00:00.000Z');
    expect((await walletLedger(a.uid))[`earn.week_goal:${WEEK}:${a.uid}`]).toMatchObject({ amount: 30 });
    expect((await walletOf(a.uid))!.streak).toMatchObject({ lastActionWeek: WEEK });
    const inboxAfterRetry = (await inboxOf(a.uid)).map((row) => row.id).sort();
    const marker = retried.get('gamification.processedAt').toMillis();

    // Marked weeks are not replayed: nothing changes, not even the marker.
    await closeAllWeeks(new Date('2026-11-23T05:00:00Z'));
    expect((await weekDoc(householdId).get()).get('gamification.processedAt').toMillis()).toBe(marker);
    expect(Object.keys(await walletLedger(a.uid))).toEqual([`earn.week_goal:${WEEK}:${a.uid}`]);
    expect((await inboxOf(a.uid)).map((row) => row.id).sort()).toEqual(inboxAfterRetry);
  });

  it('marks a week processed on the first successful run', async () => {
    await setGamiConfig(LIVE);
    const { householdId } = await weekHousehold('g4-ok');
    await closeAllWeeks(CLOSE_AT);
    expect((await weekDoc(householdId).get()).get('gamification.processedAt')).toBeInstanceOf(Timestamp);
  });

  it('leaves a week closed while the program was off without a marker or gamification data', async () => {
    const { householdId } = await weekHousehold('g4-off');
    await closeAllWeeks(CLOSE_AT);
    const doc = await weekDoc(householdId).get();
    expect(doc.exists).toBe(true);
    expect(doc.get('gamification')).toBeUndefined();
  });
});

describe('a week close survives a dispute that cannot be expired (B2)', () => {
  it('still runs the gamification close when a stale dispute has no instance', async () => {
    await setGamiConfig(LIVE);
    const { a, householdId } = await weekHousehold('b2-hook');
    // A stale open dispute whose instance document does not exist: expiring it used to fail the
    // whole batch, after the week doc was written and before the hooks ran.
    await adminDb()
      .doc(`households/${householdId}/disputes/ghost`)
      .set({
        instanceId: 'ghost',
        choreName: 'Ghost',
        status: 'open',
        subtaskIds: ['x'],
        completerIds: [a.uid],
        reports: [],
        createdAt: T('2026-11-01T00:00:00Z'),
        expiresAt: T('2026-11-04T00:00:00Z'),
      });

    await closeAllWeeks(CLOSE_AT);

    expect((await adminDb().doc(`households/${householdId}/disputes/ghost`).get()).get('status')).toBe('expired');
    expect((await weekDoc(householdId).get()).get('gamification.processedAt')).toBeInstanceOf(Timestamp);
    expect((await walletLedger(a.uid))[`earn.week_goal:${WEEK}:${a.uid}`]).toMatchObject({ amount: 30 });
  });
});
