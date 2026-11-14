import { DomainError } from './errors';

// Ported from apps/mobile/features/household/household-client.ts (date and time-zone helpers).

export const DAY_MS = 24 * 60 * 60 * 1000;

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function assertTimeZone(value: unknown): string {
  if (!isValidTimeZone(value)) {
    throw new DomainError('invalid-argument', 'timeZone must be a valid IANA time zone.');
  }
  return value;
}

/** YYYY-MM-DD for the given instant, as seen on a wall clock in `timeZone`. */
export function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseDateKey(value).getTime());
}

/** UTC midnight for a YYYY-MM-DD key. Invalid or non-existent dates throw. */
export function parseDateKey(key: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new DomainError('invalid-argument', `Invalid date key ${key}.`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new DomainError('invalid-argument', `Invalid date key ${key}.`);
  }
  return date;
}

export function dateKeyFromUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function addDaysToDateKey(key: string, amount: number): string {
  const date = parseDateKey(key);
  date.setUTCDate(date.getUTCDate() + amount);
  return dateKeyFromUtcDate(date);
}

/** 0 = Sunday ... 6 = Saturday, matching Date#getDay. */
export function weekdayForDateKey(key: string): number {
  return parseDateKey(key).getUTCDay();
}

export function assertDueTime(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new DomainError('invalid-argument', 'Due time must use 24-hour HH:mm format.');
  }
  return value;
}

/**
 * The instant at which a wall-clock time occurs on `date` in `timeZone`.
 * DST gaps shift forward by the gap; folds choose the earlier instant.
 */
export function localDateTimeToInstant(date: string, time: string, timeZone: string): Date {
  assertDueTime(time);
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);

  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const partsAt = (instant: number) =>
    Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));

  const offsets = new Set<number>();
  for (let delta = -36 * 60 * 60_000; delta <= 36 * 60 * 60_000; delta += 12 * 60 * 60_000) {
    const sample = targetAsUtc + delta;
    const parts = partsAt(sample);
    const representedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    offsets.add(representedAsUtc - sample);
  }

  const exactMatches: number[] = [];
  const forwardMatches: { instant: number; minutesAfter: number }[] = [];
  const targetMinute = hour * 60 + minute;
  for (const offset of offsets) {
    const instant = targetAsUtc - offset;
    const parts = partsAt(instant);
    const sameLocalDate =
      Number(parts.year) === year && Number(parts.month) === month && Number(parts.day) === day;
    if (sameLocalDate && Number(parts.hour) === hour && Number(parts.minute) === minute) {
      exactMatches.push(instant);
      continue;
    }
    const localMinute = Number(parts.hour) * 60 + Number(parts.minute);
    if (sameLocalDate && localMinute > targetMinute) {
      forwardMatches.push({ instant, minutesAfter: localMinute - targetMinute });
    }
  }

  if (exactMatches.length > 0) return new Date(Math.min(...exactMatches));
  forwardMatches.sort((a, b) => a.minutesAfter - b.minutesAfter || a.instant - b.instant);
  if (forwardMatches[0]) return new Date(forwardMatches[0].instant);
  throw new DomainError('invalid-argument', 'That local due time does not exist on this date.');
}

/** Locale-formatted HH:mm style time for reminder copy. */
export function formatLocalTime(date: Date, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone }).format(date);
}
