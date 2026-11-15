import type { XpLedgerEntry } from './types';

// Pure recurrence, invite and XP rules shared by the Firebase household client and the screens.

export function isValidInviteCode(code: string): boolean {
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code.trim().toUpperCase());
}

export type RecurrenceRule =
  | { kind: 'daily' }
  | { kind: 'weekly'; weekdays: number[] }
  | { kind: 'every'; intervalDays: number };

export function parseRecurrence(value: string, anchorDate = new Date()): RecurrenceRule {
  if (value === 'daily') return { kind: 'daily' };
  if (value === 'weekly') return { kind: 'weekly', weekdays: [anchorDate.getDay()] };
  if (value.startsWith('weekly:')) {
    const parts = value.slice('weekly:'.length).split(',');
    const weekdays = parts.map((part) => Number(part));
    if (
      parts.some((part) => !/^[0-6]$/.test(part)) ||
      weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
      new Set(weekdays).size !== weekdays.length
    ) {
      throw new Error('Weekly recurrence must list unique weekdays from 0 to 6.');
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
  throw new Error('Recurrence must be daily, weekly, an RRULE, or every:<1-365>.');
}

function parseCanonicalRRule(value: string): RecurrenceRule | null {
  const normalized = value.replace(/^RRULE:/i, '').toUpperCase();
  if (!normalized.startsWith('FREQ=')) return null;
  const fields = new Map<string, string>();
  for (const field of normalized.split(';')) {
    const separator = field.indexOf('=');
    if (separator <= 0) throw new Error('Invalid recurrence RRULE.');
    const key = field.slice(0, separator);
    const fieldValue = field.slice(separator + 1);
    if (fields.has(key) || !['FREQ', 'INTERVAL', 'BYDAY'].includes(key) || !fieldValue) {
      throw new Error('Invalid recurrence RRULE.');
    }
    fields.set(key, fieldValue);
  }

  const frequency = fields.get('FREQ');
  const intervalText = fields.get('INTERVAL');
  const interval = intervalText === undefined ? 1 : Number(intervalText);
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
    throw new Error('RRULE interval must be from 1 to 365.');
  }
  if (frequency === 'DAILY' && !fields.has('BYDAY')) {
    return interval === 1 ? { kind: 'daily' } : { kind: 'every', intervalDays: interval };
  }
  if (frequency === 'WEEKLY' && interval === 1) {
    const byDay = fields.get('BYDAY');
    if (!byDay) throw new Error('Weekly RRULE must include BYDAY.');
    const weekdays = byDay.split(',').map((day) => RRULE_WEEKDAYS.get(day));
    if (weekdays.some((day) => day === undefined) || new Set(weekdays).size !== weekdays.length) {
      throw new Error('Weekly RRULE BYDAY must list unique weekday codes.');
    }
    return { kind: 'weekly', weekdays: weekdays as number[] };
  }
  throw new Error('RRULE frequency must be DAILY or WEEKLY with BYDAY.');
}

const RRULE_WEEKDAYS = new Map([
  ['SU', 0],
  ['MO', 1],
  ['TU', 2],
  ['WE', 3],
  ['TH', 4],
  ['FR', 5],
  ['SA', 6],
]);

export function isRecurrenceDueOnDate(recurrence: string, date: Date, anchorDate: Date): boolean {
  const timeZone = deviceTimeZone();
  return isRecurrenceDueOnDateKey(
    recurrence,
    dateKeyInTimeZone(date, timeZone),
    dateKeyInTimeZone(anchorDate, timeZone),
  );
}

export function calculateBonusAwards(
  bonusXp: number,
  contributorIds: string[],
  finalCompleterId: string,
): Record<string, number> {
  const uniqueContributors = [...new Set(contributorIds)];
  if (bonusXp <= 0 || uniqueContributors.length === 0) return {};
  const baseAward = Math.floor(bonusXp / uniqueContributors.length);
  const awards = Object.fromEntries(uniqueContributors.map((memberId) => [memberId, baseAward]));
  const remainder = bonusXp - baseAward * uniqueContributors.length;
  const recipient = uniqueContributors.includes(finalCompleterId)
    ? finalCompleterId
    : uniqueContributors.at(-1)!;
  awards[recipient] = (awards[recipient] ?? 0) + remainder;
  return awards;
}

export function deriveWeeklyTotals(
  entries: XpLedgerEntry[],
  memberIds: string[],
  now: Date,
  timeZone = deviceTimeZone(),
): Record<string, number> {
  const totals = Object.fromEntries(memberIds.map((memberId) => [memberId, 0]));
  const today = dateKeyInTimeZone(now, timeZone);
  const todayDate = parseDateKey(today);
  const daysSinceMonday = (todayDate.getUTCDay() + 6) % 7;
  const mondayKey = dateKeyFromDateOnly(addDays(todayDate, -daysSinceMonday));
  const start = localDateTimeToInstant(mondayKey, '00:00', timeZone).getTime();
  for (const entry of entries) {
    const createdAt = Date.parse(entry.createdAt);
    if (!Number.isFinite(createdAt) || createdAt < start || createdAt > now.getTime()) continue;
    totals[entry.memberId] = (totals[entry.memberId] ?? 0) + entry.amount;
  }
  return totals;
}

/** Streak is net-positive XP activity days for the member in the household timezone. */
export function deriveMemberStreak(
  entries: XpLedgerEntry[],
  memberId: string,
  now: Date,
  timeZone = deviceTimeZone(),
): number {
  const dailyTotals = new Map<string, number>();
  for (const entry of entries) {
    if (entry.memberId !== memberId) continue;
    const timestamp = Date.parse(entry.createdAt);
    if (!Number.isFinite(timestamp)) continue;
    const dateKey = dateKeyInTimeZone(new Date(timestamp), timeZone);
    dailyTotals.set(dateKey, (dailyTotals.get(dateKey) ?? 0) + entry.amount);
  }

  let dayKey = dateKeyInTimeZone(now, timeZone);
  if ((dailyTotals.get(dayKey) ?? 0) <= 0) dayKey = addDaysToDateKey(dayKey, -1);
  let streak = 0;
  while ((dailyTotals.get(dayKey) ?? 0) > 0) {
    streak += 1;
    dayKey = addDaysToDateKey(dayKey, -1);
  }
  return streak;
}

function isRecurrenceDueOnDateKey(recurrence: string, dateKey: string, anchorKey: string): boolean {
  if (recurrence === 'daily') return true;
  if (recurrence === 'weekly') return weekdayForDateKey(dateKey) === weekdayForDateKey(anchorKey);
  if (recurrence.startsWith('weekly:')) {
    const rule = parseRecurrence(recurrence);
    return rule.kind === 'weekly' && rule.weekdays.includes(weekdayForDateKey(dateKey));
  }
  const rule = parseRecurrence(recurrence);
  if (rule.kind === 'daily') return true;
  if (rule.kind === 'weekly') return rule.weekdays.includes(weekdayForDateKey(dateKey));
  const dayDelta = (parseDateKey(dateKey).getTime() - parseDateKey(anchorKey).getTime()) / DAY_MS;
  return dayDelta >= 0 && dayDelta % rule.intervalDays === 0;
}

function localDateTimeToInstant(date: string, time: string, timeZone: string): Date {
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error('invalid_due_time');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if (hour > 23 || minute > 59) throw new Error('invalid_due_time');

  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: normalizeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const partsAt = (instant: number) =>
    Object.fromEntries(
      formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
    );
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
    const exact =
      Number(parts.year) === year &&
      Number(parts.month) === month &&
      Number(parts.day) === day &&
      Number(parts.hour) === hour &&
      Number(parts.minute) === minute;
    if (exact) {
      exactMatches.push(instant);
      continue;
    }
    const sameLocalDate =
      Number(parts.year) === year && Number(parts.month) === month && Number(parts.day) === day;
    const localMinute = Number(parts.hour) * 60 + Number(parts.minute);
    if (sameLocalDate && localMinute > targetMinute) {
      forwardMatches.push({ instant, minutesAfter: localMinute - targetMinute });
    }
  }

  if (exactMatches.length > 0) return new Date(Math.min(...exactMatches));
  // For a spring-forward gap, shift by the gap duration (02:30 -> 03:30). A fold
  // has exact matches above and chooses the earlier instant.
  forwardMatches.sort(
    (left, right) => left.minutesAfter - right.minutesAfter || left.instant - right.instant,
  );
  if (forwardMatches[0]) return new Date(forwardMatches[0].instant);
  throw new Error('nonexistent_local_due_time');
}

export function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function deviceTimeZone(): string {
  return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

function normalizeTimeZone(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
      return value;
    } catch {
      // Use the device zone when an old or malformed local record has no valid IANA zone.
    }
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function weekdayForDateKey(key: string): number {
  return parseDateKey(key).getUTCDay();
}

function addDaysToDateKey(key: string, amount: number): string {
  return dateKeyFromDateOnly(addDays(parseDateKey(key), amount));
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function dateKeyFromDateOnly(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function parseDateKey(key: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return new Date(Date.UTC(1970, 0, 1));
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

const DAY_MS = 24 * 60 * 60 * 1000;
