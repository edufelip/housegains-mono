import type { Completion, Dispute, HouseholdRole, Instance, Member } from './types';

// Pure moderation rules mirroring apps/firebase/functions/src/domain/moderation.ts
// (contract Part A). No Firebase imports, so this runs under bun test.

/** Contract A2: completions can be disputed for 72 hours. */
export const REVIEW_WINDOW_MS = 72 * 60 * 60 * 1000;

/** Contract A1: admin rights are the creator role plus the admin role. */
export function hasAdminRights(role: HouseholdRole): boolean {
  return role === 'creator' || role === 'admin';
}

/** True while the completion is younger than the 72-hour window. */
export function isWithinReviewWindow(completion: Completion, now: number): boolean {
  const completedAt = Date.parse(completion.completedAt);
  return Number.isFinite(completedAt) && now - completedAt <= REVIEW_WINDOW_MS;
}

/**
 * The completed subtasks a member report may cover (A2): completed by someone else
 * and still inside the 72-hour window.
 */
export function reportableSubtasks(instance: Instance, callerId: string, now: number): string[] {
  return [
    ...new Set(
      instance.completions
        .filter(
          (completion) => completion.memberId !== callerId && isWithinReviewWindow(completion, now),
        )
        .map((completion) => completion.subtaskId),
    ),
  ];
}

/**
 * Whether the member can send a report for this instance: members only (admins mark
 * completions directly), no resolved or expired dispute, no earlier report by the
 * caller, and at least one reportable completion.
 */
export function canReportCompletion(
  member: Pick<Member, 'id' | 'role'>,
  instance: Instance,
  openDispute: Dispute | undefined,
  now: number,
): boolean {
  if (hasAdminRights(member.role)) return false;
  if (instance.disputeStatus === 'resolved' || instance.disputeStatus === 'expired') return false;
  if (openDispute?.reports.some((report) => report.uid === member.id)) return false;
  return reportableSubtasks(instance, member.id, now).length > 0;
}

/** The completed subtasks an admin verdict can still revoke: inside the 72-hour window. */
export function moderatableSubtasks(instance: Instance, now: number): string[] {
  return [
    ...new Set(
      instance.completions
        .filter((completion) => isWithinReviewWindow(completion, now))
        .map((completion) => completion.subtaskId),
    ),
  ];
}

/** Whether the admin may open the moderation actions on this instance at all. */
export function canModerateInstance(
  member: Pick<Member, 'id' | 'role'>,
  instance: Instance,
  now: number,
): boolean {
  return hasAdminRights(member.role) && moderatableSubtasks(instance, now).length > 0;
}

/** Contract A2: the caller is the only member with admin rights. */
export function soleAdminOf(members: readonly Member[]): boolean {
  return members.filter((member) => hasAdminRights(member.role)).length === 1;
}

/**
 * Conflict of interest (A2): the caller completed one of the target subtasks and is
 * not the only member with admin rights, so another admin must review.
 */
export function hasModerationConflict(
  instance: Instance,
  subtaskIds: readonly string[],
  callerId: string,
  members: readonly Member[],
): boolean {
  const conflicted = subtaskIds.some((subtaskId) =>
    instance.completions.some(
      (completion) => completion.subtaskId === subtaskId && completion.memberId === callerId,
    ),
  );
  return conflicted && !soleAdminOf(members);
}

/**
 * The subtasks the caller may pick for a verdict (A2): the server only checks the targets, so
 * the caller's own completions are not selectable unless they are the only member with admin
 * rights, while everyone else's completions stay selectable.
 */
export function selectableForModeration(
  instance: Instance,
  subtaskIds: readonly string[],
  callerId: string,
  members: readonly Member[],
): string[] {
  return subtaskIds.filter(
    (subtaskId) => !hasModerationConflict(instance, [subtaskId], callerId, members),
  );
}

/**
 * Whether a partial verdict can be given from `selectable` out of the `moderatable` steps: it
 * needs a selectable step, and either a step the caller cannot pick stays done anyway (A2: a
 * partial must keep one completed subtask done) or at least two steps to split.
 */
export function partialModerationAvailable(
  selectable: readonly string[],
  moderatable: readonly string[],
): boolean {
  return (
    selectable.length > 0 &&
    (selectable.length < moderatable.length || partialAvailable(selectable.length))
  );
}

/** A partial verdict needs at least two disputed (or completed) subtasks (A2). */
export function partialAvailable(subtaskCount: number): boolean {
  return subtaskCount >= 2;
}

/** A partial selection is a non-empty, strict subset of the pool. */
export function isPartialSelection(selected: readonly string[], pool: readonly string[]): boolean {
  return (
    selected.length > 0 &&
    selected.length < pool.length &&
    selected.every((subtaskId) => pool.includes(subtaskId))
  );
}
