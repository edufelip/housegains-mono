import { FieldValue, Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore';
import { db } from '../admin';
import { weekInstants, type WeekClosedContext } from '../domain/standings';
import {
  visibility,
  type GamiEvent,
  type WeekMemberStats as GamiWeekMemberStats,
} from '../domain/gamification';
import { cohortOf, loadGamiConfig } from './config';
import { onTimeCounts } from './facts';
import { runGamificationStrict } from './runner';

// The Part C share of a closed week (C7/C8): one household.week_closed event
// built from the WeekClosedContext plus what the engine still needs (weekly
// goal, due/on-time instances, per-member undo/revoke counts, away weeks), run
// through the runner, and the week doc's gamification aggregates. Registered
// in afterWeekClosedHooks by scheduled.ts.

/**
 * Runs the week's gamification. A failure is logged and the week doc is left without its
 * `gamification.processedAt` marker, which is what makes closeWeeks replay it on the next pass
 * (scheduled.ts); the engine's deterministic keys and `lastActionWeek` make a replay safe.
 */
export async function gamiWeekClosedHook(context: WeekClosedContext): Promise<void> {
  try {
    await closeWeek(context);
  } catch (error) {
    console.error('gamiWeekClosedHook failed', { householdId: context.householdId }, error);
  }
}

/** Whether a closed week's gamification run finished (`gamification.processedAt`, written on success only). */
export function gamiWeekProcessed(week: DocumentSnapshot): boolean {
  return week.get('gamification.processedAt') instanceof Timestamp;
}

async function closeWeek(context: WeekClosedContext): Promise<void> {
  const config = await loadGamiConfig();
  if (config.mode === 'off') return;
  const householdRef = db().doc(`households/${context.householdId}`);
  const householdSnap = await householdRef.get();
  if (!householdSnap.exists) return;
  const hh = householdSnap.data()!;
  const memberUids = (hh.memberUids as string[] | undefined) ?? [];
  const creatorUid = hh.creatorUid as string | undefined;
  if (creatorUid === undefined) return;
  const timeZone = context.timeZone;
  const cohort = cohortOf(context.householdId, config);
  const vis = visibility(config.mode, cohort);
  if (!vis.write) return;

  const { weekStart: weekStartInstant, weekEnd: weekEndInstant } = weekInstants(context, timeZone);
  const [ledger, instances, walletSnaps] = await Promise.all([
    householdRef.collection('ledger')
      .where('createdAt', '>=', Timestamp.fromDate(weekStartInstant))
      .where('createdAt', '<', Timestamp.fromDate(weekEndInstant))
      .get(),
    householdRef.collection('instances')
      .where('dueAt', '>=', Timestamp.fromDate(weekStartInstant))
      .where('dueAt', '<', Timestamp.fromDate(weekEndInstant))
      .get(),
    memberUids.length > 0 ? db().getAll(...memberUids.map((uid) => db().doc(`wallets/${uid}`))) : Promise.resolve([]),
  ]);

  // Net credits come from the standings context; only the undo/revoke split
  // (the C9 undo-rate alert) needs the raw rows again.
  const undoCounts = new Map<string, { undo: number; revoke: number }>();
  for (const doc of ledger.docs) {
    const memberId = doc.get('memberId');
    if (typeof memberId !== 'string' || !Object.prototype.hasOwnProperty.call(context.members, memberId)) continue;
    const entry = undoCounts.get(memberId) ?? { undo: 0, revoke: 0 };
    if (doc.get('source') === 'undo-subtask') entry.undo += 1;
    if (doc.get('source') === 'revoke-subtask') entry.revoke += 1;
    undoCounts.set(memberId, entry);
  }

  const { due, onTime } = onTimeCounts(instances.docs);

  const members: Record<string, GamiWeekMemberStats> = {};
  let totalXp = 0;
  for (const [uid, stats] of Object.entries(context.members)) {
    const reversals = undoCounts.get(uid) ?? { undo: 0, revoke: 0 };
    members[uid] = {
      xp: stats.xp,
      credits: stats.subtasks,
      assignedDue: stats.assignedDue,
      missed: stats.missed,
      undoCount: reversals.undo,
      revokeCount: reversals.revoke,
    };
    totalXp += stats.xp;
  }

  const weeklyGoalXp = typeof hh.weeklyGoalXp === 'number' ? hh.weeklyGoalXp : null;
  const goalReached = weeklyGoalXp !== null && totalXp >= weeklyGoalXp;
  // A week where every active member is away pauses the organizer streak (C7).
  const allAway =
    memberUids.length > 0 &&
    memberUids.every((uid) => {
      const snap = walletSnaps.find((candidate) => candidate.id === uid);
      const awayWeeks = snap?.get('streak.awayWeeks');
      return snap?.exists === true && Array.isArray(awayWeeks) && (awayWeeks as string[]).includes(context.weekStart);
    });

  const weekRef = householdRef.collection('weeks').doc(context.weekStart);
  await weekRef.set(
    {
      gamification: {
        onTimeRate: due > 0 ? Math.round((onTime * 100) / due) : 0,
        dueInstances: due,
        doneOnTime: onTime,
        goalReached,
      },
    },
    { merge: true },
  );

  const event: GamiEvent = {
    kind: 'household.week_closed',
    householdId: context.householdId,
    weekStart: context.weekStart,
    weekEnd: context.weekEnd,
    timeZone,
    closedAt: context.closedAt,
    weeklyGoalXp,
    goalReached,
    instancesDue: due,
    instancesOnTime: onTime,
    allAway,
    members,
  };
  await runGamificationStrict([event], {
    householdId: context.householdId,
    household: {
      timeZone,
      creatorUid,
      memberCount: memberUids.length,
      cohort: typeof hh.gamificationCohort === 'string' ? hh.gamificationCohort : null,
    },
    callerUid: creatorUid,
    now: context.closedAt,
    sync: false,
  });
  // Only reached when the engine run committed: a thrown error above leaves the week unmarked.
  await weekRef.update({ 'gamification.processedAt': FieldValue.serverTimestamp() });
}
