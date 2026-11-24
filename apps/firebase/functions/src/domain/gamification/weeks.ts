// Week boundaries reuse the domain time helpers (Part B: Monday..Sunday local).

import { addDaysToDateKey, weekdayForDateKey } from '../time';

/** Monday (YYYY-MM-DD) of the local week containing dateKey. */
export function weekStartKeyForDateKey(dateKey: string): string {
  const offset = (weekdayForDateKey(dateKey) + 6) % 7;
  return addDaysToDateKey(dateKey, -offset);
}

/** Sunday (YYYY-MM-DD) of the local week containing dateKey. */
export function weekEndKeyForDateKey(dateKey: string): string {
  const offset = 6 - ((weekdayForDateKey(dateKey) + 6) % 7);
  return addDaysToDateKey(dateKey, offset);
}

export function monthOfDateKey(dateKey: string): number {
  return Number(dateKey.slice(5, 7));
}

/** Most gap weeks one close replays: past it the streak is broken whatever the folgas, so more changes nothing. */
const MAX_GAP_WEEKS = 52;

/**
 * The Mondays strictly between the last processed week and the one being closed, oldest first
 * (at most the latest `MAX_GAP_WEEKS`). These weeks never reached the engine: the close did not
 * run, or the program was off.
 */
export function gapWeeks(lastProcessedWeek: string, weekStart: string): string[] {
  const weeks: string[] = [];
  let week = addDaysToDateKey(weekStart, -7);
  while (week > lastProcessedWeek && weeks.length < MAX_GAP_WEEKS) {
    weeks.unshift(week);
    week = addDaysToDateKey(week, -7);
  }
  return weeks;
}
