// Weekly streak and away-mode rules (contract C7). Pure.

export const MAX_AWAY_WEEKS_PER_YEAR = 3;
const MAX_AWAY_REQUEST = 12;

/** Member streak milestones (weeks) and their Ganhos reward (C4 earn.streak_milestone). */
const MEMBER_MILESTONES: readonly { weeks: number; reward: number }[] = [
  { weeks: 2, reward: 25 },
  { weeks: 4, reward: 50 },
  { weeks: 8, reward: 100 },
  { weeks: 12, reward: 150 },
  { weeks: 26, reward: 250 },
];

/** A folga is earned every 4 counted weeks (members, C7). */
export const MEMBER_FOLGA_EVERY_WEEKS = 4;
/** A week counts with at least 3 net subtask credits (C7). */
export const WEEK_COUNTS_AT_CREDITS = 3;

export const MEMBER_MILESTONE_WEEKS: readonly number[] = MEMBER_MILESTONES.map(
  ({ weeks }) => weeks,
);

export function milestoneReward(weeks: number): number | null {
  return MEMBER_MILESTONES.find((milestone) => milestone.weeks === weeks)?.reward ?? null;
}

/** The next milestone above `current`, or null past the last one. */
export function nextMilestone(current: number): { weeks: number; reward: number } | null {
  return MEMBER_MILESTONES.find((milestone) => milestone.weeks > current) ?? null;
}

export type StreakStatus = 'active' | 'broken' | 'none';

/** `broken`: no current streak but a record to beat. `none`: never started. */
export function streakStatus(streak: { current: number; record: number }): StreakStatus {
  if (streak.current > 0) return 'active';
  return streak.record > 0 ? 'broken' : 'none';
}

/** YYYY-MM-DD of an instant in an IANA time zone. */
export function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function parseKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const date = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key ? null : date;
}

export function isMondayKey(key: string): boolean {
  return parseKey(key)?.getUTCDay() === 1;
}

function addDays(key: string, days: number): string {
  const date = parseKey(key);
  if (!date) return key;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The next `count` Mondays strictly after `today` (YYYY-MM-DD). */
export function upcomingMondays(today: string, count: number): string[] {
  const start = parseKey(today);
  if (!start) return [];
  const toMonday = (8 - start.getUTCDay()) % 7 || 7;
  const first = addDays(today, toMonday);
  return Array.from({ length: count }, (_, index) => addDays(first, index * 7));
}

export type AwayWeekError =
  | { code: 'notMonday'; weekStart: string }
  | { code: 'notFuture'; weekStart: string }
  | { code: 'yearLimit'; year: string }
  | { code: 'tooMany' };

/**
 * Mirrors the setAwayWeeks callable so errors show before a round trip: every week is a Monday
 * strictly after `today`; the request replaces the future weeks, past weeks stay on record and
 * count toward the limit of 3 per calendar year.
 */
export function validateAwayWeeks(input: {
  selected: readonly string[];
  /** The wallet's stored away weeks (past and future). */
  existing: readonly string[];
  today: string;
}): AwayWeekError[] {
  const errors: AwayWeekError[] = [];
  const requested = [...new Set(input.selected)];
  if (requested.length > MAX_AWAY_REQUEST) errors.push({ code: 'tooMany' });
  for (const weekStart of requested) {
    if (!isMondayKey(weekStart)) errors.push({ code: 'notMonday', weekStart });
    else if (weekStart <= input.today) errors.push({ code: 'notFuture', weekStart });
  }
  const kept = input.existing.filter((week) => week <= input.today);
  const perYear = new Map<string, number>();
  for (const week of new Set([...kept, ...requested])) {
    const year = week.slice(0, 4);
    perYear.set(year, (perYear.get(year) ?? 0) + 1);
  }
  for (const [year, count] of [...perYear].sort()) {
    if (count > MAX_AWAY_WEEKS_PER_YEAR) errors.push({ code: 'yearLimit', year });
  }
  return errors;
}

export interface MessageRef {
  key: string;
  params?: Record<string, string | number>;
}

/** A client-side validation error as a localized message reference. */
export function awayErrorForClient(error: AwayWeekError): MessageRef {
  switch (error.code) {
    case 'notMonday':
      return { key: 'housegains.gamification.away.error.notMonday' };
    case 'notFuture':
      return { key: 'housegains.gamification.away.error.notFuture' };
    case 'tooMany':
      return { key: 'housegains.gamification.away.error.tooMany' };
    case 'yearLimit':
      return {
        key: 'housegains.gamification.away.error.yearLimit',
        params: { max: MAX_AWAY_WEEKS_PER_YEAR, year: error.year },
      };
  }
}

/** A failed setAwayWeeks callable (code without the "functions/" prefix) as a localized message reference. */
export function awayErrorKey(code: string, message: string): MessageRef {
  if (code === 'invalid-argument') {
    if (/too many/i.test(message)) return { key: 'housegains.gamification.away.error.tooMany' };
    if (/monday|yyyy-mm-dd/i.test(message)) {
      return { key: 'housegains.gamification.away.error.notMonday' };
    }
  }
  if (code === 'failed-precondition') {
    if (/at most/i.test(message)) {
      return {
        key: 'housegains.gamification.away.error.yearLimit',
        params: { max: MAX_AWAY_WEEKS_PER_YEAR, year: /\((\d{4})\)/.exec(message)?.[1] ?? '' },
      };
    }
    if (/future/i.test(message)) return { key: 'housegains.gamification.away.error.notFuture' };
    if (/household/i.test(message)) {
      return { key: 'housegains.gamification.away.error.noHousehold' };
    }
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return { key: 'housegains.gamification.away.error.network' };
  }
  return { key: 'housegains.gamification.away.error.generic' };
}
