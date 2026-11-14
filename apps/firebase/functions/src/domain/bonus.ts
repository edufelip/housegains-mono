// Ported from household-client.ts (calculateBonusAwards) and the removed server's
// getUndoInstanceState (status after an undo also counts remaining completions).

export const UNDO_WINDOW_MS = 5 * 60 * 1000;

/**
 * Splits an instance's bonus between its contributors. The remainder goes to the
 * final completer when they contributed, otherwise to the last contributor.
 */
export function calculateBonusAwards(
  bonusXp: number,
  contributorIds: string[],
  finalCompleterId: string,
): Record<string, number> {
  const uniqueContributors = [...new Set(contributorIds)];
  if (bonusXp <= 0 || uniqueContributors.length === 0) return {};
  const baseAward = Math.floor(bonusXp / uniqueContributors.length);
  const awards: Record<string, number> = Object.fromEntries(
    uniqueContributors.map((memberId) => [memberId, baseAward]),
  );
  const remainder = bonusXp - baseAward * uniqueContributors.length;
  const recipient = uniqueContributors.includes(finalCompleterId)
    ? finalCompleterId
    : uniqueContributors[uniqueContributors.length - 1];
  awards[recipient] = (awards[recipient] ?? 0) + remainder;
  return awards;
}

export function isDue(dueAt: Date, now: Date): boolean {
  return dueAt.getTime() <= now.getTime();
}

export function undoInstanceStatus(input: {
  dueAt: Date;
  now: Date;
  remainingCompletions: number;
}): 'open' | 'partial' {
  return isDue(input.dueAt, input.now) || input.remainingCompletions > 0 ? 'partial' : 'open';
}
