import { getMessaging } from 'firebase-admin/messaging';
import { FieldValue, Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { db } from './admin';
import { formatLocalTime } from './domain/time';
import { reminderBody, resolveLocale } from './domain/people';
import { generateChoreInstancesFor } from './store';

// Scheduled work: instance generation, overdue closing, and "your turn" reminders.

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** Daily 03:00 UTC: fill each active chore's instances up to the 14-day horizon. */
export async function generateAllInstances(now: Date): Promise<number> {
  const households = await db().collection('households').get();
  let created = 0;
  for (const household of households.docs) {
    const chores = await household.ref.collection('chores').where('isActive', '==', true).get();
    for (const chore of chores.docs) {
      try {
        created += await generateChoreInstancesFor(household.id, chore.id, now);
      } catch (error) {
        console.error('generateInstances failed', household.id, chore.id, error);
      }
    }
  }
  return created;
}

/** Every 30 minutes: close overdue open instances, then remind assignees of what is due within 60 minutes. */
export async function runReminders(now: Date): Promise<void> {
  const firestore = db();
  const nowTs = Timestamp.fromDate(now);

  // Close overdue work. Batches of 400 keep under the 500-write limit; each pass removes its rows from the query.
  for (;;) {
    const overdue = await firestore
      .collectionGroup('instances')
      .where('status', '==', 'open')
      .where('dueAt', '<=', nowTs)
      .limit(400)
      .get();
    if (overdue.empty) break;
    const batch = firestore.batch();
    overdue.docs.forEach((doc) => batch.update(doc.ref, { status: 'partial' }));
    await batch.commit();
    if (overdue.size < 400) break;
  }

  const horizon = Timestamp.fromDate(new Date(now.getTime() + 60 * 60_000));
  for (const status of ['open', 'partial'] as const) {
    const due = await firestore
      .collectionGroup('instances')
      .where('status', '==', status)
      .where('dueAt', '>', nowTs)
      .where('dueAt', '<=', horizon)
      .get();
    for (const doc of due.docs) {
      if (doc.data().reminderSentAt) continue;
      try {
        await sendInstanceReminders(doc, now);
      } catch (error) {
        console.error('sendReminders failed', doc.ref.path, error);
      }
    }
  }
}

async function sendInstanceReminders(doc: QueryDocumentSnapshot, now: Date): Promise<void> {
  const firestore = db();
  const data = doc.data();
  const dueAt = (data.dueAt as Timestamp).toDate();
  const householdSnap = await doc.ref.parent.parent!.get();
  const timeZone = (householdSnap.data()?.timeZone as string | undefined) ?? 'UTC';
  const choreName = (data.choreSnapshot?.name as string | undefined) ?? 'Chore';

  for (const uid of (data.assigneeIds as string[] | undefined) ?? []) {
    const userRef = firestore.collection('users').doc(uid);
    const user = await userRef.get();
    const profile = user.data();
    if (!profile || profile.remindersEnabled === false) continue;
    const tokens = ((profile.fcmTokens as unknown[] | undefined) ?? []).filter(
      (token): token is string => typeof token === 'string',
    );
    if (tokens.length === 0) continue;

    const time = formatLocalTime(dueAt, timeZone, resolveLocale(profile.locale));
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: choreName, body: reminderBody(profile.locale, choreName, time) },
    });
    const dead = response.responses.flatMap((result, index) =>
      !result.success && DEAD_TOKEN_CODES.has(result.error?.code ?? '') ? [tokens[index]] : [],
    );
    if (dead.length > 0) await userRef.update({ fcmTokens: FieldValue.arrayRemove(...dead) });
  }

  // Marked after the sends, so a failed run is retried on the next pass.
  await doc.ref.update({ reminderSentAt: Timestamp.fromDate(now) });
}
