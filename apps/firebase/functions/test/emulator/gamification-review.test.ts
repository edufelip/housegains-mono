import { FieldValue, Timestamp, Transaction, type DocumentReference } from 'firebase-admin/firestore';
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
  serverEvents,
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

  it('stamps a week closed while the program was off with a terminal marker, and never replays it', async () => {
    const { a, householdId } = await weekHousehold('g4-off');
    await closeAllWeeks(CLOSE_AT);
    const doc = await weekDoc(householdId).get();
    expect(doc.exists).toBe(true);
    expect(doc.get('gamification')).toEqual({ processedAt: expect.any(Timestamp), skipped: 'off' });
    const marker = doc.get('gamification.processedAt').toMillis();

    // Turning the program on later does not retro-process the old week.
    await setGamiConfig(LIVE);
    await closeAllWeeks(new Date('2026-11-23T04:00:00Z'));
    const after = await weekDoc(householdId).get();
    expect(after.get('gamification')).toEqual({ processedAt: expect.any(Timestamp), skipped: 'off' });
    expect(after.get('gamification.processedAt').toMillis()).toBe(marker);
    expect(await walletLedger(a.uid)).toEqual({});
  });

  it('keeps a week that closed while live pending while ops switches the program off, then processes it', async () => {
    await setGamiConfig(LIVE);
    const { a, householdId } = await weekHousehold('g4-kill');

    // The close runs live but its engine run fails, so the week stays without its marker.
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
    expect((await weekDoc(householdId).get()).get('gamiEligible')).toBe(true);

    // Ops flips the kill switch: the retry pass must not stamp the live week as skipped.
    await setGamiConfig({ mode: 'off' });
    await closeAllWeeks(new Date('2026-11-23T04:00:00Z'));
    const pending = await weekDoc(householdId).get();
    expect(pending.get('gamification.processedAt')).toBeUndefined();
    expect(pending.get('gamification.skipped')).toBeUndefined();

    // Back on: the week is processed, not lost as a gap.
    await setGamiConfig(LIVE);
    await closeAllWeeks(new Date('2026-11-23T05:00:00Z'));
    const processed = await weekDoc(householdId).get();
    expect(processed.get('gamification.processedAt')).toBeInstanceOf(Timestamp);
    expect(processed.get('gamification.skipped')).toBeUndefined();
    expect((await walletLedger(a.uid))[`earn.week_goal:${WEEK}:${a.uid}`]).toMatchObject({ amount: 30 });
  });

  it('treats a week doc written before gamiEligible existed as closed while off', async () => {
    await setGamiConfig(LIVE);
    const { a, householdId } = await weekHousehold('g4-legacy');
    await closeAllWeeks(CLOSE_AT);
    // Rewrite the doc as the pre-flag close left it: no eligibility, no gamification data.
    await weekDoc(householdId).update({ gamiEligible: FieldValue.delete(), gamification: FieldValue.delete() });
    const before = await walletLedger(a.uid);
    await closeAllWeeks(new Date('2026-11-23T04:00:00Z'));
    expect((await weekDoc(householdId).get()).get('gamification.skipped')).toBe('off');
    expect(await walletLedger(a.uid)).toEqual(before);
  });

  it('stamps a week of a household without a creator as skipped: no-creator', async () => {
    await setGamiConfig(LIVE);
    const { a, householdId } = await weekHousehold('g4-nocreator');
    await adminDb().doc(`households/${householdId}`).update({ creatorUid: FieldValue.delete() });
    await closeAllWeeks(CLOSE_AT);
    expect((await weekDoc(householdId).get()).get('gamification')).toEqual({
      processedAt: expect.any(Timestamp),
      skipped: 'no-creator',
    });
    expect(await walletLedger(a.uid)).toEqual({});
  });
});

async function seedInstances(householdId: string, assignee: string, count: number, onTime: number) {
  await Promise.all(
    Array.from({ length: count }, (_, index) => {
      const day = 17 + (index % 5);
      const done = index < onTime;
      return adminDb()
        .doc(`households/${householdId}/instances/seed${index}`)
        .set({
          choreId: 'seed',
          assigneeIds: [assignee],
          status: done ? 'done' : 'partial',
          dueAt: T(`2026-11-${day}T20:00:00Z`),
          completions: done
            ? [{ memberId: assignee, subtaskId: 's', xp: 1, completedAt: T(`2026-11-${day}T10:00:00Z`) }]
            : [],
        });
    }),
  );
}

describe('a replayed week keeps its snapshot (N5)', () => {
  it('reuses the stored aggregates instead of recomputing them from the current instances', async () => {
    await setGamiConfig(LIVE);
    const { creator, a, householdId } = await weekHousehold('n5-snap');
    await seedInstances(householdId, a.uid, 5, 5);

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
    expect(failed.get('gamification.processedAt')).toBeUndefined();
    expect(failed.get('gamification')).toMatchObject({ dueInstances: 5, doneOnTime: 5, onTimeRate: 100, goalReached: true });

    // The instances drift after the close (here: every one is undone), but the week closed as 5 of 5.
    await Promise.all(
      [0, 1, 2, 3, 4].map((index) =>
        adminDb().doc(`households/${householdId}/instances/seed${index}`).update({ status: 'partial', completions: [] }),
      ),
    );
    await closeAllWeeks(new Date('2026-11-23T04:00:00Z'));

    const replayed = await weekDoc(householdId).get();
    expect(replayed.get('gamification')).toMatchObject({ dueInstances: 5, doneOnTime: 5, onTimeRate: 100, goalReached: true });
    expect(replayed.get('gamification.processedAt')).toBeInstanceOf(Timestamp);
    // The Zelo on-time bonus was paid on the stored 100%, not on the drifted 0%.
    expect((await organizerLedger(householdId))[`zelo.on_time:${WEEK}:${creator.uid}`]).toMatchObject({ amount: 60 });
  });
});

describe('unprocessed week docs replay oldest first (N4)', () => {
  const OLDER_WEEK = '2026-11-09';

  /** A closed week doc written by Part B whose gamification never ran. */
  async function seedOlderWeek(householdId: string, a: TestUser, b: TestUser) {
    await adminDb()
      .doc(`households/${householdId}/weeks/${OLDER_WEEK}`)
      .set({
        gamiEligible: true,
        weekStart: OLDER_WEEK,
        weekEnd: '2026-11-15',
        timeZone: 'UTC',
        closedAt: T('2026-11-16T03:00:00Z'),
        members: {
          [a.uid]: { xp: 300, subtasks: 3, assignedDue: 0, missed: 0 },
          [b.uid]: { xp: 0, subtasks: 0, assignedDue: 0, missed: 0 },
        },
        topMember: { memberId: a.uid, xp: 300, subtasks: 3 },
        wallOfShame: null,
      });
    await adminDb()
      .doc(`wallets/${a.uid}`)
      .set(
        { streak: { current: 1, record: 1, lastCountedWeek: '2026-11-02', lastActionWeek: '2026-11-02' } },
        { merge: true },
      );
  }

  it('counts a week whose gamification failed for more than a week instead of replaying it as a gap', async () => {
    await setGamiConfig(LIVE);
    const { a, b, householdId } = await weekHousehold('n4-order');
    await seedOlderWeek(householdId, a, b);

    await closeAllWeeks(CLOSE_AT);

    const older = await adminDb().doc(`households/${householdId}/weeks/${OLDER_WEEK}`).get();
    expect(older.get('gamification.processedAt')).toBeInstanceOf(Timestamp);
    expect((await weekDoc(householdId).get()).get('gamification.processedAt')).toBeInstanceOf(Timestamp);
    // Both weeks counted for A (1 -> 2 -> 3); as a gap the older week would have broken the streak.
    expect((await walletOf(a.uid))!.streak).toMatchObject({ current: 3, lastCountedWeek: WEEK, lastActionWeek: WEEK });
    expect((await walletLedger(a.uid))[`earn.week_goal:${OLDER_WEEK}:${a.uid}`]).toMatchObject({ amount: 30 });
  });

  it('holds the latest week back while an older one is still failing, then replays both in order', async () => {
    await setGamiConfig(LIVE);
    const { a, b, householdId } = await weekHousehold('n4-block');
    await seedOlderWeek(householdId, a, b);

    const original = Transaction.prototype.create;
    const spy = vi
      .spyOn(Transaction.prototype, 'create')
      .mockImplementation(function (this: Transaction, ref: DocumentReference, data: Record<string, unknown>) {
        if (ref.path.includes(`earn.week_goal:${OLDER_WEEK}`)) throw new Error('injected engine failure');
        return original.call(this, ref, data);
      });
    try {
      await closeAllWeeks(CLOSE_AT);
    } finally {
      spy.mockRestore();
    }
    // The latest week closed (Part B) but its gamification waits for the older one.
    const latest = await weekDoc(householdId).get();
    expect(latest.exists).toBe(true);
    expect(latest.get('gamification.processedAt')).toBeUndefined();
    expect(await walletLedger(a.uid)).toEqual({});

    await closeAllWeeks(new Date('2026-11-23T04:00:00Z'));

    expect((await weekDoc(householdId).get()).get('gamification.processedAt')).toBeInstanceOf(Timestamp);
    expect((await walletOf(a.uid))!.streak).toMatchObject({ current: 3, lastCountedWeek: WEEK });
  });

  it('only replays weeks inside the replay window', async () => {
    await setGamiConfig(LIVE);
    const { a, b, householdId } = await weekHousehold('n4-window');
    await seedOlderWeek(householdId, a, b);
    // The latest week's window starts 7 weeks back (2026-09-28); this doc is older than that.
    const stale = '2026-09-21';
    await adminDb()
      .doc(`households/${householdId}/weeks/${stale}`)
      .set({
        gamiEligible: true,
        weekStart: stale,
        weekEnd: '2026-09-27',
        timeZone: 'UTC',
        closedAt: T('2026-09-28T03:00:00Z'),
        members: { [a.uid]: { xp: 300, subtasks: 3, assignedDue: 0, missed: 0 } },
        topMember: null,
        wallOfShame: null,
      });

    await closeAllWeeks(CLOSE_AT);

    expect((await adminDb().doc(`households/${householdId}/weeks/${stale}`).get()).get('gamification')).toBeUndefined();
    expect((await adminDb().doc(`households/${householdId}/weeks/${OLDER_WEEK}`).get()).get('gamification.processedAt')).toBeInstanceOf(
      Timestamp,
    );
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

describe('organizer level-ups are recorded once (N8)', () => {
  it('writes gami_level_up once per level when a clawback lets the organizer cross it again', async () => {
    await setGamiConfig(LIVE);
    const { creator, member, householdId, choreId } = await gamiHousehold('n8', {
      subtasks: [
        { id: 'a', name: 'A', xp: 5, position: 0 },
        { id: 'b', name: 'B', xp: 5, position: 1 },
      ],
      bonusXp: 0,
    });
    const organizerRef = adminDb().doc(`households/${householdId}/organizer/${creator.uid}`);
    const atLevelOne = { householdId, memberId: creator.uid, zelo: 195, lifetimeZelo: 195, level: 1, caps: {} };
    const completeNext = async () => {
      const instance = await nextOpenInstance(householdId, choreId);
      for (const subtaskId of ['a', 'b']) {
        await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId });
      }
    };
    const organizerLevelUps = async () =>
      (await serverEvents(householdId, 'gami_level_up')).filter((event) => event.memberId === creator.uid);

    await organizerRef.set(atLevelOne);
    await completeNext();
    expect((await organizerRef.get()).get('level')).toBe(2);
    const first = await organizerLevelUps();
    expect(first).toHaveLength(1);
    expect(first[0].id).toBe(`evt:gami_level_up:zelo:${creator.uid}:2`);

    // A clawback drops the organizer below the level; the next chore crosses it again.
    await organizerRef.set(atLevelOne);
    await completeNext();
    expect((await organizerRef.get()).get('level')).toBe(2);
    const second = await organizerLevelUps();
    expect(second.map((event) => event.id)).toEqual([first[0].id]);
    expect(second[0].createdAt.toMillis()).toBe(first[0].createdAt.toMillis());
  });
});
