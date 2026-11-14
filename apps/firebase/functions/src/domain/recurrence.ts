import { DomainError } from './errors';
import { DAY_MS, dateKeyInTimeZone, parseDateKey, weekdayForDateKey } from './time';

// Ported from household-client.ts: parseRecurrence, parseCanonicalRRule, isRecurrenceDueOnDateKey, recurrenceKey.

export type RecurrenceRule =
  | { kind: 'daily' }
  | { kind: 'weekly'; weekdays: number[] }
  | { kind: 'every'; intervalDays: number };

const RRULE_WEEKDAYS = new Map([
  ['SU', 0],
  ['MO', 1],
  ['TU', 2],
  ['WE', 3],
  ['TH', 4],
  ['FR', 5],
  ['SA', 6],
]);

function invalid(message: string): never {
  throw new DomainError('invalid-argument', message);
}

/**
 * Accepts `daily`, `weekly` (weekday of anchorKey), `weekly:1,3,5`, `every:N`,
 * and canonical RRULEs. A bare `weekly` needs `anchorKey`.
 */
export function parseRecurrence(value: string, anchorKey?: string): RecurrenceRule {
  if (value === 'daily') return { kind: 'daily' };
  if (value === 'weekly') {
    if (!anchorKey) invalid('Weekly recurrence needs an anchor date.');
    return { kind: 'weekly', weekdays: [weekdayForDateKey(anchorKey)] };
  }
  if (value.startsWith('weekly:')) {
    const parts = value.slice('weekly:'.length).split(',');
    const weekdays = parts.map((part) => Number(part));
    if (
      parts.some((part) => !/^[0-6]$/.test(part)) ||
      new Set(weekdays).size !== weekdays.length
    ) {
      invalid('Weekly recurrence must list unique weekdays from 0 to 6.');
    }
    return { kind: 'weekly', weekdays };
  }
  const rrule = parseCanonicalRRule(value);
  if (rrule) return rrule;
  const everyMatch = /^every:(\d{1,3})$/.exec(value);
  if (everyMatch) {
    const intervalDays = Number(everyMatch[1]);
    if (intervalDays >= 1 && intervalDays <= 365) return { kind: 'every', intervalDays };
  }
  invalid('Recurrence must be daily, weekly, an RRULE, or every:<1-365>.');
}

function parseCanonicalRRule(value: string): RecurrenceRule | null {
  const normalized = value.replace(/^RRULE:/i, '').toUpperCase();
  if (!normalized.startsWith('FREQ=')) return null;
  const fields = new Map<string, string>();
  for (const field of normalized.split(';')) {
    const separator = field.indexOf('=');
    if (separator <= 0) invalid('Invalid recurrence RRULE.');
    const key = field.slice(0, separator);
    const fieldValue = field.slice(separator + 1);
    if (fields.has(key) || !['FREQ', 'INTERVAL', 'BYDAY'].includes(key) || !fieldValue) {
      invalid('Invalid recurrence RRULE.');
    }
    fields.set(key, fieldValue);
  }

  const frequency = fields.get('FREQ');
  const intervalText = fields.get('INTERVAL');
  const interval = intervalText === undefined ? 1 : Number(intervalText);
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
    invalid('RRULE interval must be from 1 to 365.');
  }
  if (frequency === 'DAILY' && !fields.has('BYDAY')) {
    return interval === 1 ? { kind: 'daily' } : { kind: 'every', intervalDays: interval };
  }
  if (frequency === 'WEEKLY' && interval === 1) {
    const byDay = fields.get('BYDAY');
    if (!byDay) invalid('Weekly RRULE must include BYDAY.');
    const weekdays = byDay.split(',').map((day) => RRULE_WEEKDAYS.get(day));
    if (weekdays.some((day) => day === undefined) || new Set(weekdays).size !== weekdays.length) {
      invalid('Weekly RRULE BYDAY must list unique weekday codes.');
    }
    return { kind: 'weekly', weekdays: weekdays as number[] };
  }
  invalid('RRULE frequency must be DAILY or WEEKLY with BYDAY.');
}

export function isRecurrenceDueOnDateKey(recurrence: string, dateKey: string, anchorKey: string): boolean {
  if (recurrence === 'daily') return true;
  if (recurrence === 'weekly') return weekdayForDateKey(dateKey) === weekdayForDateKey(anchorKey);
  const rule = parseRecurrence(recurrence, anchorKey);
  if (rule.kind === 'daily') return true;
  if (rule.kind === 'weekly') return rule.weekdays.includes(weekdayForDateKey(dateKey));
  const dayDelta = (parseDateKey(dateKey).getTime() - parseDateKey(anchorKey).getTime()) / DAY_MS;
  return dayDelta >= 0 && dayDelta % rule.intervalDays === 0;
}

/** Public wrapper: is the chore due on the wall-clock date of `date` in `timeZone`? */
export function isRecurrenceDueOnDate(recurrence: string, date: Date, anchor: Date, timeZone: string): boolean {
  return isRecurrenceDueOnDateKey(
    recurrence,
    dateKeyInTimeZone(date, timeZone),
    dateKeyInTimeZone(anchor, timeZone),
  );
}

/** Equal keys mean the same schedule, so editing to an equivalent RRULE keeps the anchor. */
export function recurrenceKey(value: string, anchorKey: string): string {
  if (value === 'weekly') return `weekly:${weekdayForDateKey(anchorKey)}`;
  const rule = parseRecurrence(value, anchorKey);
  if (rule.kind === 'weekly') return `weekly:${[...rule.weekdays].sort().join(',')}`;
  // daily, every:1 and FREQ=DAILY are one schedule. The client did not fold `daily` in, so an edit between them reset the anchor.
  if (rule.kind === 'daily' || (rule.kind === 'every' && rule.intervalDays === 1)) return 'daily';
  return JSON.stringify(rule);
}
