import { describe, expect, it } from 'vitest';
import {
  dailyGanhosCapKey,
  escapeRef,
  householdCapKey,
  instanceGanhosCapKey,
  reversalKey,
  ruleCapKey,
  targetCapKey,
  walletKey,
  zeloWeekCapKey,
} from './keys';
import { weekEndKeyForDateKey, weekStartKeyForDateKey } from './weeks';

describe('walletKey', () => {
  it('joins rule, escaped sourceRef and member', () => {
    expect(walletKey('earn.subtask', 'row-1', 'uidA')).toBe('earn.subtask:row-1:uidA');
  });

  it('replaces slashes in the sourceRef with pipes', () => {
    expect(escapeRef('inst-1/finalRow-9')).toBe('inst-1|finalRow-9');
    expect(walletKey('earn.on_time', 'inst-1/finalRow-9', 'uidA')).toBe('earn.on_time:inst-1|finalRow-9:uidA');
  });
});

describe('reversalKey', () => {
  it('prefixes the original key', () => {
    expect(reversalKey('earn.subtask:row-1:uidA')).toBe('rev:earn.subtask:row-1:uidA');
  });
});

describe('cap keys', () => {
  it('matches the shapes documented in the contract', () => {
    expect(dailyGanhosCapKey('2026-11-24')).toBe('day:2026-11-24:ganhos');
    expect(instanceGanhosCapKey('inst-1')).toBe('instance:inst-1:ganhos');
    expect(zeloWeekCapKey('2026-11-23')).toBe('week:2026-11-23:zelo');
    expect(targetCapKey('earn.assist', 'day', '2026-11-24', 'uidB')).toBe('day:2026-11-24:earn.assist:target:uidB');
    expect(ruleCapKey('earn.week_goal', 'week', '2026-11-23')).toBe('week:2026-11-23:earn.week_goal');
    expect(ruleCapKey('earn.welcome', 'life', '')).toBe('life:earn.welcome');
    expect(targetCapKey('zelo.chore_done', 'life', '', 'chore-7')).toBe('life:zelo.chore_done:target:chore-7');
    expect(householdCapKey('zelo.member_activated', 'life', '')).toBe('hh:zelo.member_activated');
    expect(householdCapKey('zelo.setup', 'week', '2026-11-23')).toBe('hh:zelo.setup:2026-11-23');
  });

  it('escapes slashes in instance ids', () => {
    expect(instanceGanhosCapKey('a/b')).toBe('instance:a|b:ganhos');
  });
});

describe('weekStartKeyForDateKey', () => {
  it('returns the Monday of the week', () => {
    expect(weekStartKeyForDateKey('2026-11-23')).toBe('2026-11-23'); // Monday
    expect(weekStartKeyForDateKey('2026-11-24')).toBe('2026-11-23'); // Tuesday
    expect(weekStartKeyForDateKey('2026-11-29')).toBe('2026-11-23'); // Sunday
    expect(weekStartKeyForDateKey('2026-11-30')).toBe('2026-11-30'); // next Monday
    expect(weekStartKeyForDateKey('2026-01-01')).toBe('2025-12-29'); // Thursday wraps to previous year
  });

  it('returns the Sunday of the week for weekEnd', () => {
    expect(weekEndKeyForDateKey('2026-11-26')).toBe('2026-11-29');
  });
});
