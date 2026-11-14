import { describe, expect, it } from 'vitest';
import { DomainError } from './errors';
import {
  addDaysToDateKey,
  dateKeyInTimeZone,
  localDateTimeToInstant,
  parseDateKey,
  weekdayForDateKey,
} from './time';

describe('time helpers', () => {
  it('resolves a DST gap to the next valid wall-clock offset (ported client test)', () => {
    // 02:30 does not exist on 2026-03-08 in New York; it becomes 03:30 EDT = 07:30Z.
    expect(localDateTimeToInstant('2026-03-08', '02:30', 'America/New_York').toISOString()).toBe(
      '2026-03-08T07:30:00.000Z',
    );
  });

  it('keeps the earlier instant for a repeated fall-back wall time', () => {
    // 01:30 on 2026-11-01 happens twice in New York; the earlier (EDT) instant wins.
    expect(localDateTimeToInstant('2026-11-01', '01:30', 'America/New_York').toISOString()).toBe(
      '2026-11-01T05:30:00.000Z',
    );
  });

  it('computes the date key in the household zone, not UTC', () => {
    // 2026-01-05 01:00Z is 2026-01-04 22:00 in Sao Paulo (UTC-3).
    const instant = new Date('2026-01-05T01:00:00.000Z');
    expect(dateKeyInTimeZone(instant, 'America/Sao_Paulo')).toBe('2026-01-04');
    expect(dateKeyInTimeZone(instant, 'UTC')).toBe('2026-01-05');
  });

  it('adds days across month and year boundaries and reports weekdays', () => {
    expect(addDaysToDateKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDateKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekdayForDateKey('2026-01-05')).toBe(1); // Monday
  });

  it('rejects impossible date keys and due times', () => {
    expect(() => parseDateKey('2026-02-30')).toThrow(DomainError);
    expect(() => localDateTimeToInstant('2026-01-05', '24:00', 'UTC')).toThrow(DomainError);
  });
});
