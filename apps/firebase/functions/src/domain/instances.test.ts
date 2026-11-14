import { describe, expect, it } from 'vitest';
import {
  generateChoreInstances,
  instanceIdFor,
  isEditableFuture,
  refreshedFields,
  type ChoreRecord,
  type InstanceRecord,
} from './instances';

const base: ChoreRecord = {
  id: 'dishes',
  name: 'Kitchen reset',
  icon: 'sparkle',
  category: 'kitchen',
  subtasks: [
    { id: 'wash', name: 'Wash', xp: 10, position: 0 },
    { id: 'wipe', name: 'Wipe', xp: 15, position: 1 },
  ],
  bonusXp: 5,
  assigneeIds: ['A'],
  recurrence: 'daily',
  dueTime: '08:00',
  isActive: true,
  recurrenceAnchor: '2026-01-05',
  generatedThrough: '2026-01-04',
};

describe('generateChoreInstances', () => {
  it('fills from the anchor up to today plus the 14-day horizon, in the household zone', () => {
    // now = 2026-01-05 12:00 UTC, zone UTC, so today is 2026-01-05 and the horizon ends 2026-01-19.
    const result = generateChoreInstances(base, new Date('2026-01-05T12:00:00.000Z'), 'UTC');
    const ids = result.instances.map((i) => i.id);
    expect(ids[0]).toBe(instanceIdFor('dishes', '2026-01-05'));
    expect(ids.at(-1)).toBe('dishes_2026-01-19');
    expect(ids).toHaveLength(15);
    expect(result.generatedThrough).toBe('2026-01-19');
  });

  it('marks a past-due candidate partial and a future one open', () => {
    // Due 08:00 on the 5th. At 12:00 that one is past due.
    const result = generateChoreInstances(base, new Date('2026-01-05T12:00:00.000Z'), 'UTC');
    expect(result.instances[0].status).toBe('partial');
    expect(result.instances[1].status).toBe('open');
  });

  it('generates nothing for a paused chore and keeps its generatedThrough', () => {
    const result = generateChoreInstances({ ...base, isActive: false }, new Date('2026-01-05T12:00:00.000Z'), 'UTC');
    expect(result.instances).toEqual([]);
    expect(result.generatedThrough).toBe('2026-01-04');
  });

  it('caps catch-up at 365 days back from today', () => {
    const stale = { ...base, recurrenceAnchor: '2020-01-01', generatedThrough: '2020-01-01' };
    const result = generateChoreInstances(stale, new Date('2026-01-05T12:00:00.000Z'), 'UTC');
    const first = result.instances[0].id;
    expect(first.endsWith('_2025-01-05')).toBe(true);
  });

  it('places the due instant in the household zone (not UTC)', () => {
    const chore = { ...base, recurrence: 'daily', dueTime: '23:59' };
    const result = generateChoreInstances(chore, new Date('2026-01-05T12:00:00.000Z'), 'America/Sao_Paulo');
    const first = result.instances.find((i) => i.id.endsWith('_2026-01-05'))!;
    // 23:59 at UTC-3 is 02:59Z the next day.
    expect(first.dueAt.toISOString()).toBe('2026-01-06T02:59:00.000Z');
  });
});

describe('editable future instances', () => {
  const future: InstanceRecord = {
    id: 'dishes_2026-01-09',
    choreId: 'dishes',
    dueAt: new Date('2026-01-09T08:00:00.000Z'),
    subtasks: base.subtasks,
    bonusXp: 5,
    assigneeIds: ['A'],
    status: 'open',
    completions: [],
    bonusAwards: {},
    choreSnapshot: { name: 'Kitchen reset', icon: 'sparkle', category: 'kitchen', recurrence: 'daily', dueTime: '08:00' },
  };
  const now = new Date('2026-01-05T12:00:00.000Z');

  it('only untouched, open, future instances are editable', () => {
    expect(isEditableFuture(future, now)).toBe(true);
    expect(isEditableFuture({ ...future, completions: [{} as never] }, now)).toBe(false);
    expect(isEditableFuture({ ...future, status: 'partial' }, now)).toBe(false);
    expect(isEditableFuture(future, new Date('2026-01-10T00:00:00.000Z'))).toBe(false);
  });

  it('moves the due time to the new local due time on the same date', () => {
    const fields = refreshedFields(future, { ...base, dueTime: '18:00' }, 'UTC');
    expect(fields.dueAt.toISOString()).toBe('2026-01-09T18:00:00.000Z');
    expect(fields.assigneeIds).toEqual(['A']);
  });
});
