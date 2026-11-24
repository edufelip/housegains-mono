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
