import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { closeAllWeeks } from '../../src/scheduled';
import { adminDb, choreInput, createHousehold, must, nextOpenInstance, withProfile } from './helpers';

// Weekly standings and dispute expiry (moderation contract Part B / A2), by calling
// closeAllWeeks(now) directly with fixed clock times. Reference week: Mon 2026-11-16 to
// Sun 2026-11-22, which closes once local time passes Mon 2026-11-23 03:00. Members
// here have no FCM tokens, so the push path runs but sends nothing.

const MONDAY_0259 = new Date('2026-11-23T02:59:00Z');
const MONDAY_0300 = new Date('2026-11-23T03:00:00Z');

const T = (iso: string) => Timestamp.fromDate(new Date(iso));

interface SeededRow {
  memberId: string;
  amount: number;
  source: string;
  at: string;
}

async function addLedger(householdId: string, rows: SeededRow[]) {
  const col = adminDb().collection(`households/${householdId}/ledger`);
  await Promise.all(
    rows.map((row) =>
      col.add({ memberId: row.memberId, amount: row.amount, source: row.source, createdAt: T(row.at) }),
    ),
  );
}

interface SeededInstance {
  assigneeIds: string[];
  status: string;
  at: string;
}

async function addInstances(householdId: string, instances: SeededInstance[]) {
  const col = adminDb().collection(`households/${householdId}/instances`);
  await Promise.all(
    instances.map((instance, index) =>
      col.doc(`seed${index}`).set({ assigneeIds: instance.assigneeIds, status: instance.status, dueAt: T(instance.at) }),
    ),
  );
}

function weekDoc(householdId: string, weekStart: string) {
  return adminDb().doc(`households/${householdId}/weeks/${weekStart}`);
}

async function memberXp(householdId: string, uid: string) {
  return (await adminDb().doc(`households/${householdId}/members/${uid}`).get()).get('xp') as number;
}

describe('closeAllWeeks', () => {
  it('closes only after Monday 03:00 and computes stats over undo and revoke rows', async () => {
    const creator = await withProfile('stand-a', 'Alex');
    const { householdId, code } = await createHousehold(creator);
    const memberA = await withProfile('stand-b', 'Sam');
    const memberB = await withProfile('stand-c', 'Bea');
    await must('joinHousehold', memberA.token, { code });
    await must('joinHousehold', memberB.token, { code });

    await addLedger(householdId, [
      { memberId: creator.uid, amount: 10, source: 'subtask', at: '2026-11-16T12:00:00Z' },
      { memberId: creator.uid, amount: -10, source: 'undo-subtask', at: '2026-11-17T12:00:00Z' },
      { memberId: memberA.uid, amount: 10, source: 'subtask', at: '2026-11-16T13:00:00Z' },
      { memberId: memberA.uid, amount: 15, source: 'subtask', at: '2026-11-18T13:00:00Z' },
      { memberId: memberA.uid, amount: -10, source: 'revoke-subtask', at: '2026-11-20T13:00:00Z' },
      { memberId: memberB.uid, amount: 5, source: 'subtask', at: '2026-11-17T14:00:00Z' },
      { memberId: memberB.uid, amount: -5, source: 'revoke-subtask', at: '2026-11-20T14:00:00Z' },
      // Outside the week, either side: never counted.
      { memberId: memberA.uid, amount: 99, source: 'subtask', at: '2026-11-23T12:00:00Z' },
      { memberId: creator.uid, amount: 99, source: 'subtask', at: '2026-11-15T12:00:00Z' },
    ]);
    await addInstances(householdId, [
      { assigneeIds: [memberA.uid], status: 'done', at: '2026-11-16T20:00:00Z' },
      { assigneeIds: [creator.uid], status: 'partial', at: '2026-11-22T20:00:00Z' },
      { assigneeIds: [memberB.uid], status: 'open', at: '2026-11-19T20:00:00Z' },
      { assigneeIds: [memberB.uid], status: 'partial', at: '2026-11-18T20:00:00Z' },
      { assigneeIds: [memberA.uid], status: 'open', at: '2026-11-23T20:00:00Z' }, // next week
    ]);

    await closeAllWeeks(MONDAY_0259);
    expect((await weekDoc(householdId, '2026-11-16').get()).exists).toBe(false);

    await closeAllWeeks(MONDAY_0300);
    const doc = await weekDoc(householdId, '2026-11-16').get();
    expect(doc.exists).toBe(true);
    expect(doc.get('weekStart')).toBe('2026-11-16');
    expect(doc.get('weekEnd')).toBe('2026-11-22');
    expect(doc.get('timeZone')).toBe('UTC');
    expect(doc.get('closedAt').toDate().toISOString()).toBe('2026-11-23T03:00:00.000Z');
    const members = doc.get('members') as Record<string, { xp: number; subtasks: number; assignedDue: number; missed: number }>;
    expect(members[creator.uid]).toEqual({ xp: 0, subtasks: 0, assignedDue: 1, missed: 1 });
    expect(members[memberA.uid]).toEqual({ xp: 15, subtasks: 1, assignedDue: 1, missed: 0 });
    expect(members[memberB.uid]).toEqual({ xp: 0, subtasks: 0, assignedDue: 2, missed: 2 });
    expect(doc.get('topMember')).toEqual({ memberId: memberA.uid, xp: 15, subtasks: 1 });
    expect(doc.get('wallOfShame')).toEqual({ memberId: memberB.uid, missed: 2, assignedDue: 2 });

    // A second run an hour later is a no-op: the snapshot is never rewritten.
    await closeAllWeeks(new Date('2026-11-23T04:00:00Z'));
    const again = await weekDoc(householdId, '2026-11-16').get();
    expect(again.get('closedAt').toDate().toISOString()).toBe('2026-11-23T03:00:00.000Z');
    const weeks = await adminDb().collection(`households/${householdId}/weeks`).get();
    expect(weeks.size).toBe(1);
  });

  it('breaks an xp tie by net subtasks, and one member may hold both titles', async () => {
    const creator = await withProfile('tie-a', 'Alex');
    const { householdId, code } = await createHousehold(creator);
    const memberA = await withProfile('tie-b', 'Sam');
    const memberB = await withProfile('tie-c', 'Bea');
    await must('joinHousehold', memberA.token, { code });
    await must('joinHousehold', memberB.token, { code });

    await addLedger(householdId, [
      // 15 xp on two net subtask credits for A...
      { memberId: memberA.uid, amount: 10, source: 'subtask', at: '2026-11-16T12:00:00Z' },
      { memberId: memberA.uid, amount: 5, source: 'subtask', at: '2026-11-17T12:00:00Z' },
      // ...against 15 xp of pure bonus for B.
      { memberId: memberB.uid, amount: 15, source: 'bonus', at: '2026-11-18T12:00:00Z' },
    ]);
    await addInstances(householdId, [
      // A tops the week AND missed their instance: both titles, same person.
      { assigneeIds: [memberA.uid], status: 'open', at: '2026-11-19T20:00:00Z' },
      { assigneeIds: [memberB.uid], status: 'done', at: '2026-11-20T20:00:00Z' },
    ]);

    await closeAllWeeks(MONDAY_0300);
    const doc = await weekDoc(householdId, '2026-11-16').get();
    expect(doc.get('topMember')).toEqual({ memberId: memberA.uid, xp: 15, subtasks: 2 });
    expect(doc.get('wallOfShame')).toEqual({ memberId: memberA.uid, missed: 1, assignedDue: 1 });
  });

  it('writes null titles for a household with fewer than two active members', async () => {
    const creator = await withProfile('solo-a', 'Alex');
    const { householdId } = await createHousehold(creator);
    await addLedger(householdId, [{ memberId: creator.uid, amount: 10, source: 'subtask', at: '2026-11-16T12:00:00Z' }]);
    await addInstances(householdId, [{ assigneeIds: [creator.uid], status: 'open', at: '2026-11-19T20:00:00Z' }]);

    await closeAllWeeks(MONDAY_0300);
    const doc = await weekDoc(householdId, '2026-11-16').get();
    expect(doc.get('members')[creator.uid]).toEqual({ xp: 10, subtasks: 1, assignedDue: 1, missed: 1 });
    expect(doc.get('topMember')).toBeNull();
    expect(doc.get('wallOfShame')).toBeNull();
  });

  it('excludes members who left before the close', async () => {
    const creator = await withProfile('gone-a', 'Alex');
    const { householdId, code } = await createHousehold(creator);
    const leaver = await withProfile('gone-b', 'Sam');
    const stayer = await withProfile('gone-c', 'Bea');
    await must('joinHousehold', leaver.token, { code });
    await must('joinHousehold', stayer.token, { code });
    await must('leaveHousehold', leaver.token, { householdId });

    await addLedger(householdId, [
      // The leaver's row stays in the ledger but the closed week ignores them.
      { memberId: leaver.uid, amount: 50, source: 'subtask', at: '2026-11-17T12:00:00Z' },
      { memberId: stayer.uid, amount: 5, source: 'subtask', at: '2026-11-18T12:00:00Z' },
    ]);

    await closeAllWeeks(MONDAY_0300);
    const doc = await weekDoc(householdId, '2026-11-16').get();
    const members = doc.get('members') as Record<string, unknown>;
    expect(Object.keys(members).sort()).toEqual([creator.uid, stayer.uid].sort());
    expect(doc.get('topMember')).toEqual({ memberId: stayer.uid, xp: 5, subtasks: 1 });
  });

  it('expires open disputes past their window even when no week closes this hour', async () => {
    const creator = await withProfile('exp-a', 'Alex');
    const { householdId, code } = await createHousehold(creator);
    const memberA = await withProfile('exp-b', 'Sam');
    const memberB = await withProfile('exp-c', 'Bea');
    await must('joinHousehold', memberA.token, { code });
    await must('joinHousehold', memberB.token, { code });
    const { choreId } = await must('saveChore', creator.token, {
      householdId,
      chore: choreInput({ assigneeIds: [memberA.uid] }),
    });
    const instance = await nextOpenInstance(householdId, choreId);

    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('reportCompletion', memberB.token, { householdId, instanceId: instance.id });
    // Push the dispute past its 72-hour window without waiting.
    await adminDb().doc(`households/${householdId}/disputes/${instance.id}`).update({ expiresAt: T('2026-11-01T00:00:00Z') });

    // Monday 02:59: no week closes this hour, but the stale dispute still expires.
    await closeAllWeeks(MONDAY_0259);
    expect((await weekDoc(householdId, '2026-11-16').get()).exists).toBe(false);
    const dispute = await adminDb().doc(`households/${householdId}/disputes/${instance.id}`).get();
    expect(dispute.get('status')).toBe('expired');
    const after = await adminDb().doc(`households/${householdId}/instances/${instance.id}`).get();
    expect(after.get('disputeStatus')).toBe('expired');
    // Expiry never reverses anything: completions stand (contract A2).
    expect((after.get('completions') as unknown[]).length).toBe(1);
    expect(await memberXp(householdId, memberA.uid)).toBe(10);

    // An hour later the same household's week still closes.
    await closeAllWeeks(MONDAY_0300);
    expect((await weekDoc(householdId, '2026-11-16').get()).exists).toBe(true);
  });

  it('closes a Los Angeles household at its own Monday 03:00, not UTC', async () => {
    const creator = await withProfile('la-a', 'Alex');
    const { householdId, code } = await createHousehold(creator);
    const member = await withProfile('la-b', 'Sam');
    await must('joinHousehold', member.token, { code });
    await adminDb().doc(`households/${householdId}`).update({ timeZone: 'America/Los_Angeles' });

    await addLedger(householdId, [
      // 07:00 UTC is still Sunday 23:00 PST: the previous week in Los Angeles.
      { memberId: creator.uid, amount: 99, source: 'subtask', at: '2026-11-16T07:00:00Z' },
      // Monday 01:00 PST: inside the LA week.
      { memberId: creator.uid, amount: 10, source: 'subtask', at: '2026-11-16T09:00:00Z' },
      { memberId: member.uid, amount: 5, source: 'subtask', at: '2026-11-18T20:00:00Z' },
    ]);

    // 10:59 UTC is Monday 02:59 in LA: nothing closes there yet.
    await closeAllWeeks(new Date('2026-11-23T10:59:00Z'));
    expect((await weekDoc(householdId, '2026-11-16').get()).exists).toBe(false);

    // 11:00 UTC is Monday 03:00 PST: the LA week closes on LA's clock.
    await closeAllWeeks(new Date('2026-11-23T11:00:00Z'));
    const doc = await weekDoc(householdId, '2026-11-16').get();
    expect(doc.get('timeZone')).toBe('America/Los_Angeles');
    const members = doc.get('members') as Record<string, { xp: number }>;
    expect(members[creator.uid].xp).toBe(10);
    expect(doc.get('topMember')).toEqual({ memberId: creator.uid, xp: 10, subtasks: 1 });
  });
});
