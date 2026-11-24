import { getMessaging } from 'firebase-admin/messaging';
import { FieldValue, Timestamp, type DocumentReference, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { db } from './admin';
import { INSTANCE_HORIZON_DAYS } from './domain/instances';
import { addDaysToDateKey, dateKeyInTimeZone, formatLocalTime, localDateTimeToInstant } from './domain/time';
import { reminderBody, resolveLocale, weekShameBody, weekShameTitle, weekTopBody, weekTopTitle } from './domain/people';
import {
  afterWeekClosed,
  memberWeekStats,
  pickTopMember,
  pickWallOfShame,
  weekInstants,
  weekToClose,
  type WeekBounds,
  type WeekClosedContext,
} from './domain/standings';
import { pushToMembers } from './notify';
import { generateChoreInstancesFor } from './store';

// Scheduled work: instance generation, overdue closing, "your turn" reminders,
// weekly standings (Part B) and dispute expiry (Part A2).

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

const MAX_CONCURRENCY = 10;

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        await work(items[index]);
      }
    }),
  );
}

/** Daily 03:00 UTC: fill each active chore's instances up to the 14-day horizon. */
export async function generateAllInstances(now: Date): Promise<number> {
  const households = await db().collection('households').get();
  let created = 0;
  await mapWithConcurrency(households.docs, MAX_CONCURRENCY, async (household) => {
    const chores = await household.ref.collection('chores').where('isActive', '==', true).get();
    const timeZone = (household.data().timeZone as string | undefined) ?? 'UTC';
    const horizon = addDaysToDateKey(dateKeyInTimeZone(now, timeZone), INSTANCE_HORIZON_DAYS);
    for (const chore of chores.docs) {
      if (typeof chore.get('generatedThrough') === 'string' && chore.get('generatedThrough') >= horizon) continue;
      try {
        const count = await generateChoreInstancesFor(household.id, chore.id, now);
        created += count;
      } catch (error) {
        console.error('generateInstances failed', household.id, chore.id, error);
      }
    }
  });
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
  const householdTimeZones = new Map<string, Promise<string>>();
  const profiles = new Map<string, Promise<Record<string, unknown> | undefined>>();
  for (const status of ['open', 'partial'] as const) {
    const due = await firestore
      .collectionGroup('instances')
      .where('status', '==', status)
      .where('dueAt', '>', nowTs)
      .where('dueAt', '<=', horizon)
      .get();
    await mapWithConcurrency(due.docs, MAX_CONCURRENCY, async (doc) => {
      if (doc.data().reminderSentAt) return;
      try {
        await sendInstanceReminders(doc, now, householdTimeZones, profiles);
      } catch (error) {
        console.error('sendReminders failed', doc.ref.path, error);
      }
    });
  }
}

async function sendInstanceReminders(
  doc: QueryDocumentSnapshot,
  now: Date,
  householdTimeZones: Map<string, Promise<string>>,
  profiles: Map<string, Promise<Record<string, unknown> | undefined>>,
): Promise<void> {
  const firestore = db();
  const data = doc.data();
  const dueAt = (data.dueAt as Timestamp).toDate();
  const householdRef = doc.ref.parent.parent!;
  let timeZonePromise = householdTimeZones.get(householdRef.path);
  if (!timeZonePromise) {
    timeZonePromise = householdRef.get().then((snap) => (snap.data()?.timeZone as string | undefined) ?? 'UTC');
    householdTimeZones.set(householdRef.path, timeZonePromise);
  }
  const timeZone = await timeZonePromise;
  const choreName = (data.choreSnapshot?.name as string | undefined) ?? 'Chore';

  for (const uid of (data.assigneeIds as string[] | undefined) ?? []) {
    const userRef = firestore.collection('users').doc(uid);
    let profilePromise = profiles.get(uid);
    if (!profilePromise) {
      profilePromise = userRef.get().then((user) => user.data());
      profiles.set(uid, profilePromise);
    }
    const profile = await profilePromise;
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

// ---- Weekly standings and dispute expiry (moderation contract Part B / A2) ------

/** Firestore's already-exists, whatever shape the SDK throws it in. */
function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: string | number }).code;
  return code === 'ALREADY_EXISTS' || code === 6;
}

/** What closeHouseholdWeek needs from a freshly written week doc. */
interface ClosedWeek {
  context: WeekClosedContext;
  memberNames: Map<string, string>;
}

/**
 * Closes the week doc for one household if it is missing and the close threshold has
 * passed. `create()` keeps it idempotent: if a concurrent run wrote the doc first, the
 * loser treats the race as a no-op (null). Returns null when there is nothing to close.
 */
async function closeHouseholdWeekDoc(
  householdRef: DocumentReference,
  hid: string,
  timeZone: string,
  memberUids: string[],
  week: WeekBounds,
  now: Date,
): Promise<ClosedWeek | null> {
  const weekRef = householdRef.collection('weeks').doc(week.weekStart);
  if ((await weekRef.get()).exists) return null;

  const instants = weekInstants(week, timeZone);
  const startTs = Timestamp.fromDate(instants.weekStart);
  const endTs = Timestamp.fromDate(instants.weekEnd);
  const [ledger, instances, memberDocs] = await Promise.all([
    householdRef.collection('ledger').where('createdAt', '>=', startTs).where('createdAt', '<', endTs).get(),
    householdRef.collection('instances').where('dueAt', '>=', startTs).where('dueAt', '<', endTs).get(),
    householdRef.collection('members').get(),
  ]);

  const members = memberWeekStats({
    memberIds: memberUids,
    rows: ledger.docs.map((doc) => ({
      memberId: doc.get('memberId') as string,
      amount: Number(doc.get('amount')) || 0,
      source: doc.get('source') as string,
      createdAt: (doc.get('createdAt') as Timestamp).toDate(),
    })),
    instances: instances.docs.map((doc) => ({
      assigneeIds: (doc.get('assigneeIds') as string[] | undefined) ?? [],
      dueAt: (doc.get('dueAt') as Timestamp).toDate(),
      status: doc.get('status') as string,
    })),
    weekStart: instants.weekStart,
    weekEnd: instants.weekEnd,
  });
  const topMember = pickTopMember(members);
  const wallOfShame = pickWallOfShame(members);
  const memberNames = new Map(
    memberDocs.docs.map((doc) => [doc.id, (doc.get('name') as string | undefined) ?? 'Someone']),
  );

  // The doc shape is the contract's; lastPositiveAt is a tie-break input, not stored data.
  const membersOut: Record<string, { xp: number; subtasks: number; assignedDue: number; missed: number }> = {};
  for (const [uid, stats] of Object.entries(members)) {
    membersOut[uid] = { xp: stats.xp, subtasks: stats.subtasks, assignedDue: stats.assignedDue, missed: stats.missed };
  }
  try {
    await weekRef.create({
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      timeZone,
      closedAt: Timestamp.fromDate(now),
      members: membersOut,
      topMember,
      wallOfShame,
    });
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
    return null; // A concurrent run won the create; this run is a no-op.
  }
  return {
    memberNames,
    context: {
      householdId: hid,
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      timeZone,
      closedAt: now,
      members,
      topMember,
      wallOfShame,
    },
  };
}

/** Marks open disputes past their window as expired; completions stand (contract A2). */
async function expireDisputes(householdRef: DocumentReference, now: Date): Promise<void> {
  const nowTs = Timestamp.fromDate(now);
  // Batches of 200 disputes (400 writes) stay under the 500-write limit; each pass's
  // updates take its rows out of the query, like the overdue loop in runReminders.
  for (;;) {
    const open = await householdRef
      .collection('disputes')
      .where('status', '==', 'open')
      .where('expiresAt', '<', nowTs)
      .limit(200)
      .get();
    if (open.empty) break;
    const batch = db().batch();
    for (const dispute of open.docs) {
      batch.update(dispute.ref, { status: 'expired' });
      batch.update(householdRef.collection('instances').doc(dispute.id), { disputeStatus: 'expired' });
    }
    await batch.commit();
    if (open.size < 200) break;
  }
}

/** Localized standings pushes (Part B), only for the run that created the week doc. */
async function notifyWeekClosed(closed: ClosedWeek, memberUids: string[]): Promise<void> {
  const nameOf = (uid: string) => closed.memberNames.get(uid) ?? 'Someone';
  if (closed.context.topMember) {
    const top = closed.context.topMember;
    await pushToMembers({
      uids: memberUids,
      title: weekTopTitle,
      bodyFor: (locale) => weekTopBody(locale, nameOf(top.memberId), top.xp),
    });
  }
  if (closed.context.wallOfShame) {
    const shame = closed.context.wallOfShame;
    await pushToMembers({
      uids: memberUids,
      title: weekShameTitle,
      bodyFor: (locale) => weekShameBody(locale, nameOf(shame.memberId), shame.missed),
    });
  }
}

/** One household's share of the hourly pass: close the week, expire disputes, notify. */
async function closeHouseholdWeek(household: QueryDocumentSnapshot, now: Date): Promise<void> {
  const data = household.data();
  const timeZone = (data.timeZone as string | undefined) ?? 'UTC';
  const memberUids = (data.memberUids as string[] | undefined) ?? [];

  const week = weekToClose(now, timeZone);
  const closed = week
    ? await closeHouseholdWeekDoc(household.ref, household.id, timeZone, memberUids, week, now)
    : null;

  // Disputes expire every run, whether or not a week closed this hour.
  await expireDisputes(household.ref, now);

  if (closed) {
    await notifyWeekClosed(closed, memberUids);
    // Part C (gamification) hooks in here once the engine lands (contract C8).
    await afterWeekClosed(closed.context);
  }
}

/**
 * Every 60 minutes: for every household, close the finished week (Part B) once local
 * time passes Monday 03:00, and expire open disputes past their 72-hour window (A2).
 * Household errors are logged and never stop the other households.
 */
export async function closeAllWeeks(now: Date): Promise<void> {
  const households = await db().collection('households').get();
  await mapWithConcurrency(households.docs, MAX_CONCURRENCY, async (household) => {
    try {
      await closeHouseholdWeek(household, now);
    } catch (error) {
      console.error('closeWeeks failed', household.id, error);
    }
  });
}
