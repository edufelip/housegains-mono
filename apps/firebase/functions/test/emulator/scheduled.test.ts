import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { runReminders } from '../../src/scheduled';
import { adminDb, choreInput, createHousehold, must, nextOpenInstance, withProfile } from './helpers';

// The 30-minute reminder pass, run directly. Assignees here have no FCM tokens,
// so no push is sent; the test covers the closing and the reminder marking.
describe('sendReminders pass', () => {
  it('closes overdue open work and marks work due within the hour as reminded', async () => {
    const creator = await withProfile('sched', 'Alex');
    const { householdId } = await createHousehold(creator);
    const { choreId } = await must('saveChore', creator.token, { householdId, chore: choreInput({ assigneeIds: [creator.uid] }) });

    const soon = await nextOpenInstance(householdId, choreId);
    const overdue = (
      await adminDb().collection(`households/${householdId}/instances`).where('choreId', '==', choreId).where('status', '==', 'open').orderBy('dueAt').get()
    ).docs.find((d) => d.id !== soon.id && d.get('dueAt').toMillis() > Date.now());
    if (!overdue) throw new Error('need a second future instance');

    const now = Date.now();
    await soon.ref.update({ dueAt: Timestamp.fromMillis(now + 30 * 60_000) });
    await overdue.ref.update({ dueAt: Timestamp.fromMillis(now - 10 * 60_000) });

    await runReminders(new Date());

    expect((await overdue.ref.get()).get('status')).toBe('partial');
    expect((await soon.ref.get()).get('reminderSentAt')).toBeDefined();

    // A second pass does not re-mark or re-close anything it already handled.
    const firstMark = (await soon.ref.get()).get('reminderSentAt').toMillis();
    await runReminders(new Date());
    expect((await soon.ref.get()).get('reminderSentAt').toMillis()).toBe(firstMark);
  });
});
