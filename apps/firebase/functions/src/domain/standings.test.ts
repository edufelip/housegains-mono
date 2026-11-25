import { describe, expect, it } from 'vitest';
import {
  afterWeekClosed,
  afterWeekClosedHooks,
  memberWeekStats,
  pickTopMember,
  pickWallOfShame,
  REPLAY_WINDOW_WEEKS,
  replayWindowStart,
  weekBounds,
  weekInstants,
  weekToClose,
  type MemberWeekStats,
  type StandingInstance,
  type StandingRow,
  type WeekClosedContext,
} from './standings';

// Weekly standings pure logic (contract Part B): Monday weeks, the Monday-03:00 close
// rule in the household time zone (DST included), and the top/shame rankings.

const instant = (iso: string) => new Date(iso);
const row = (memberId: string, amount: number, source: string, iso: string): StandingRow => ({
  memberId,
  amount,
  source,
  createdAt: instant(iso),
});
const due = (assigneeIds: string[], status: string, iso: string): StandingInstance => ({
  assigneeIds,
  status,
  dueAt: instant(iso),
});

describe('weekBounds', () => {
  it('gives the Monday-to-Sunday week containing now', () => {
    expect(weekBounds(instant('2026-11-24T12:00:00Z'), 'UTC')).toEqual({
      weekStart: '2026-11-23',
      weekEnd: '2026-11-29',
    });
    // A Sunday belongs to the week that started six days earlier.
    expect(weekBounds(instant('2026-11-29T23:59:59Z'), 'UTC')).toEqual({
      weekStart: '2026-11-23',
      weekEnd: '2026-11-29',
    });
  });

  it('bounds weeks across the DST transitions in Europe/Berlin', () => {
    expect(weekBounds(instant('2025-03-26T12:00:00Z'), 'Europe/Berlin')).toEqual({
      weekStart: '2025-03-24',
      weekEnd: '2025-03-30',
    });
    expect(weekBounds(instant('2025-10-22T12:00:00Z'), 'Europe/Berlin')).toEqual({
      weekStart: '2025-10-20',
      weekEnd: '2025-10-26',
    });
  });

  it('bounds weeks in zones far from UTC', () => {
    expect(weekBounds(instant('2025-09-25T12:00:00Z'), 'Pacific/Auckland')).toEqual({
      weekStart: '2025-09-22',
      weekEnd: '2025-09-28',
    });
    expect(weekBounds(instant('2026-11-20T12:00:00Z'), 'America/Los_Angeles')).toEqual({
      weekStart: '2026-11-16',
      weekEnd: '2026-11-22',
    });
  });
});

describe('weekToClose', () => {
  it('closes the week ending last Sunday only once local time passes Monday 03:00', () => {
    expect(weekToClose(instant('2026-11-23T02:59:00Z'), 'UTC')).toBeNull();
    const closed = weekToClose(instant('2026-11-23T03:00:00Z'), 'UTC');
    expect(closed).toEqual({ weekStart: '2026-11-16', weekEnd: '2026-11-22' });
    // The same week stays the close candidate through Sunday 24:00...
    expect(weekToClose(instant('2026-11-29T23:59:59Z'), 'UTC')).toEqual(closed);
    // ...and rolls over only at the next Monday 03:00.
    expect(weekToClose(instant('2026-11-30T02:59:00Z'), 'UTC')).toBeNull();
    expect(weekToClose(instant('2026-11-30T03:00:00Z'), 'UTC')).toEqual({
      weekStart: '2026-11-23',
      weekEnd: '2026-11-29',
    });
  });

  it('closes at the household offset, not UTC (Los Angeles)', () => {
    expect(weekToClose(instant('2026-11-23T10:59:00Z'), 'America/Los_Angeles')).toBeNull();
    expect(weekToClose(instant('2026-11-23T11:00:00Z'), 'America/Los_Angeles')).toEqual({
      weekStart: '2026-11-16',
      weekEnd: '2026-11-22',
    });
  });

  it('keeps the rule across DST switches (Berlin spring and fall, Auckland spring)', () => {
    // Berlin springs forward on Sunday 2025-03-30; the threshold is Monday 03:00 CEST = 01:00 UTC.
    expect(weekToClose(instant('2025-03-31T00:59:00Z'), 'Europe/Berlin')).toBeNull();
    expect(weekToClose(instant('2025-03-31T01:00:00Z'), 'Europe/Berlin')).toEqual({
      weekStart: '2025-03-24',
      weekEnd: '2025-03-30',
    });
    // Berlin falls back on Sunday 2025-10-26; the threshold is Monday 03:00 CET = 02:00 UTC.
    expect(weekToClose(instant('2025-10-27T01:59:00Z'), 'Europe/Berlin')).toBeNull();
    expect(weekToClose(instant('2025-10-27T02:00:00Z'), 'Europe/Berlin')).toEqual({
      weekStart: '2025-10-20',
      weekEnd: '2025-10-26',
    });
    // Auckland springs forward on Sunday 2025-09-28; Monday 03:00 NZDT is 14:00 UTC on the 28th.
    expect(weekToClose(instant('2025-09-28T13:59:00Z'), 'Pacific/Auckland')).toBeNull();
    expect(weekToClose(instant('2025-09-28T14:00:00Z'), 'Pacific/Auckland')).toEqual({
      weekStart: '2025-09-22',
      weekEnd: '2025-09-28',
    });
  });
});

describe('weekInstants', () => {
  it('spans Monday 00:00 to next Monday 00:00 local, DST-correct', () => {
    // Berlin springs forward inside the March week: a 167-hour week.
    const spring = weekInstants({ weekStart: '2025-03-24', weekEnd: '2025-03-30' }, 'Europe/Berlin');
    expect(spring.weekStart.toISOString()).toBe('2025-03-23T23:00:00.000Z');
    expect(spring.weekEnd.toISOString()).toBe('2025-03-30T22:00:00.000Z');
    expect(spring.weekEnd.getTime() - spring.weekStart.getTime()).toBe(167 * 60 * 60 * 1000);
    // Berlin falls back inside the October week: a 169-hour week.
    const fall = weekInstants({ weekStart: '2025-10-20', weekEnd: '2025-10-26' }, 'Europe/Berlin');
    expect(fall.weekStart.toISOString()).toBe('2025-10-19T22:00:00.000Z');
    expect(fall.weekEnd.toISOString()).toBe('2025-10-26T23:00:00.000Z');
    expect(fall.weekEnd.getTime() - fall.weekStart.getTime()).toBe(169 * 60 * 60 * 1000);
    // Los Angeles runs eight hours behind UTC in November.
    const la = weekInstants({ weekStart: '2026-11-16', weekEnd: '2026-11-22' }, 'America/Los_Angeles');
    expect(la.weekStart.toISOString()).toBe('2026-11-16T08:00:00.000Z');
    expect(la.weekEnd.toISOString()).toBe('2026-11-23T08:00:00.000Z');
  });
});

describe('replayWindowStart', () => {
  it('starts the window REPLAY_WINDOW_WEEKS - 1 weeks before the latest closed week', () => {
    expect(REPLAY_WINDOW_WEEKS).toBe(8);
    expect(replayWindowStart('2026-11-16')).toBe('2026-09-28');
  });
});

describe('memberWeekStats', () => {
  const week = weekInstants({ weekStart: '2026-11-16', weekEnd: '2026-11-22' }, 'UTC');

  it('ignores retired instances: they are neither assigned nor missed', () => {
    const stats = memberWeekStats({
      memberIds: ['a'],
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      rows: [],
      instances: [
        { assigneeIds: ['a'], status: 'open', dueAt: instant('2026-11-18T12:00:00Z'), retired: true },
        { assigneeIds: ['a'], status: 'partial', dueAt: instant('2026-11-19T12:00:00Z') },
      ],
    });
    expect(stats.a).toMatchObject({ assignedDue: 1, missed: 1 });
  });

  it('sums every ledger source signed and nets subtasks against undo and revoke rows', () => {
    const stats = memberWeekStats({
      memberIds: ['a', 'b'],
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      rows: [
        row('a', 10, 'subtask', '2026-11-16T12:00:00Z'),
        row('a', 15, 'bonus', '2026-11-18T12:00:00Z'),
        row('a', -10, 'undo-subtask', '2026-11-19T12:00:00Z'),
        row('b', 5, 'subtask', '2026-11-17T12:00:00Z'),
        row('b', -5, 'revoke-subtask', '2026-11-20T12:00:00Z'),
        row('b', -2, 'undo-bonus', '2026-11-21T12:00:00Z'),
      ],
      instances: [],
    });
    // a: 10 + 15 − 10 = 15 xp; the single credit was undone → 0 net subtasks.
    expect(stats.a).toEqual({
      xp: 15,
      subtasks: 0,
      assignedDue: 0,
      missed: 0,
      lastPositiveAt: instant('2026-11-18T12:00:00Z'),
    });
    // b: 5 − 5 − 2 = −2 xp; the credit was revoked → 0 subtasks, but the +5 row still
    // marks their last positive moment in the week.
    expect(stats.b).toEqual({
      xp: -2,
      subtasks: 0,
      assignedDue: 0,
      missed: 0,
      lastPositiveAt: instant('2026-11-17T12:00:00Z'),
    });
  });

  it('only counts rows created inside the week, across a DST boundary', () => {
    const berlin = weekInstants({ weekStart: '2025-03-24', weekEnd: '2025-03-30' }, 'Europe/Berlin');
    const stats = memberWeekStats({
      memberIds: ['a'],
      weekStart: berlin.weekStart,
      weekEnd: berlin.weekEnd,
      rows: [
        row('a', 10, 'subtask', '2025-03-23T23:00:00Z'), // Monday 00:00 CET — the first instant of the week
        row('a', 10, 'subtask', '2025-03-30T00:30:00Z'), // Sunday 01:30 CET, before the 02:00 gap
        row('a', 10, 'subtask', '2025-03-30T01:30:00Z'), // Sunday 03:30 CEST, after the gap
        row('a', 99, 'subtask', '2025-03-30T22:00:00Z'), // Monday 00:00 CEST — first instant of the NEXT week
        row('a', 99, 'subtask', '2025-03-23T22:59:59Z'), // Sunday 23:59 CET — still the previous week
      ],
      instances: [],
    });
    expect(stats.a).toMatchObject({ xp: 30, subtasks: 3 });
  });

  it('counts instances due in the week for assignees; anything not done is missed', () => {
    const stats = memberWeekStats({
      memberIds: ['a', 'b'],
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      rows: [],
      instances: [
        due(['a'], 'done', '2026-11-16T20:00:00Z'),
        due(['a', 'b'], 'open', '2026-11-18T20:00:00Z'),
        due(['b'], 'partial', '2026-11-19T20:00:00Z'),
        due(['a'], 'open', '2026-11-23T20:00:00Z'), // next week — excluded
        due(['gone'], 'open', '2026-11-20T20:00:00Z'), // former member — not counted
      ],
    });
    expect(stats.a).toEqual({ xp: 0, subtasks: 0, assignedDue: 2, missed: 1, lastPositiveAt: null });
    expect(stats.b).toEqual({ xp: 0, subtasks: 0, assignedDue: 2, missed: 2, lastPositiveAt: null });
    expect(stats.gone).toBeUndefined();
  });

  it('ignores ledger rows by members outside the active list', () => {
    const stats = memberWeekStats({
      memberIds: ['a'],
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      rows: [row('stranger', 50, 'subtask', '2026-11-17T12:00:00Z')],
      instances: [],
    });
    expect(Object.keys(stats)).toEqual(['a']);
    expect(stats.a.xp).toBe(0);
  });
});

describe('pickTopMember', () => {
  const s = (xp: number, subtasks: number, lastPositiveAt: Date | null = null): MemberWeekStats => ({
    xp,
    subtasks,
    assignedDue: 0,
    missed: 0,
    lastPositiveAt,
  });

  it('needs two active members and positive XP', () => {
    expect(pickTopMember({ a: s(50, 5) })).toBeNull(); // alone in the household
    expect(pickTopMember({ a: s(0, 0), b: s(0, 0) })).toBeNull(); // nobody earned anything
    expect(pickTopMember({ a: s(-5, 0), b: s(0, 0) })).toBeNull(); // net negative is never "top"
    expect(pickTopMember({ a: s(1, 1), b: s(0, 0) })).toEqual({ memberId: 'a', xp: 1, subtasks: 1 });
  });

  it('ranks by xp, then subtasks, then the earlier last positive row, then the id', () => {
    expect(pickTopMember({ a: s(10, 1), b: s(20, 0) })!.memberId).toBe('b');
    expect(pickTopMember({ a: s(10, 3), b: s(10, 1) })!.memberId).toBe('a');
    // Both earned 10 xp on one subtask; b's positive row came earlier in the week.
    expect(pickTopMember({ a: s(10, 1, instant('2026-11-18T12:00:00Z')), b: s(10, 1, instant('2026-11-17T12:00:00Z')) })!.memberId).toBe('b');
    // A full tie goes to the ascending member id.
    expect(pickTopMember({ b: s(10, 1, instant('2026-11-18T12:00:00Z')), a: s(10, 1, instant('2026-11-18T12:00:00Z')) })!.memberId).toBe('a');
  });

  it('orders tied ids by code unit, not by locale (uppercase sorts before lowercase)', () => {
    // localeCompare would put 'a' before 'B'; "memberId ascending" is the code-unit order.
    const tie = instant('2026-11-18T12:00:00Z');
    expect(pickTopMember({ a: s(10, 1, tie), B: s(10, 1, tie) })!.memberId).toBe('B');
  });
});

describe('pickWallOfShame', () => {
  const s = (missed: number, assignedDue: number, xp = 0): MemberWeekStats => ({
    xp,
    subtasks: 0,
    assignedDue,
    missed,
    lastPositiveAt: null,
  });

  it('needs two active members and at least one miss; it is not the low-XP member', () => {
    expect(pickWallOfShame({ a: s(1, 2) })).toBeNull();
    expect(pickWallOfShame({ a: s(0, 2), b: s(0, 2) })).toBeNull();
    // b earned the most XP but still missed something — b is on the wall.
    expect(pickWallOfShame({ a: s(0, 2, 0), b: s(1, 2, 100) })).toEqual({ memberId: 'b', missed: 1, assignedDue: 2 });
  });

  it('ranks by missed, then the missed/assignedDue ratio, then lower xp, then the id', () => {
    expect(pickWallOfShame({ a: s(2, 4), b: s(1, 2) })!.memberId).toBe('a'); // more misses wins
    // Both missed 2; a missed every assignment (2/2), b only 2 of 5.
    expect(pickWallOfShame({ a: s(2, 2), b: s(2, 5) })!.memberId).toBe('a');
    // Same misses, same ratio: the lower-XP member is the more shameful.
    expect(pickWallOfShame({ a: s(2, 2, 50), b: s(2, 2, 10) })!.memberId).toBe('b');
    expect(pickWallOfShame({ b: s(2, 2, 10), a: s(2, 2, 10) })!.memberId).toBe('a');
  });

  it('orders tied ids by code unit, not by locale (uppercase sorts before lowercase)', () => {
    expect(pickWallOfShame({ a: s(2, 2, 10), B: s(2, 2, 10) })!.memberId).toBe('B');
  });

  it('lets the same member hold both titles', () => {
    const stats: Record<string, MemberWeekStats> = {
      a: { xp: 50, subtasks: 5, assignedDue: 3, missed: 3, lastPositiveAt: instant('2026-11-16T12:00:00Z') },
      b: { xp: 10, subtasks: 1, assignedDue: 3, missed: 1, lastPositiveAt: instant('2026-11-17T12:00:00Z') },
    };
    expect(pickTopMember(stats)).toEqual({ memberId: 'a', xp: 50, subtasks: 5 });
    expect(pickWallOfShame(stats)).toEqual({ memberId: 'a', missed: 3, assignedDue: 3 });
  });
});

describe('afterWeekClosed (Part C extension point)', () => {
  const context: WeekClosedContext = {
    householdId: 'h1',
    weekStart: '2026-11-16',
    weekEnd: '2026-11-22',
    timeZone: 'UTC',
    closedAt: instant('2026-11-23T03:00:00Z'),
    members: {},
    topMember: null,
    wallOfShame: null,
  };

  it('is a no-op with no hooks registered and calls every registered hook', async () => {
    expect(afterWeekClosedHooks).toHaveLength(0);
    await afterWeekClosed(context);
    const seen: WeekClosedContext[] = [];
    afterWeekClosedHooks.push(async (seenContext) => {
      seen.push(seenContext);
    });
    try {
      await afterWeekClosed(context);
      expect(seen).toEqual([context]);
    } finally {
      afterWeekClosedHooks.pop();
    }
  });
});
