import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { closeAllWeeks, runReminders } from '../../src/scheduled';
import {
  adminDb,
  choreInput,
  createHousehold,
  expectError,
  must,
  nextOpenInstance,
  withProfile,
  type TestUser,
} from './helpers';

// A review record (an instance carrying revocations) that an admin verdict reopened must outlive a
// chore delete or pause, but out of play: no reminders, no completions, never assigned or missed work.

const MONDAY_0300 = new Date('2026-11-23T03:00:00Z');
const T = (iso: string) => Timestamp.fromDate(new Date(iso));

interface Setup {
  creator: TestUser;
  member: TestUser;
  other: TestUser;
  householdId: string;
  choreId: string;
  /** The reopened review record: open, in the future, no completions, one revocation. */
  recordId: string;
}

async function setup(label: string): Promise<Setup> {
  const creator = await withProfile(`${label}-c`, 'Alex');
  const { householdId, code } = await createHousehold(creator);
  const member = await withProfile(`${label}-m`, 'Sam');
  const other = await withProfile(`${label}-o`, 'Bea');
  await must('joinHousehold', member.token, { code });
  await must('joinHousehold', other.token, { code });
  const { choreId } = await must('saveChore', creator.token, {
    householdId,
    chore: choreInput({ assigneeIds: [member.uid] }),
  });
  const instance = await nextOpenInstance(householdId, choreId);
  await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
  await must('moderateInstance', creator.token, { householdId, instanceId: instance.id, verdict: 'not_done' });
  const reopened = await instance.ref.get();
  expect(reopened.get('status')).toBe('open');
  expect(reopened.get('completions')).toEqual([]);
  expect((reopened.get('revocations') as unknown[]).length).toBe(1);
  return { creator, member, other, householdId, choreId, recordId: instance.id };
}

const instanceDoc = (householdId: string, id: string) => adminDb().doc(`households/${householdId}/instances/${id}`);

describe('retiring review records on chore delete and pause', () => {
  it('delete keeps the review record but retires it; reminders skip it and the overdue pass still closes it', async () => {
    const { creator, householdId, choreId, recordId } = await setup('ret-del');
    const untouched = (
      await adminDb()
        .collection(`households/${householdId}/instances`)
        .where('choreId', '==', choreId)
        .where('status', '==', 'open')
        .get()
    ).docs.filter((doc) => doc.id !== recordId);
    expect(untouched.length).toBeGreaterThan(0);

    await must('deleteChore', creator.token, { householdId, choreId });

    const record = await instanceDoc(householdId, recordId).get();
    expect(record.exists).toBe(true);
    expect(record.get('retiredAt')).toBeInstanceOf(Timestamp);
    expect((record.get('revocations') as unknown[]).length).toBe(1);
    for (const doc of untouched) expect((await doc.ref.get()).exists).toBe(false);

    // Due within the hour: an in-play instance would be reminded; a retired one is not.
    await record.ref.update({ dueAt: Timestamp.fromMillis(Date.now() + 30 * 60_000) });
    await runReminders(new Date());
    const afterReminders = await record.ref.get();
    expect(afterReminders.get('reminderSentAt')).toBeUndefined();
    expect(afterReminders.get('status')).toBe('open');

    // Past due: closed so it leaves the open query, and still retired.
    await record.ref.update({ dueAt: Timestamp.fromMillis(Date.now() - 10 * 60_000) });
    await runReminders(new Date());
    const closed = await record.ref.get();
    expect(closed.get('status')).toBe('partial');
    expect(closed.get('retiredAt')).toBeInstanceOf(Timestamp);
  });

  it('pause retires it, reactivation brings it back into play', async () => {
    const { creator, householdId, choreId, recordId } = await setup('ret-pause');

    await must('setChoreActive', creator.token, { householdId, choreId, isActive: false });
    const paused = await instanceDoc(householdId, recordId).get();
    expect(paused.get('retiredAt')).toBeInstanceOf(Timestamp);
    await paused.ref.update({ dueAt: Timestamp.fromMillis(Date.now() + 30 * 60_000) });
    await runReminders(new Date());
    expect((await paused.ref.get()).get('reminderSentAt')).toBeUndefined();

    await must('setChoreActive', creator.token, { householdId, choreId, isActive: true });
    const resumed = await instanceDoc(householdId, recordId).get();
    expect(resumed.get('retiredAt')).toBeUndefined();
    expect((resumed.get('revocations') as unknown[]).length).toBe(1);
    await runReminders(new Date());
    expect((await resumed.ref.get()).get('reminderSentAt')).toBeInstanceOf(Timestamp);
  });

  it('refuses completions on a retired instance', async () => {
    const { creator, member, householdId, choreId, recordId } = await setup('ret-complete');
    await must('deleteChore', creator.token, { householdId, choreId });
    await expectError(
      'completeSubtask',
      member.token,
      { householdId, instanceId: recordId, subtaskId: 'wipe' },
      'failed-precondition',
    );
    expect((await instanceDoc(householdId, recordId).get()).get('completions')).toEqual([]);
  });

  it('leaves retired instances out of the week stats, but counts a live instance of the same member', async () => {
    const { creator, member, householdId, choreId, recordId } = await setup('ret-week');
    await must('deleteChore', creator.token, { householdId, choreId });
    // The retired record and a plain missed instance both fall in the reference week (Nov 16-22).
    await instanceDoc(householdId, recordId).update({ dueAt: T('2026-11-19T20:00:00Z') });
    await adminDb()
      .doc(`households/${householdId}/instances/live`)
      .set({ choreId: 'other', assigneeIds: [member.uid], status: 'partial', dueAt: T('2026-11-18T20:00:00Z') });

    await closeAllWeeks(MONDAY_0300);

    const week = await adminDb().doc(`households/${householdId}/weeks/2026-11-16`).get();
    expect(week.get(`members.${member.uid}.assignedDue`)).toBe(1);
    expect(week.get(`members.${member.uid}.missed`)).toBe(1);
  });
});

describe('editing the assignees of a chore with a review record', () => {
  it('setAssignments re-points the review record; its subtasks stay as recorded', async () => {
    const { creator, other, householdId, choreId, recordId } = await setup('ret-assign');
    await must('setAssignments', creator.token, { householdId, choreId, assigneeIds: [other.uid] });
    const record = await instanceDoc(householdId, recordId).get();
    expect(record.get('assigneeIds')).toEqual([other.uid]);
    expect(record.get('retiredAt')).toBeUndefined();
  });

  it('a plain edit re-points the assignees but keeps the recorded subtasks', async () => {
    const { creator, other, householdId, choreId, recordId } = await setup('ret-edit');
    const subtasksBefore = (await instanceDoc(householdId, recordId).get()).get('subtasks');
    await must('saveChore', creator.token, {
      householdId,
      chore: {
        id: choreId,
        ...choreInput({
          assigneeIds: [other.uid],
          subtasks: [{ id: 'solo', name: 'Solo', xp: 40, position: 0 }],
        }),
      },
    });
    const record = await instanceDoc(householdId, recordId).get();
    expect(record.get('assigneeIds')).toEqual([other.uid]);
    expect(record.get('subtasks')).toEqual(subtasksBefore);
  });
});
