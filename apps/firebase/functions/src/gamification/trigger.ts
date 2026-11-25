import { Timestamp } from 'firebase-admin/firestore';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { db } from '../admin';
import type { ChoreRecord, InstanceRecord } from '../domain/instances';
import type { GamiEvent } from '../domain/gamification';
import { householdInfo, readChore, readInstance } from '../store';
import { recentSubtaskTimes } from './facts';
import { gamiProcessedPath } from './paths';
import { runGamification } from './runner';

// Safety net (contract C8): every households/{hid}/ledger row re-runs the engine
// for that row, so a crashed post-transaction run is backfilled. Deterministic
// row keys plus create() inside the runner's transaction make the callable and
// this replay single-pay; the replay is a no-op whenever the callable already
// wrote the rows.
//
// The replay rebuilds its event from the row and the documents as they are NOW.
// It is an approximation of what the callable saw (the callable path is exact):
// a completion that has since been undone or revoked is not paid again.

export type LedgerSource = 'subtask' | 'bonus' | 'undo-subtask' | 'undo-bonus' | 'revoke-subtask' | 'revoke-bonus';
const SOURCES: ReadonlySet<string> = new Set<LedgerSource>([
  'subtask',
  'bonus',
  'undo-subtask',
  'undo-bonus',
  'revoke-subtask',
  'revoke-bonus',
]);

/**
 * Never throws: a failed replay is logged and nothing retries it. A row the callable already covered
 * (its processed marker exists) returns at once; otherwise the replay waits `graceMs` for the callable to
 * finish before it runs the engine itself.
 */
export async function replayGamiLedgerRow(doc: QueryDocumentSnapshot, options: { graceMs?: number } = {}): Promise<void> {
  try {
    await replay(doc, options.graceMs ?? 0);
  } catch (error) {
    console.error('replayGamiLedgerRow failed', { path: doc.ref.path }, error);
  }
}

async function isProcessed(hid: string, rowId: string): Promise<boolean> {
  return (await db().doc(gamiProcessedPath(hid, rowId)).get()).exists;
}

async function replay(doc: QueryDocumentSnapshot, graceMs: number): Promise<void> {
  const hid = doc.ref.parent.parent?.id;
  if (hid === undefined) return;
  const data = doc.data();
  const source = data.source;
  const instanceId = data.instanceId;
  const memberId = data.memberId;
  if (!isLedgerSource(source) || typeof instanceId !== 'string' || typeof memberId !== 'string') return;
  if (await isProcessed(hid, doc.id)) return;
  if (graceMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, graceMs));
    if (await isProcessed(hid, doc.id)) return;
  }

  const [householdSnap, instanceSnap, memberSnap] = await Promise.all([
    db().doc(`households/${hid}`).get(),
    db().doc(`households/${hid}/instances/${instanceId}`).get(),
    db().doc(`households/${hid}/members/${memberId}`).get(),
  ]);
  if (!householdSnap.exists || !instanceSnap.exists) return;
  const instance = readInstance(instanceSnap);
  const choreSnap = await db().doc(`households/${hid}/chores/${instance.choreId}`).get();
  const chore = choreSnap.exists ? readChore(choreSnap) : null;
  const actionAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
  const peak = memberSnap.get('xpPeak');
  const joinedAt = memberSnap.get('joinedAt');
  const facts: ReplayFacts = {
    hid,
    rowId: doc.id,
    instance,
    chore,
    memberId,
    actionAt,
    amount: typeof data.amount === 'number' ? data.amount : 0,
    xpPeakAfter: typeof peak === 'number' ? peak : null,
    joinedAt: joinedAt instanceof Timestamp ? joinedAt.toDate() : null,
    reversesRowId: typeof data.reversesEntryId === 'string' ? data.reversesEntryId : null,
    subtaskId: typeof data.subtaskId === 'string' ? data.subtaskId : null,
    moderation: readModeration(data.moderation, memberId),
    recentSubtaskTimestamps: source === 'subtask' ? await recentSubtaskTimes(hid, memberId, actionAt) : [],
    reversed: source === 'bonus' ? await hasReversal(hid, doc.id) : false,
  };

  const events = buildReplayEvents(source, facts);
  if (events.length === 0) return;
  await runGamification(events, {
    householdId: hid,
    household: householdInfo(householdSnap.data()!),
    callerUid: memberId,
    now: actionAt,
    sync: false,
    ledgerRowIds: [doc.id],
  });
}

/** Everything buildReplayEvents needs about one households/{hid}/ledger row; the caller does the reads. */
export interface ReplayFacts {
  hid: string;
  rowId: string;
  instance: InstanceRecord;
  chore: ChoreRecord | null;
  memberId: string;
  actionAt: Date;
  amount: number;
  xpPeakAfter: number | null;
  joinedAt: Date | null;
  reversesRowId: string | null;
  subtaskId: string | null;
  moderation: { actorUid: string; verdict: 'partial' | 'not_done'; disputeId: string | null };
  /** Subtask rows only: the member's subtask credit times in the 10 minutes up to the action (C9 velocity). */
  recentSubtaskTimestamps: Date[];
  /** Bonus rows only: a later undo/revoke row names this row, so it must not be paid. */
  reversed: boolean;
}

/**
 * The engine events for one XP ledger row, rebuilt from the documents as they are now. Pure: the safety-net
 * trigger and the admin simulator both use it, each supplying the facts its own way.
 */
export function buildReplayEvents(source: LedgerSource, facts: ReplayFacts): GamiEvent[] {
  switch (source) {
    case 'subtask':
      return subtaskEvents(facts);
    case 'bonus':
      return facts.reversed ? [] : [bonusEvent(facts)];
    case 'undo-subtask':
    case 'revoke-subtask':
      return subtaskReversalEvents(facts, source);
    case 'undo-bonus':
    case 'revoke-bonus':
      return bonusReversalEvents(facts, source);
  }
}

export function isLedgerSource(value: unknown): value is LedgerSource {
  return typeof value === 'string' && SOURCES.has(value);
}

export function readModeration(
  value: unknown,
  fallbackActor: string,
): { actorUid: string; verdict: 'partial' | 'not_done'; disputeId: string | null } {
  const moderation = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    actorUid: typeof moderation.actorUid === 'string' ? moderation.actorUid : fallbackActor,
    verdict: moderation.verdict === 'partial' ? 'partial' : 'not_done',
    disputeId: typeof moderation.disputeId === 'string' ? moderation.disputeId : null,
  };
}

/** A later undo/revoke row names this row: it must not be paid (again). */
async function hasReversal(hid: string, rowId: string): Promise<boolean> {
  const snap = await db()
    .collection(`households/${hid}/ledger`)
    .where('reversesEntryId', '==', rowId)
    .limit(1)
    .get();
  return !snap.empty;
}

function subtaskEvents(facts: ReplayFacts): GamiEvent[] {
  const { hid, instance, chore, memberId, actionAt } = facts;
  const completion = instance.completions.find(
    (entry) =>
      entry.subtaskId === facts.subtaskId &&
      entry.memberId === memberId &&
      entry.completedAt.getTime() === actionAt.getTime(),
  );
  // No matching completion: the subtask was undone or revoked since. Never pay it.
  if (completion === undefined) return [];
  const lastCompletedAt = instance.completions.reduce((max, entry) => Math.max(max, entry.completedAt.getTime()), 0);
  const isFinalCompleter = instance.status === 'done' && completion.completedAt.getTime() === lastCompletedAt;
  const events: GamiEvent[] = [
    {
      kind: 'ledger.subtask',
      householdId: hid,
      ledgerRowId: facts.rowId,
      instanceId: instance.id,
      subtaskId: completion.subtaskId,
      memberId,
      amount: facts.amount,
      isAssist: completion.isAssist,
      isFinalCompleter,
      assigneeIds: instance.assigneeIds,
      category: instance.choreSnapshot.category,
      choreId: instance.choreId,
      choreCreatedBy: chore?.createdBy ?? '',
      choreIsCustom: chore !== null && chore.catalogId === undefined,
      choreUpdatedAt: chore?.updatedAt ?? null,
      completedAt: actionAt,
      memberJoinedAt: facts.joinedAt,
      xpPeakAfter: facts.xpPeakAfter,
      choreXpRaised: chore?.xpRaisedAt != null,
      recentSubtaskTimestamps: facts.recentSubtaskTimestamps,
    },
  ];
  if (isFinalCompleter && actionAt.getTime() <= instance.dueAt.getTime()) {
    events.push({
      kind: 'instance.completed_on_time',
      householdId: hid,
      instanceId: instance.id,
      dueAt: instance.dueAt,
      completedAt: actionAt,
      assigneeIds: instance.assigneeIds,
      contributorIds: [...new Set(instance.completions.map((entry) => entry.memberId))],
      finalCompleterId: memberId,
      finalRowId: facts.rowId,
      choreId: instance.choreId,
      choreUpdatedAt: chore?.updatedAt ?? null,
    });
  }
  return events;
}

function bonusEvent(facts: ReplayFacts): GamiEvent {
  return {
    kind: 'ledger.bonus',
    householdId: facts.hid,
    ledgerRowId: facts.rowId,
    instanceId: facts.instance.id,
    memberId: facts.memberId,
    amount: facts.amount,
    choreId: facts.instance.choreId,
    choreUpdatedAt: facts.chore?.updatedAt ?? null,
    completedAt: facts.actionAt,
    xpPeakAfter: facts.xpPeakAfter,
  };
}

function subtaskReversalEvents(facts: ReplayFacts, source: 'undo-subtask' | 'revoke-subtask'): GamiEvent[] {
  const { hid, instance, memberId, actionAt } = facts;
  if (facts.reversesRowId === null || facts.subtaskId === null) return [];
  const base = {
    householdId: hid,
    instanceId: instance.id,
    subtaskId: facts.subtaskId,
    memberId,
    reversedRowId: facts.reversesRowId,
    reversedAmount: -facts.amount,
    // Approximated from the reopened instance; the callable path is exact.
    isAssist: instance.assigneeIds.length > 0 && !instance.assigneeIds.includes(memberId),
    category: instance.choreSnapshot.category,
    isFinalCompleter: false,
    instanceStatusAfter: instance.status,
    assigneeIds: instance.assigneeIds,
    completedAt: actionAt,
    reversedAward: { subtask: null, assist: null },
  };
  return [
    source === 'revoke-subtask'
      ? { kind: 'ledger.revoke-subtask', ...base, ...facts.moderation }
      : { kind: 'ledger.undo-subtask', ...base },
  ];
}

function bonusReversalEvents(facts: ReplayFacts, source: 'undo-bonus' | 'revoke-bonus'): GamiEvent[] {
  if (facts.reversesRowId === null) return [];
  const base = {
    householdId: facts.hid,
    instanceId: facts.instance.id,
    memberId: facts.memberId,
    reversedRowId: facts.reversesRowId,
    reversedAmount: -facts.amount,
    completedAt: facts.actionAt,
    reversedAward: { bonus: null },
  };
  return [
    source === 'revoke-bonus'
      ? { kind: 'ledger.revoke-bonus', ...base, ...facts.moderation }
      : { kind: 'ledger.undo-bonus', ...base },
  ];
}
