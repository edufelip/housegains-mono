import { isRecurrenceDueOnDateKey } from './recurrence';
import { addDaysToDateKey, dateKeyInTimeZone, localDateTimeToInstant } from './time';

// Ported from household-client.ts (reconcileOccurrences, snapshot updates, editable future rules).

export const INSTANCE_HORIZON_DAYS = 14;
export const MAX_CATCH_UP_DAYS = 365;

export interface SubtaskDef {
  id: string;
  name: string;
  xp: number;
  position: number;
  catalogSubtaskId?: string;
}

/** The editable definition of a chore, as validated by domain/validate.ts. */
export interface ChoreFields {
  name: string;
  icon: string;
  category: string;
  catalogId?: string;
  subtasks: SubtaskDef[];
  bonusXp: number;
  assigneeIds: string[];
  recurrence: string;
  dueTime: string;
  isActive: boolean;
}

export interface ChoreRecord extends ChoreFields {
  id: string;
  recurrenceAnchor: string;
  generatedThrough: string;
  /** Server-set metadata (gamification contract Part C): engine inputs, not client input. */
  createdAt?: Date | null;
  updatedAt?: Date | null;
  createdBy?: string | null;
  /** Set when a save raised XP; cleared by the next non-raising save (C9 alert input). */
  xpRaisedAt?: Date | null;
}

export interface ChoreSnapshot {
  name: string;
  icon: string;
  category: string;
  recurrence: string;
  dueTime: string;
  catalogId?: string;
}

export interface Completion {
  id: string;
  instanceId: string;
  subtaskId: string;
  memberId: string;
  xp: number;
  completedAt: Date;
  isAssist: boolean;
}

/** A moderation reversal, appended when a completion is revoked (contract A3). */
export interface Revocation {
  subtaskId: string;
  memberId: string;
  xp: number;
  actorUid: string;
  verdict: 'partial' | 'not_done';
  at: Date;
}

export interface InstanceRecord {
  id: string;
  choreId: string;
  dueAt: Date;
  subtasks: SubtaskDef[];
  bonusXp: number;
  assigneeIds: string[];
  status: 'open' | 'partial' | 'done';
  completions: Completion[];
  bonusAwards: Record<string, number>;
  choreSnapshot: ChoreSnapshot;
  reminderSentAt?: Date;
  revocations?: Revocation[];
  disputeStatus?: 'open' | 'resolved' | 'expired';
  /**
   * Set when the instance is a review record (it carries a dispute or revocations) whose chore
   * was deleted or paused while the instance sat open in the future. The record stays, but the
   * instance is out of play: no reminders, no completions, never counted as assigned or missed.
   */
  retiredAt?: Date;
}

export function instanceIdFor(choreId: string, dateKey: string): string {
  return `${choreId}_${dateKey}`;
}

export function snapshotOf(chore: ChoreFields): ChoreSnapshot {
  return {
    name: chore.name,
    icon: chore.icon,
    category: chore.category,
    recurrence: chore.recurrence,
    dueTime: chore.dueTime,
    ...(chore.catalogId ? { catalogId: chore.catalogId } : {}),
  };
}

/**
 * Instances the chore should have from generatedThrough+1 up to today+horizon.
 * Returns candidates only; the caller skips ids that already exist.
 */
export function generateChoreInstances(
  chore: ChoreRecord,
  now: Date,
  timeZone: string,
): { instances: InstanceRecord[]; generatedThrough: string } {
  const todayKey = dateKeyInTimeZone(now, timeZone);
  const endKey = addDaysToDateKey(todayKey, INSTANCE_HORIZON_DAYS);
  if (!chore.isActive) return { instances: [], generatedThrough: chore.generatedThrough };

  const anchorKey = chore.recurrenceAnchor;
  let startKey = addDaysToDateKey(chore.generatedThrough, 1);
  const oldestAllowedKey = addDaysToDateKey(todayKey, -MAX_CATCH_UP_DAYS);
  if (startKey < oldestAllowedKey) startKey = oldestAllowedKey;
  if (startKey < anchorKey) startKey = anchorKey;

  const instances: InstanceRecord[] = [];
  for (let dateKey = startKey; dateKey <= endKey; dateKey = addDaysToDateKey(dateKey, 1)) {
    if (!isRecurrenceDueOnDateKey(chore.recurrence, dateKey, anchorKey)) continue;
    const dueAt = localDateTimeToInstant(dateKey, chore.dueTime, timeZone);
    instances.push({
      id: instanceIdFor(chore.id, dateKey),
      choreId: chore.id,
      dueAt,
      subtasks: chore.subtasks.map((subtask) => ({ ...subtask })),
      bonusXp: chore.bonusXp,
      assigneeIds: [...chore.assigneeIds],
      status: dueAt.getTime() <= now.getTime() ? 'partial' : 'open',
      completions: [],
      bonusAwards: {},
      choreSnapshot: snapshotOf(chore),
    });
  }
  const generatedThrough = endKey > chore.generatedThrough ? endKey : chore.generatedThrough;
  return { instances, generatedThrough };
}

/**
 * Future, untouched instances: the only ones a chore edit may rewrite or remove. An instance
 * that carries a dispute or a moderation revocation is part of a review record (the dispute
 * and the revocations live on it), so it is never editable, even when undo left it open with
 * no completions.
 */
export function isEditableFuture(
  instance: {
    status: string;
    completions: unknown[];
    dueAt: Date;
    revocations?: unknown[];
    disputeStatus?: string;
  },
  now: Date,
): boolean {
  return (
    instance.status === 'open' &&
    instance.completions.length === 0 &&
    (instance.revocations?.length ?? 0) === 0 &&
    instance.disputeStatus === undefined &&
    instance.dueAt.getTime() > now.getTime()
  );
}

/**
 * A future, open instance with nothing earned on it that is nevertheless a review record
 * (a dispute or a revocation lives on it, e.g. an undo or not_done verdict reopened it). A chore
 * delete or pause cannot remove it, so it is retired instead (`retiredAt`); a chore edit only
 * refreshes its assignees.
 */
export function isFutureReviewRecord(
  instance: {
    status: string;
    completions: unknown[];
    dueAt: Date;
    revocations?: unknown[];
    disputeStatus?: string;
  },
  now: Date,
): boolean {
  return (
    instance.status === 'open' &&
    instance.completions.length === 0 &&
    ((instance.revocations?.length ?? 0) > 0 || instance.disputeStatus !== undefined) &&
    instance.dueAt.getTime() > now.getTime()
  );
}

/** Fields to rewrite on an editable future instance after its chore changed. */
export function refreshedFields(
  instance: InstanceRecord,
  chore: ChoreFields,
  timeZone: string,
): Pick<InstanceRecord, 'choreSnapshot' | 'dueAt' | 'subtasks' | 'bonusXp' | 'assigneeIds'> {
  return {
    choreSnapshot: snapshotOf(chore),
    dueAt: localDateTimeToInstant(dateKeyInTimeZone(instance.dueAt, timeZone), chore.dueTime, timeZone),
    subtasks: chore.subtasks.map((subtask) => ({ ...subtask })),
    bonusXp: chore.bonusXp,
    assigneeIds: [...chore.assigneeIds],
  };
}
