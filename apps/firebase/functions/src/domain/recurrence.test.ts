import { describe, expect, it } from 'vitest';
import { DomainError } from './errors';
import { isRecurrenceDueOnDate, isRecurrenceDueOnDateKey, parseRecurrence, recurrenceKey } from './recurrence';

describe('parseRecurrence (ported from the client)', () => {
  it('parses canonical RRULE daily, interval, and weekly weekdays', () => {
    expect(parseRecurrence('FREQ=DAILY')).toEqual({ kind: 'daily' });
    expect(parseRecurrence('FREQ=DAILY;INTERVAL=12')).toEqual({ kind: 'every', intervalDays: 12 });
    expect(parseRecurrence('FREQ=WEEKLY;BYDAY=MO,WE,FR')).toEqual({ kind: 'weekly', weekdays: [1, 3, 5] });
    expect(parseRecurrence('RRULE:freq=weekly;byday=su')).toEqual({ kind: 'weekly', weekdays: [0] });
  });

  it('rejects duplicate weekdays in the legacy and RRULE forms', () => {
    expect(() => parseRecurrence('weekly:')).toThrow(/unique weekdays/i);
    expect(() => parseRecurrence('weekly:1,')).toThrow(/unique weekdays/i);
    expect(() => parseRecurrence('FREQ=WEEKLY;BYDAY=MO,MO')).toThrow(DomainError);
  });

  it('accepts every:N within 1..365 and rejects everything else', () => {
    expect(parseRecurrence('every:3')).toEqual({ kind: 'every', intervalDays: 3 });
    expect(() => parseRecurrence('every:0')).toThrow(DomainError);
    expect(() => parseRecurrence('every:366')).toThrow(DomainError);
    expect(() => parseRecurrence('monthly')).toThrow(DomainError);
    expect(() => parseRecurrence('FREQ=MONTHLY')).toThrow(DomainError);
  });

  it('resolves a bare weekly from the anchor date weekday', () => {
    // 2026-01-05 is a Monday.
    expect(parseRecurrence('weekly', '2026-01-05')).toEqual({ kind: 'weekly', weekdays: [1] });
    expect(() => parseRecurrence('weekly')).toThrow(DomainError);
  });
});

describe('due dates', () => {
  it('follows interval and weekday rules from the anchor', () => {
    expect(isRecurrenceDueOnDateKey('every:2', '2026-01-07', '2026-01-05')).toBe(true);
    expect(isRecurrenceDueOnDateKey('every:2', '2026-01-06', '2026-01-05')).toBe(false);
    expect(isRecurrenceDueOnDateKey('every:2', '2026-01-03', '2026-01-05')).toBe(false);
    expect(isRecurrenceDueOnDateKey('FREQ=WEEKLY;BYDAY=MO,WE', '2026-01-07', '2026-01-05')).toBe(true);
    expect(isRecurrenceDueOnDateKey('weekly', '2026-01-12', '2026-01-05')).toBe(true);
  });

  it('evaluates the due date in the household time zone', () => {
    // 2026-01-05 01:00Z is 2026-01-04 in Sao Paulo, a Sunday, so a Monday-only chore is not due.
    const instant = new Date('2026-01-05T01:00:00.000Z');
    const anchor = new Date('2026-01-05T15:00:00.000Z');
    expect(isRecurrenceDueOnDate('FREQ=WEEKLY;BYDAY=MO', instant, anchor, 'America/Sao_Paulo')).toBe(false);
    expect(isRecurrenceDueOnDate('FREQ=WEEKLY;BYDAY=MO', instant, anchor, 'UTC')).toBe(true);
  });
});

describe('recurrenceKey', () => {
  it('treats equivalent schedules as equal so an edit keeps the anchor', () => {
    expect(recurrenceKey('every:1', '2026-01-05')).toBe(recurrenceKey('daily', '2026-01-05'));
    expect(recurrenceKey('FREQ=WEEKLY;BYDAY=WE,MO', '2026-01-05')).toBe(
      recurrenceKey('weekly:1,3', '2026-01-05'),
    );
    expect(recurrenceKey('every:2', '2026-01-05')).not.toBe(recurrenceKey('every:3', '2026-01-05'));
  });
});
