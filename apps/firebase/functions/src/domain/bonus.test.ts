import { describe, expect, it } from 'vitest';
import { calculateBonusAwards, isDue, undoInstanceStatus, UNDO_WINDOW_MS } from './bonus';

describe('calculateBonusAwards (ported from the client)', () => {
  it('splits the bonus and gives the remainder to the final completer', () => {
    // Bonus 5 across A and B. Base 2 each, remainder 1 to B, who finished.
    expect(calculateBonusAwards(5, ['A', 'B'], 'B')).toEqual({ A: 2, B: 3 });
  });

  it('gives the remainder to the last contributor when the finisher did not contribute', () => {
    expect(calculateBonusAwards(5, ['A', 'B'], 'C')).toEqual({ A: 2, B: 3 });
  });

  it('dedupes contributors and returns nothing for zero bonus or no contributors', () => {
    expect(calculateBonusAwards(4, ['A', 'A'], 'A')).toEqual({ A: 4 });
    expect(calculateBonusAwards(0, ['A'], 'A')).toEqual({});
    expect(calculateBonusAwards(10, [], 'A')).toEqual({});
  });
});

describe('deadline and undo', () => {
  it('treats an instant at or after the due time as due', () => {
    const due = new Date('2026-01-05T08:00:00.000Z');
    expect(isDue(due, new Date('2026-01-05T07:59:59.000Z'))).toBe(false);
    expect(isDue(due, due)).toBe(true);
  });

  it('keeps an overdue or partly done instance partial after undo', () => {
    const due = new Date('2026-01-05T08:00:00.000Z');
    expect(undoInstanceStatus({ dueAt: due, now: new Date('2026-01-05T07:00:00.000Z'), remainingCompletions: 0 })).toBe('open');
    expect(undoInstanceStatus({ dueAt: due, now: new Date('2026-01-05T07:00:00.000Z'), remainingCompletions: 1 })).toBe('partial');
    expect(undoInstanceStatus({ dueAt: due, now: new Date('2026-01-05T09:00:00.000Z'), remainingCompletions: 0 })).toBe('partial');
  });

  it('uses a five minute undo window', () => {
    expect(UNDO_WINDOW_MS).toBe(5 * 60 * 1000);
  });
});
