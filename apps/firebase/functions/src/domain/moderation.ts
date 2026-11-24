import { DomainError } from './errors';
import type { Completion } from './instances';
import { pickSuccessor } from './people';

// Part A of docs/implementation/gamification-moderation-contract.md: household roles,
// completion disputes, and the target rules shared by resolveDispute and moderateInstance.

export const DISPUTE_WINDOW_MS = 72 * 60 * 60 * 1000;

export type MemberRole = 'creator' | 'admin' | 'member';
export type DisputeStatus = 'open' | 'resolved' | 'expired';
export type Verdict = 'done' | 'partial' | 'not_done';

/** Admin rights are the creator role plus the admin role (A1). */
export function hasAdminRights(role: unknown): boolean {
  return role === 'creator' || role === 'admin';
}

function fail(code: ConstructorParameters<typeof DomainError>[0], message: string): never {
  throw new DomainError(code, message);
}

/** Reads a caller-supplied subtask id list, rejecting anything but non-empty strings. */
function idList(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) fail('invalid-argument', `${name} must be a list.`);
  return value.map((id: unknown) => {
    if (typeof id !== 'string' || !id) fail('invalid-argument', 'Every subtask id must be a non-empty string.');
    return id;
  });
}

function completionFor(completions: Completion[], subtaskId: string): Completion | null {
  return completions.find((c) => c.subtaskId === subtaskId) ?? null;
}

/** A dispute only covers completions younger than the 72-hour window (A2). */
export function assertWithinDisputeWindow(completions: Completion[], subtaskIds: string[], now: Date): void {
  for (const subtaskId of subtaskIds) {
    const completion = completionFor(completions, subtaskId);
    if (completion && now.getTime() - completion.completedAt.getTime() > DISPUTE_WINDOW_MS) {
      fail('failed-precondition', 'Completions can only be disputed within 72 hours.');
    }
  }
}

/**
 * The subtasks a report disputes (A2): the caller's list, or by default every completed
 * subtask whose completer is not the caller.
 */
export function reportTargets(
  completions: Completion[],
  callerId: string,
  subtaskIds: unknown,
  now: Date,
): string[] {
  let targets: string[];
  if (subtaskIds === undefined) {
    targets = [...new Set(completions.filter((c) => c.memberId !== callerId).map((c) => c.subtaskId))];
  } else {
    const requested = idList(subtaskIds, 'subtaskIds');
    for (const subtaskId of requested) {
      const completion = completionFor(completions, subtaskId);
      if (!completion) fail('failed-precondition', 'That subtask was not completed.');
      if (completion.memberId === callerId) fail('invalid-argument', 'You cannot report your own completion.');
    }
    targets = [...new Set(requested)];
  }
  if (targets.length === 0) {
    fail('failed-precondition', 'There is nothing completed by another member to report.');
  }
  assertWithinDisputeWindow(completions, targets, now);
  return targets;
}

/** What a dispute records about the completions it covers. */
export interface DisputeScope {
  subtaskIds: string[];
  /**
   * Ids of the reported completions (`Completion.id`), a union over every report. Absent on
   * disputes written before the field existed: those are matched by subtask id alone.
   */
  completionIds?: string[];
}

/** The ids of the current completions of `subtaskIds`: what a report records (A2). */
export function completionIdsOf(completions: Completion[], subtaskIds: string[]): string[] {
  return subtaskIds.flatMap((subtaskId) => {
    const completion = completionFor(completions, subtaskId);
    return completion ? [completion.id] : [];
  });
}

/**
 * The disputed subtasks whose standing completion is still one a report named (A2). A subtask
 * the reported member undid and somebody else then completed is a different completion that
 * nobody reported, so a verdict must not touch it. Legacy disputes without `completionIds`
 * cover every disputed subtask.
 */
export function disputedSubtaskIds(dispute: DisputeScope, completions: Completion[]): string[] {
  const reported = dispute.completionIds;
  if (reported === undefined) return [...dispute.subtaskIds];
  return dispute.subtaskIds.filter((subtaskId) => {
    const completion = completionFor(completions, subtaskId);
    return completion !== null && reported.includes(completion.id);
  });
}

/**
 * The subtasks a verdict revokes for a reported dispute (A2): nothing for 'done', the
 * whole disputed set for 'not_done', and a strict subset of it for 'partial'.
 */
export function resolveTargets(
  dispute: { subtaskIds: string[] },
  verdict: Verdict,
  subtaskIds: unknown,
): string[] {
  if (verdict === 'done') return [];
  if (verdict === 'not_done') return [...dispute.subtaskIds];
  if (dispute.subtaskIds.length < 2) {
    fail('invalid-argument', 'A single disputed subtask is either done or not done.');
  }
  const targets = [...new Set(idList(subtaskIds, 'subtaskIds'))];
  if (targets.length === 0) fail('invalid-argument', 'partial needs the subtasks that were not done.');
  if (targets.some((id) => !dispute.subtaskIds.includes(id))) {
    fail('invalid-argument', 'Only disputed subtasks can be revoked.');
  }
  if (targets.length >= dispute.subtaskIds.length) {
    fail('invalid-argument', 'partial must keep at least one disputed subtask done.');
  }
  return targets;
}

/**
 * The subtasks a direct moderation revokes (A2 moderateInstance): every completion for
 * 'not_done', or a strict subset of the completed subtasks for 'partial'.
 */
export function moderateTargets(
  completions: Completion[],
  verdict: 'partial' | 'not_done',
  subtaskIds: unknown,
): string[] {
  const completed = [...new Set(completions.map((c) => c.subtaskId))];
  if (verdict === 'not_done' && subtaskIds === undefined) {
    if (completed.length === 0) fail('failed-precondition', 'This chore has no completions to review.');
    return completed;
  }
  const targets = [...new Set(idList(subtaskIds, 'subtaskIds'))];
  if (targets.length === 0) {
    if (verdict === 'partial') fail('invalid-argument', 'partial needs the subtasks that were not done.');
    fail('failed-precondition', 'This chore has no completions to review.');
  }
  if (targets.some((id) => !completed.includes(id))) {
    fail('invalid-argument', 'Only completed subtasks can be revoked.');
  }
  if (verdict === 'partial' && targets.length >= completed.length) {
    fail('invalid-argument', 'partial must keep at least one completed subtask done.');
  }
  return targets;
}

/**
 * Conflict of interest (A2): an admin cannot judge a completion they made themselves,
 * unless they are the only member with admin rights.
 */
export function assertNoConflict(
  completions: Completion[],
  subtaskIds: string[],
  callerId: string,
  soleAdmin: boolean,
): void {
  if (subtaskIds.some((id) => completionFor(completions, id)?.memberId === callerId) && !soleAdmin) {
    fail('permission-denied', 'You completed part of this chore, so another admin must review it.');
  }
}

/**
 * Who a moderation push goes to: each person once, never the actor, and only people who are
 * still members (a completer or reporter who left or was removed gets nothing).
 */
export function notificationRecipients(memberUids: string[], uids: string[], actorUid: string): string[] {
  const members = new Set(memberUids);
  return [...new Set(uids)].filter((uid) => uid !== actorUid && members.has(uid));
}

/** Creator succession (A1): longest-standing remaining admin, else longest-standing member. */
export function pickAdminSuccessor(members: { uid: string; role: MemberRole; joinedAt: Date }[]): string | null {
  const admins = members.filter((member) => hasAdminRights(member.role));
  return pickSuccessor(admins.length > 0 ? admins : members);
}
