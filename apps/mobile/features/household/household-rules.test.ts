import assert from 'node:assert/strict';
import test from 'node:test';
import { CATALOG } from './catalog';
import {
  deriveMemberStreak,
  deriveWeeklyTotals,
  isValidInviteCode,
  parseRecurrence,
} from './household-rules';
import type { XpLedgerEntry } from './types';

function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      assert.equal(actual, expected);
    },
    toEqual(expected: unknown) {
      assert.deepEqual(actual, expected);
    },
    toBeDefined() {
      assert.notEqual(actual, undefined);
    },
    toMatch(pattern: RegExp) {
      assert.match(String(actual), pattern);
    },
    toHaveLength(length: number) {
      assert.equal((actual as { length: number }).length, length);
    },
    not: {
      toBe(expected: unknown) {
        assert.notEqual(actual, expected);
      },
    },
    rejects: {
      toThrow(pattern: RegExp) {
        return assert.rejects(actual as Promise<unknown>, pattern);
      },
    },
  };
}

void test('XP week starts on Monday and streak counts net-positive member days', () => {
  const entries = [
    {
      id: 'sunday',
      instanceId: 'sunday-instance',
      memberId: 'member-1',
      amount: 10,
      source: 'subtask' as const,
      createdAt: new Date(2026, 0, 4, 23, 59).toISOString(),
    },
    {
      id: 'monday',
      instanceId: 'monday-instance',
      memberId: 'member-1',
      amount: 7,
      source: 'subtask' as const,
      createdAt: new Date(2026, 0, 5, 0, 0).toISOString(),
    },
  ];
  const mondayAtMidnight = new Date(2026, 0, 5, 0, 0);

  expect(deriveWeeklyTotals(entries, ['member-1'], mondayAtMidnight)).toEqual({ 'member-1': 7 });
  expect(deriveMemberStreak(entries, 'member-1', mondayAtMidnight)).toBe(2);
});

void test('moderation revoke rows reverse weekly totals and streak days exactly like undo rows', () => {
  const entries: XpLedgerEntry[] = [
    {
      id: 'monday-credit',
      instanceId: 'monday-instance',
      memberId: 'member-1',
      amount: 10,
      source: 'subtask',
      createdAt: new Date(2026, 0, 5, 10, 0).toISOString(),
    },
    {
      id: 'monday-revoke',
      instanceId: 'monday-instance',
      subtaskId: 'wash',
      memberId: 'member-1',
      amount: -10,
      source: 'revoke-subtask',
      createdAt: new Date(2026, 0, 5, 11, 0).toISOString(),
    },
    {
      id: 'tuesday-credit',
      instanceId: 'tuesday-instance',
      memberId: 'member-1',
      amount: 8,
      source: 'subtask',
      createdAt: new Date(2026, 0, 6, 10, 0).toISOString(),
    },
    {
      id: 'tuesday-revoke',
      instanceId: 'tuesday-instance',
      memberId: 'member-1',
      amount: -3,
      source: 'revoke-bonus',
      createdAt: new Date(2026, 0, 6, 11, 0).toISOString(),
    },
  ];
  const wednesday = new Date(2026, 0, 7, 12, 0);

  // Monday nets 0, Tuesday nets 5: the revoke rows cancel exactly like undo rows.
  expect(deriveWeeklyTotals(entries, ['member-1'], wednesday)).toEqual({ 'member-1': 5 });
  expect(deriveMemberStreak(entries, 'member-1', wednesday)).toBe(1);
});

void test('recurrence parses canonical RRULE daily intervals and weekly weekdays', () => {
  expect(parseRecurrence('FREQ=DAILY')).toEqual({ kind: 'daily' });
  expect(parseRecurrence('FREQ=DAILY;INTERVAL=12')).toEqual({ kind: 'every', intervalDays: 12 });
  expect(parseRecurrence('FREQ=WEEKLY;BYDAY=MO,WE,FR')).toEqual({
    kind: 'weekly',
    weekdays: [1, 3, 5],
  });
  assert.throws(() => parseRecurrence('weekly:'), /unique weekdays/i);
  assert.throws(() => parseRecurrence('weekly:1,'), /unique weekdays/i);
});

void test('HouseGains catalog matches the latest chore totals and recurrence rules', () => {
  const chore = (id: string) => CATALOG.find((entry) => entry.id === id)!;
  const total = (id: string) =>
    chore(id).subtasks.reduce((sum, subtask) => sum + subtask.xp, 0) + chore(id).bonusXp;

  expect(total('catalog-kitchen-blitz')).toBe(45);
  expect(chore('catalog-kitchen-blitz').subtasks.map((subtask) => subtask.xp)).toEqual([
    20, 10, 10,
  ]);
  expect(total('catalog-dog-care')).toBe(60);
  expect(chore('catalog-dog-care').bonusXp).toBe(15);
  expect(total('catalog-bathroom-sanitization')).toBe(70);
  expect(chore('catalog-bathroom-sanitization').subtasks).toHaveLength(4);
  expect(total('catalog-living-room-reset')).toBe(30);
  expect(chore('catalog-living-room-reset').recurrence).toBe('FREQ=DAILY');
  expect(total('catalog-laundry-cycle')).toBe(35);
  expect(chore('catalog-laundry-cycle').recurrence).toBe('FREQ=WEEKLY;BYDAY=TU,FR');
  expect(total('catalog-trash-recycling')).toBe(15);
  expect(chore('catalog-trash-recycling').subtasks).toHaveLength(1);
});

void test('invite codes use the unambiguous six-character alphabet', () => {
  expect(isValidInviteCode('HG7K2P')).toBe(true);
  expect(isValidInviteCode('hg7k2p')).toBe(true);
  expect(isValidInviteCode('HG0O1I')).toBe(false);
  expect(isValidInviteCode('HG7K2')).toBe(false);
});
