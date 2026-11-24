import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../admin';

/** C9 velocity window: the engine counts subtask credits in the 10 minutes up to the action. */
const VELOCITY_WINDOW_MS = 10 * 60_000;

/**
 * Timestamps of the member's subtask credits in the 10 minutes up to `at` (inclusive).
 * An engine input for the C9 velocity alert, read outside the XP transaction: a failure
 * is logged and yields no timestamps (no alert), never a failed action.
 */
export async function recentSubtaskTimes(householdId: string, memberId: string, at: Date): Promise<Date[]> {
  try {
    const snap = await db()
      .collection(`households/${householdId}/ledger`)
      .where('memberId', '==', memberId)
      .where('source', '==', 'subtask')
      .where('createdAt', '>=', Timestamp.fromDate(new Date(at.getTime() - VELOCITY_WINDOW_MS)))
      .where('createdAt', '<=', Timestamp.fromDate(at))
      .get();
    return snap.docs.flatMap((doc) => {
      const createdAt = doc.get('createdAt');
      return createdAt instanceof Timestamp ? [createdAt.toDate()] : [];
    });
  } catch (error) {
    console.error('recentSubtaskTimes failed', { householdId, memberId }, error);
    return [];
  }
}

/** An instance counts as on time when it is done and its last standing completion beat the due time. */
export function onTimeCounts(
  instances: ReadonlyArray<{ get: (field: string) => unknown }>,
): { due: number; onTime: number } {
  let onTime = 0;
  for (const instance of instances) {
    if (instance.get('status') !== 'done') continue;
    const dueAt = instance.get('dueAt');
    if (!(dueAt instanceof Timestamp)) continue;
    const completions = instance.get('completions');
    const lastCompletedAt = (Array.isArray(completions) ? completions : []).reduce<number>((max, completion) => {
      const completedAt = (completion as { completedAt?: unknown }).completedAt;
      return Math.max(max, completedAt instanceof Timestamp ? completedAt.toMillis() : 0);
    }, 0);
    if (lastCompletedAt <= dueAt.toMillis()) onTime += 1;
  }
  return { due: instances.length, onTime };
}
