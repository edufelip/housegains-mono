import { Timestamp } from 'firebase-admin/firestore';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { gamiWeekClosedHook } from '../../src/gamification/week-close';
import { closeAllWeeks } from '../../src/scheduled';
import { adminDb, createHousehold, must, withProfile, type TestUser } from './helpers';
import { LIVE, inboxOf, organizerLedger, resetGamiConfig, serverEvents, setGamiConfig, walletLedger, walletOf } from './gami-helpers';

// Weekly close (contract C7/C8): closeAllWeeks runs the Part C hook, which builds the
// household.week_closed events, pays goals/streaks/Zelo, and writes the week's gamification
// aggregates. Reference week: Mon 2026-11-16 to Sun 2026-11-22, closed at Mon 03:00 UTC.

afterAll(resetGamiConfig);
beforeEach(resetGamiConfig);

const WEEK = '2026-11-16';
const PREVIOUS_WEEK = '2026-11-09';
const CLOSE_AT = new Date('2026-11-23T03:00:00Z');
const T = (iso: string) => Timestamp.fromDate(new Date(iso));

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
  return { creator, a, b, householdId };
}

async function seedCredits(householdId: string, rows: Array<{ memberId: string; amount: number; at: string; source?: string }>) {
  const col = adminDb().collection(`households/${householdId}/ledger`);
  await Promise.all(
    rows.map((row) => col.add({ memberId: row.memberId, amount: row.amount, source: row.source ?? 'subtask', createdAt: T(row.at) })),
  );
}

/** `count` instances due in the reference week, `onTime` of them done before their due time. */
async function seedInstances(householdId: string, assignee: string, count: number, onTime: number) {
  const col = adminDb().collection(`households/${householdId}/instances`);
  await Promise.all(
    Array.from({ length: count }, (_, index) => {
      const day = 17 + (index % 5);
      const dueAt = `2026-11-${day}T20:00:00Z`;
      const done = index < onTime;
      return col.doc(`seed${index}`).set({
        choreId: 'seed',
        assigneeIds: [assignee],
        status: done ? 'done' : 'partial',
        dueAt: T(dueAt),
        completions: done ? [{ memberId: assignee, subtaskId: 's', xp: 1, completedAt: T(`2026-11-${day}T10:00:00Z`) }] : [],
      });
    }),
  );
}

function seedWallet(uid: string, streak: Record<string, unknown>) {
  return adminDb().doc(`wallets/${uid}`).set({
    householdId: 'seed',
    memberId: uid,
    balance: 0,
    stats: { welcomePaid: true },
    streak: { current: 0, record: 0, lastCountedWeek: null, lastActionWeek: null, folgas: 0, folgaProgress: 0, ...streak },
  });
}

describe('closeAllWeeks with the engine live', () => {
  it('pays the week goal, the streak milestone and Zelo, and writes the week aggregates', async () => {
    await setGamiConfig(LIVE);
    const { creator, a, b, householdId } = await weekHousehold('wk');
    await seedCredits(householdId, [
      { memberId: a.uid, amount: 100, at: '2026-11-16T12:00:00Z' },
      { memberId: a.uid, amount: 100, at: '2026-11-17T12:00:00Z' },
      { memberId: a.uid, amount: 100, at: '2026-11-18T12:00:00Z' },
      { memberId: b.uid, amount: 100, at: '2026-11-19T12:00:00Z' },
    ]);
    await seedInstances(householdId, a.uid, 5, 5);
    await seedWallet(a.uid, { current: 1, record: 1, lastCountedWeek: PREVIOUS_WEEK, lastActionWeek: PREVIOUS_WEEK });
    await seedWallet(b.uid, {});

    await closeAllWeeks(CLOSE_AT);

    // Week goal (400 XP household total, both members >= 10% of it): 30 each.
    const aLedger = await walletLedger(a.uid);
    expect(aLedger[`earn.week_goal:${WEEK}:${a.uid}`]).toMatchObject({ amount: 30, track: 'ganhos' });
    // A counted a second week in a row: milestone 2 pays 25.
    expect(aLedger[`earn.streak_milestone:${WEEK}#2:${a.uid}`]).toMatchObject({ amount: 25 });
    const walletA = (await walletOf(a.uid))!;
    expect(walletA.balance).toBe(55);
    expect(walletA.streak).toMatchObject({ current: 2, lastCountedWeek: WEEK, lastActionWeek: WEEK });
    expect(Object.keys(await walletLedger(b.uid))).toEqual([`earn.week_goal:${WEEK}:${b.uid}`]);
    // B credited once (< 3): the week does not count and there was no streak to lose.
    expect((await walletOf(b.uid))!.streak).toMatchObject({ current: 0, lastActionWeek: WEEK });

    // Zelo: 5 instances due, all on time (>= 90%): 60, and the organizer streak starts.
    const zelo = await organizerLedger(householdId);
    expect(zelo[`zelo.on_time:${WEEK}:${creator.uid}`]).toMatchObject({ amount: 60, track: 'zelo' });
    const organizer = (await adminDb().doc(`households/${householdId}/organizer/${creator.uid}`).get()).data()!;
    expect(organizer.streak).toMatchObject({ current: 1, lastCountedWeek: WEEK });

    // The week doc keeps the Part B fields and gains the Part C aggregates.
    const week = (await adminDb().doc(`households/${householdId}/weeks/${WEEK}`).get()).data()!;
    expect(week.gamification).toEqual({
      onTimeRate: 100,
      dueInstances: 5,
      doneOnTime: 5,
      goalReached: true,
      processedAt: expect.any(Timestamp),
    });
    expect(week.topMember.memberId).toBe(a.uid);

    // Live: the celebrations wait in each earner's inbox (FCM covers the push, with no tokens here).
    const inbox = await inboxOf(a.uid);
    expect(inbox.map((row) => row.id)).toContain(`cel:streak:${WEEK}:2:${a.uid}`);
    expect(inbox.every((row) => row.seen === false)).toBe(true);
    expect((await inboxOf(creator.uid)).some((row) => row.track === 'zelo')).toBe(true);
    expect((await serverEvents(householdId, 'gami_streak_week_counted')).length).toBeGreaterThan(0);
  });

  it('is idempotent: closing again and re-running the hook change nothing', async () => {
    await setGamiConfig(LIVE);
    const { a, householdId } = await weekHousehold('wk-idem');
    await seedCredits(householdId, [{ memberId: a.uid, amount: 400, at: '2026-11-16T12:00:00Z' }]);
    await seedWallet(a.uid, {});
    await closeAllWeeks(CLOSE_AT);
    const ledger = await walletLedger(a.uid);
    const wallet = await walletOf(a.uid);
    expect(Object.keys(ledger)).toEqual([`earn.week_goal:${WEEK}:${a.uid}`]);

    await closeAllWeeks(new Date('2026-11-23T05:00:00Z'));
    const week = (await adminDb().doc(`households/${householdId}/weeks/${WEEK}`).get()).data()!;
    await gamiWeekClosedHook({
      householdId,
      weekStart: WEEK,
      weekEnd: '2026-11-22',
      timeZone: 'UTC',
      closedAt: CLOSE_AT,
      members: Object.fromEntries(
        Object.entries(week.members as Record<string, { xp: number; subtasks: number; assignedDue: number; missed: number }>).map(
          ([uid, stats]) => [uid, { ...stats, lastPositiveAt: null }],
        ),
      ),
      topMember: week.topMember,
      wallOfShame: week.wallOfShame,
    });
    expect(await walletLedger(a.uid)).toEqual(ledger);
    expect(await walletOf(a.uid)).toEqual(wallet);
  });

  it('away weeks freeze a streak; the same week without away mode breaks it', async () => {
    await setGamiConfig(LIVE);
    const { a, b, householdId } = await weekHousehold('wk-away');
    await seedCredits(householdId, [{ memberId: a.uid, amount: 10, at: '2026-11-16T12:00:00Z' }]);
    const base = { current: 3, record: 3, lastCountedWeek: PREVIOUS_WEEK, lastActionWeek: PREVIOUS_WEEK };
    await seedWallet(a.uid, { ...base, awayWeeks: [WEEK] });
    await seedWallet(b.uid, base);

    await closeAllWeeks(CLOSE_AT);

    expect((await walletOf(a.uid))!.streak).toMatchObject({ current: 3, record: 3, lastActionWeek: WEEK });
    expect((await walletOf(b.uid))!.streak).toMatchObject({ current: 0, record: 3, lastActionWeek: WEEK });
    const broken = await serverEvents(householdId, 'gami_streak_broken');
    expect(broken.map((event) => event.memberId)).toEqual([b.uid]);
  });

  it('uses folgas before breaking a streak', async () => {
    await setGamiConfig(LIVE);
    const { a, householdId } = await weekHousehold('wk-folga');
    await seedWallet(a.uid, { current: 5, record: 5, folgas: 1, lastCountedWeek: PREVIOUS_WEEK, lastActionWeek: PREVIOUS_WEEK });
    await closeAllWeeks(CLOSE_AT);
    expect((await walletOf(a.uid))!.streak).toMatchObject({ current: 5, folgas: 0 });
    expect((await serverEvents(householdId, 'gami_folga_used')).map((event) => event.memberId)).toEqual([a.uid]);
  });
});

describe('closeAllWeeks in shadow and off', () => {
  it('shadow writes ledgers, projections and aggregates but no inbox rows', async () => {
    await setGamiConfig({ mode: 'shadow' });
    const { creator, a, householdId } = await weekHousehold('wk-shadow');
    await seedCredits(householdId, [{ memberId: a.uid, amount: 400, at: '2026-11-16T12:00:00Z' }]);
    await seedInstances(householdId, a.uid, 5, 5);
    await seedWallet(a.uid, {});
    await closeAllWeeks(CLOSE_AT);

    expect(Object.keys(await walletLedger(a.uid))).toContain(`earn.week_goal:${WEEK}:${a.uid}`);
    expect(Object.keys(await organizerLedger(householdId))).toContain(`zelo.on_time:${WEEK}:${creator.uid}`);
    const week = (await adminDb().doc(`households/${householdId}/weeks/${WEEK}`).get()).data()!;
    expect(week.gamification).toMatchObject({ goalReached: true, dueInstances: 5, doneOnTime: 5 });
    expect(await inboxOf(a.uid)).toEqual([]);
    expect(await inboxOf(creator.uid)).toEqual([]);
  });

  it('off closes the week as before and writes no gamification data', async () => {
    const { a, householdId } = await weekHousehold('wk-off');
    await seedCredits(householdId, [{ memberId: a.uid, amount: 400, at: '2026-11-16T12:00:00Z' }]);
    await seedWallet(a.uid, {});
    await closeAllWeeks(CLOSE_AT);

    const week = (await adminDb().doc(`households/${householdId}/weeks/${WEEK}`).get()).data()!;
    expect(week.topMember.memberId).toBe(a.uid);
    expect(week.gamification).toBeUndefined();
    expect(await walletLedger(a.uid)).toEqual({});
    expect(await serverEvents(householdId)).toEqual([]);
  });
});
