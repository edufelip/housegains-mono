import { Timestamp } from 'firebase-admin/firestore';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { db } from '../admin';
import {
  gamiHouseRateBody,
  gamiHouseRateTitle,
  gamiStreakReminderBody,
  gamiStreakReminderTitle,
} from '../domain/people';
import { dateKeyInTimeZone, localDateTimeToInstant, weekdayForDateKey } from '../domain/time';
import type { ServerEventDraft } from '../domain/gamification';
import { weekBounds } from '../domain/standings';
import { pushToMembers } from '../notify';
import { onTimeCounts } from './facts';
import { serverEventToDoc } from './serialize';

// gamificationReminders (contract C7), driven hourly by index.ts:
// - Sunday 18:00 local: members under 3 net subtask credits this week whose
//   streak is at least 1 ("Faltam 2 etapas para manter suas 8 semanas.");
// - Saturday 10:00 local: the creator when the on-time rate so far is under
//   60% with at least 5 instances due ("A casa está em 52% esta semana.").
// Every household (the program is always on), remindersEnabled respected,
// at most one reminder of each kind per household per week: the marker doc
// households/{hid}/gamiReminders/{weekStart}:{kind} is claimed with create()
// BEFORE anything is sent, so a repeated run in the same hour is a no-op.

const MAX_CONCURRENCY = 10;
const MIN_WEEK_CREDITS = 3;
const MIN_DUE_FOR_HOUSE_REMINDER = 5;
const HOUSE_RATE_THRESHOLD_PERCENT = 60;

type ReminderKind = 'member' | 'creator';

export async function runGamificationReminders(now: Date): Promise<void> {
  const households = await db().collection('households').get();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, households.size) }, async () => {
      while (next < households.size) {
        const household = households.docs[next++];
        try {
          await remindHousehold(household, now);
        } catch (error) {
          console.error('gamificationReminders failed', { householdId: household.id }, error);
        }
      }
    }),
  );
}

function reminderKindAt(now: Date, timeZone: string): ReminderKind | null {
  const weekday = weekdayForDateKey(dateKeyInTimeZone(now, timeZone));
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now));
  if (weekday === 0 && hour === 18) return 'member';
  if (weekday === 6 && hour === 10) return 'creator';
  return null;
}

/** true when this run claimed the marker; false when an earlier run already did. */
async function claimMarker(household: QueryDocumentSnapshot, weekStart: string, kind: ReminderKind, now: Date) {
  try {
    await household.ref.collection('gamiReminders').doc(`${weekStart}:${kind}`).create({ sentAt: Timestamp.fromDate(now) });
    return true;
  } catch (error) {
    const code = (error as { code?: string | number }).code;
    if (code === 'ALREADY_EXISTS' || code === 6) return false;
    throw error;
  }
}

async function remindHousehold(household: QueryDocumentSnapshot, now: Date): Promise<void> {
  const data = household.data();
  const timeZone = typeof data.timeZone === 'string' ? data.timeZone : 'UTC';
  const memberUids = Array.isArray(data.memberUids) ? (data.memberUids as string[]) : [];
  const creatorUid = typeof data.creatorUid === 'string' ? data.creatorUid : null;
  if (memberUids.length === 0 || creatorUid === null) return;
  const kind = reminderKindAt(now, timeZone);
  if (kind === null) return;

  const week = weekBounds(now, timeZone);
  if (!(await claimMarker(household, week.weekStart, kind, now))) return;

  const weekStartInstant = localDateTimeToInstant(week.weekStart, '00:00', timeZone);
  const recipients =
    kind === 'member'
      ? await remindMembers(household, memberUids, week.weekStart, weekStartInstant, now)
      : await remindCreator(household, creatorUid, weekStartInstant, now);
  if (recipients === 0) return;

  const event: ServerEventDraft = {
    name: 'gami_reminder_sent',
    householdId: household.id,
    data: { kind, weekStart: week.weekStart, recipients },
    createdAt: now,
  };
  await household.ref.collection('events').doc(`gami_reminder_sent:${kind}:${week.weekStart}`).set(serverEventToDoc(event));
}

async function optedIn(uids: string[]): Promise<string[]> {
  if (uids.length === 0) return [];
  const snaps = await db().getAll(...uids.map((uid) => db().doc(`users/${uid}`)));
  return snaps.filter((snap) => snap.exists && snap.get('remindersEnabled') !== false).map((snap) => snap.id);
}

/** Sunday 18:00: members whose streak is at risk. Returns how many were reminded. */
async function remindMembers(
  household: QueryDocumentSnapshot,
  memberUids: string[],
  weekStart: string,
  weekStartInstant: Date,
  now: Date,
): Promise<number> {
  const ledger = await household.ref
    .collection('ledger')
    .where('createdAt', '>=', Timestamp.fromDate(weekStartInstant))
    .where('createdAt', '<=', Timestamp.fromDate(now))
    .get();
  const credits = new Map<string, number>();
  for (const doc of ledger.docs) {
    const memberId = doc.get('memberId');
    const source = doc.get('source');
    const delta = source === 'subtask' ? 1 : source === 'undo-subtask' || source === 'revoke-subtask' ? -1 : 0;
    if (typeof memberId !== 'string' || delta === 0) continue;
    credits.set(memberId, (credits.get(memberId) ?? 0) + delta);
  }
  const wallets = await db().getAll(...memberUids.map((uid) => db().doc(`wallets/${uid}`)));
  const atRisk = wallets.flatMap((snap) => {
    if (!snap.exists) return [];
    const streak = snap.get('streak.current');
    const away = snap.get('streak.awayWeeks');
    // An away week freezes the streak: nothing to remind about.
    if (Array.isArray(away) && (away as unknown[]).includes(weekStart)) return [];
    const current = typeof streak === 'number' ? streak : 0;
    const weekCredits = credits.get(snap.id) ?? 0;
    return current >= 1 && weekCredits < MIN_WEEK_CREDITS ? [{ uid: snap.id, current, steps: MIN_WEEK_CREDITS - weekCredits }] : [];
  });
  const allowed = new Set(await optedIn(atRisk.map((entry) => entry.uid)));
  const recipients = atRisk.filter((entry) => allowed.has(entry.uid));
  await Promise.all(
    recipients.map((entry) =>
      pushToMembers({
        uids: [entry.uid],
        title: (locale) => gamiStreakReminderTitle(locale),
        bodyFor: (locale) => gamiStreakReminderBody(locale, entry.steps, entry.current),
      }),
    ),
  );
  return recipients.length;
}

/** Saturday 10:00: the creator when the house is running late. Returns 1 when reminded. */
async function remindCreator(
  household: QueryDocumentSnapshot,
  creatorUid: string,
  weekStartInstant: Date,
  now: Date,
): Promise<number> {
  const instances = await household.ref
    .collection('instances')
    .where('dueAt', '>=', Timestamp.fromDate(weekStartInstant))
    .where('dueAt', '<=', Timestamp.fromDate(now))
    .get();
  const { due, onTime } = onTimeCounts(instances.docs);
  if (due < MIN_DUE_FOR_HOUSE_REMINDER || (onTime * 100) / due >= HOUSE_RATE_THRESHOLD_PERCENT) return 0;
  if ((await optedIn([creatorUid])).length === 0) return 0;
  const percent = Math.floor((onTime * 100) / due);
  await pushToMembers({
    uids: [creatorUid],
    title: (locale) => gamiHouseRateTitle(locale),
    bodyFor: (locale) => gamiHouseRateBody(locale, percent),
  });
  return 1;
}
