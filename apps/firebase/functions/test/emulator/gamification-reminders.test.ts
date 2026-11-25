import { Timestamp } from 'firebase-admin/firestore';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { runGamificationReminders } from '../../src/gamification/reminders';
import { adminDb, createHousehold, must, withProfile, type TestUser } from './helpers';
import { resetGamiConfig, serverEvents } from './gami-helpers';

// gamificationReminders (contract C7), called directly with fixed clock times. The week is
// Mon 2026-11-16 .. Sun 2026-11-22 in the household's UTC time zone. Test members have no FCM
// tokens, so no push leaves the emulator: the claimed marker and the gami_reminder_sent event
// (with its recipient count) are what a run is judged by.

// Other suites may leave a rule-set pointer behind; these run against the missing-config default.
afterAll(resetGamiConfig);
beforeEach(resetGamiConfig);

const WEEK = '2026-11-16';
const SUNDAY_18 = new Date('2026-11-22T18:30:00Z');
const SATURDAY_10 = new Date('2026-11-21T10:05:00Z');
const T = (iso: string) => Timestamp.fromDate(new Date(iso));

interface Reminders {
  creator: TestUser;
  a: TestUser;
  b: TestUser;
  householdId: string;
}

async function remindersHousehold(label: string): Promise<Reminders> {
  const creator = await withProfile(`${label}-c`, 'Alex');
  const { householdId, code } = await createHousehold(creator);
  const a = await withProfile(`${label}-a`, 'Sam');
  const b = await withProfile(`${label}-b`, 'Bea');
  await must('joinHousehold', a.token, { code });
  await must('joinHousehold', b.token, { code });
  return { creator, a, b, householdId };
}

function seedWallet(uid: string, current: number, awayWeeks: string[] = []) {
  return adminDb().doc(`wallets/${uid}`).set({ memberId: uid, streak: { current, record: current, awayWeeks } });
}

async function seedSubtasks(householdId: string, memberId: string, count: number) {
  const col = adminDb().collection(`households/${householdId}/ledger`);
  await Promise.all(
    Array.from({ length: count }, (_, index) =>
      col.add({ memberId, amount: 10, source: 'subtask', createdAt: T(`2026-11-1${7 + index}T12:00:00Z`) }),
    ),
  );
}

async function seedInstances(householdId: string, count: number, onTime: number) {
  const col = adminDb().collection(`households/${householdId}/instances`);
  await Promise.all(
    Array.from({ length: count }, (_, index) =>
      col.doc(`r${index}`).set({
        choreId: 'seed',
        assigneeIds: [],
        status: index < onTime ? 'done' : 'partial',
        dueAt: T(`2026-11-1${6 + (index % 4)}T20:00:00Z`),
        completions: index < onTime ? [{ completedAt: T(`2026-11-1${6 + (index % 4)}T10:00:00Z`) }] : [],
      }),
    ),
  );
}

const marker = (householdId: string, kind: string) =>
  adminDb().doc(`households/${householdId}/gamiReminders/${WEEK}:${kind}`).get();

describe('Sunday 18:00 streak reminders', () => {
  it('reminds members under 3 credits with a streak, once per week', async () => {
    const { a, b, creator, householdId } = await remindersHousehold('rem');
    await seedWallet(a.uid, 8); // 1 credit this week: at risk
    await seedWallet(b.uid, 5); // 3 credits: safe
    await seedWallet(creator.uid, 0); // no streak: nothing to lose
    await seedSubtasks(householdId, a.uid, 1);
    await seedSubtasks(householdId, b.uid, 3);

    await runGamificationReminders(SUNDAY_18);

    expect((await marker(householdId, 'member')).exists).toBe(true);
    const sent = await serverEvents(householdId, 'gami_reminder_sent');
    expect(sent).toHaveLength(1);
    expect(sent[0].data).toEqual({ kind: 'member', weekStart: WEEK, recipients: 1 });

    // A second run in the same hour is a no-op: the claimed marker stops it before anything is sent or written.
    const eventRef = adminDb().doc(`households/${householdId}/events/${sent[0].id}`);
    await eventRef.set({ name: 'gami_reminder_sent', data: { sentinel: true } });
    await runGamificationReminders(new Date('2026-11-22T18:50:00Z'));
    expect((await eventRef.get()).get('data')).toEqual({ sentinel: true });
  });

  it('nets undo and revoke rows against the credits, and skips away weeks', async () => {
    const { a, b, householdId } = await remindersHousehold('rem-net');
    await seedWallet(a.uid, 4);
    await seedWallet(b.uid, 4, [WEEK]);
    // A: 3 credits minus an undo = 2 net (reminded); B is away this week (not reminded).
    await seedSubtasks(householdId, a.uid, 3);
    await adminDb().collection(`households/${householdId}/ledger`).add({
      memberId: a.uid,
      amount: -10,
      source: 'undo-subtask',
      createdAt: T('2026-11-20T12:00:00Z'),
    });
    await runGamificationReminders(SUNDAY_18);
    const sent = await serverEvents(householdId, 'gami_reminder_sent');
    expect(sent.map((event) => event.data.recipients)).toEqual([1]);
  });

  it('respects remindersEnabled', async () => {
    const { a, householdId } = await remindersHousehold('rem-opt');
    await seedWallet(a.uid, 6);
    await adminDb().doc(`users/${a.uid}`).update({ remindersEnabled: false });
    await runGamificationReminders(SUNDAY_18);
    expect(await serverEvents(householdId, 'gami_reminder_sent')).toEqual([]);
  });

  it('only runs at Sunday 18:00 local', async () => {
    const { a, householdId } = await remindersHousehold('rem-time');
    await seedWallet(a.uid, 6);
    await runGamificationReminders(new Date('2026-11-22T17:59:00Z'));
    await runGamificationReminders(new Date('2026-11-22T19:00:00Z'));
    await runGamificationReminders(new Date('2026-11-21T18:30:00Z')); // Saturday
    expect((await marker(householdId, 'member')).exists).toBe(false);
  });

  it('reminds every household with no gamification/config doc present', async () => {
    const { a, householdId } = await remindersHousehold('rem-always');
    await seedWallet(a.uid, 6);
    expect((await adminDb().doc('gamification/config').get()).exists).toBe(false);
    await runGamificationReminders(SUNDAY_18);
    expect((await marker(householdId, 'member')).exists).toBe(true);
  });

  it('works in the household time zone', async () => {
    const { a, householdId } = await remindersHousehold('rem-tz');
    await adminDb().doc(`households/${householdId}`).update({ timeZone: 'America/Sao_Paulo' });
    await seedWallet(a.uid, 6);
    // 18:30 UTC is 15:30 in Sao Paulo: not yet; 21:30 UTC is 18:30 there.
    await runGamificationReminders(SUNDAY_18);
    expect((await marker(householdId, 'member')).exists).toBe(false);
    await runGamificationReminders(new Date('2026-11-22T21:30:00Z'));
    expect((await marker(householdId, 'member')).exists).toBe(true);
  });
});

describe('Saturday 10:00 house reminder', () => {
  it('reminds the creator when the on-time rate so far is under 60% with at least 5 due', async () => {
    const { householdId } = await remindersHousehold('rem-house');
    await seedInstances(householdId, 5, 2); // 40%
    await runGamificationReminders(SATURDAY_10);
    const sent = await serverEvents(householdId, 'gami_reminder_sent');
    expect(sent).toHaveLength(1);
    expect(sent[0].data).toEqual({ kind: 'creator', weekStart: WEEK, recipients: 1 });
  });

  it('stays quiet when the house is at 60% or better, or has fewer than 5 due', async () => {
    const fine = await remindersHousehold('rem-fine');
    await seedInstances(fine.householdId, 5, 3); // exactly 60%
    const few = await remindersHousehold('rem-few');
    await seedInstances(few.householdId, 4, 0);
    await runGamificationReminders(SATURDAY_10);
    expect(await serverEvents(fine.householdId, 'gami_reminder_sent')).toEqual([]);
    expect(await serverEvents(few.householdId, 'gami_reminder_sent')).toEqual([]);
  });
});
