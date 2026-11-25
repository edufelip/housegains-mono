import assert from 'node:assert/strict';
import test from 'node:test';
import { CATALOG } from '@/features/household/catalog';
import {
  choreDisplayName,
  subtaskDisplayName,
  resolveInstanceChore,
  deriveWeeklyGoal,
  deriveDashboardSummary,
  deriveInstanceProgress,
  deriveProgression,
  deriveScoreSnapshot,
  deriveTotalXp,
  totalXpForMember,
  filterInstancesForHouseholdDate,
  makeChoreCopy,
  orderTodayInstances,
} from './screen-model';

const instance = (id: string, assigneeIds: string[]) => ({
  id,
  assigneeIds,
  dueAt: '2026-11-13T21:00:00.000Z',
});

test('orders personally assigned, shared, and unassigned work stably', () => {
  const result = orderTodayInstances(
    [
      instance('unassigned-1', []),
      instance('shared-1', ['me', 'roommate']),
      instance('mine-1', ['me']),
      instance('unassigned-2', []),
      instance('shared-2', ['roommate', 'me']),
      instance('mine-2', ['me']),
    ],
    'me',
  );

  assert.deepEqual(
    result.map(({ id }) => id),
    ['mine-1', 'mine-2', 'shared-1', 'shared-2', 'unassigned-1', 'unassigned-2'],
  );
});

test('does not mutate the household provider list', () => {
  const source = [instance('unassigned', []), instance('mine', ['me'])];

  orderTodayInstances(source, 'me');

  assert.deepEqual(
    source.map(({ id }) => id),
    ['unassigned', 'mine'],
  );
});

test('derives rank and points needed to pass the leading member', () => {
  const snapshot = deriveScoreSnapshot(
    [
      { id: 'rafa', name: 'Rafa' },
      { id: 'me', name: 'Me' },
      { id: 'bia', name: 'Bia' },
    ],
    { rafa: 365, me: 320, bia: 290 },
    'me',
  );

  assert.deepEqual(snapshot, {
    points: 320,
    rank: 2,
    leader: { id: 'rafa', name: 'Rafa', points: 365 },
    pointsToOvertake: 46,
  });
});

test('does not describe the current member as behind when they lead or tie', () => {
  const members = [
    { id: 'me', name: 'Me' },
    { id: 'other', name: 'Other' },
  ];
  const leading = deriveScoreSnapshot(members, { me: 120, other: 100 }, 'me');
  const tied = deriveScoreSnapshot(members, { me: 100, other: 100 }, 'me');

  assert.equal(leading.rank, 1);
  assert.equal(leading.pointsToOvertake, 0);
  assert.equal(tied.rank, 1);
  assert.equal(tied.pointsToOvertake, 1);
});

test('derives remaining XP from unique completed subtasks', () => {
  const progress = deriveInstanceProgress({
    subtasks: [
      { id: 'feed', xp: 10 },
      { id: 'walk', xp: 20 },
      { id: 'wash', xp: 15 },
    ],
    completions: [{ subtaskId: 'feed' }, { subtaskId: 'feed' }],
  });

  assert.deepEqual(progress, {
    completedCount: 1,
    totalCount: 3,
    completedSubtaskIds: new Set(['feed']),
    remainingXp: 35,
  });
});

test('combines ordered chores, earned XP and outstanding work for the dashboard', () => {
  const summary = deriveDashboardSummary(
    [
      {
        id: 'open',
        assigneeIds: [],
        dueAt: '2999-11-13T21:00:00.000Z',
        subtasks: [{ id: 'wipe', xp: 5 }],
        bonusXp: 0,
        status: 'open' as const,
        completions: [],
        bonusAwards: {},
      },
      {
        id: 'mine',
        assigneeIds: ['me'],
        dueAt: '2999-11-13T21:00:00.000Z',
        subtasks: [
          { id: 'dishes', xp: 20 },
          { id: 'counter', xp: 10 },
        ],
        bonusXp: 0,
        status: 'partial' as const,
        completions: [{ subtaskId: 'dishes', memberId: 'me', xp: 20 }],
        bonusAwards: { me: 5 },
      },
    ],
    [
      { id: 'me', name: 'Me' },
      { id: 'roommate', name: 'Roommate' },
    ],
    { me: 95, roommate: 110 },
    'me',
  );

  assert.deepEqual(
    summary.orderedInstances.map(({ id }) => id),
    ['mine', 'open'],
  );
  assert.equal(summary.pointsToday, 25);
  assert.equal(summary.completedSubtasks, 1);
  assert.equal(summary.totalSubtasks, 3);
  assert.equal(summary.remainingXp, 15);
  assert.equal(summary.weeklyPoints, 95);
  assert.equal(summary.rank, 2);
});

test('includes an unpaid completion bonus in remaining XP before the due time', () => {
  const summary = deriveDashboardSummary(
    [
      {
        id: 'kitchen',
        assigneeIds: [],
        dueAt: '2999-11-13T21:00:00.000Z',
        subtasks: [
          { id: 'dish', xp: 45 },
          { id: 'wipe', xp: 20 },
        ],
        bonusXp: 20,
        status: 'open',
        completions: [],
        bonusAwards: {},
      },
    ],
    [{ id: 'me', name: 'Me' }],
    { me: 0 },
    'me',
    new Date('2026-11-13T12:00:00.000Z'),
  );

  assert.equal(summary.remainingXp, 85);
});

test('filters due instances by the household timezone calendar date', () => {
  const today = { id: 'late-local-today', dueAt: '2026-11-14T02:00:00.000Z' };
  const tomorrow = { id: 'local-tomorrow', dueAt: '2026-11-14T04:30:00.000Z' };
  const result = filterInstancesForHouseholdDate(
    [tomorrow, today],
    new Date('2026-11-14T02:30:00.000Z'),
    'America/Sao_Paulo',
  );

  assert.deepEqual(
    result.map(({ id }) => id),
    ['late-local-today'],
  );
});

test('derives level and title from all-time net XP, not weekly points', () => {
  const totalXp = deriveTotalXp(
    [
      { memberId: 'me', amount: 280 },
      { memberId: 'other', amount: 500 },
      { memberId: 'me', amount: 170 },
      { memberId: 'me', amount: -60 },
    ],
    'me',
  );

  assert.equal(totalXp, 390);
  // Members without levelFloor/xpPeak keep the old-curve level (floor(xp/100)+1): nobody drops.
  assert.deepEqual(deriveProgression(totalXp), {
    level: 4,
    titleKey: 'helper',
    xpIntoLevel: 90,
  });
  assert.deepEqual(deriveProgression(400), {
    level: 5,
    titleKey: 'tidyTitan',
    xpIntoLevel: 0,
  });
});

test('shows the new level curve once levelFloor exists, and never drops below xpPeak', () => {
  // 1840 XP without levelFloor: old level 19 stays. With levelFloor 1 the new curve gives level 6.
  assert.equal(deriveProgression(1840).level, 19);
  assert.equal(deriveProgression(1840).titleKey, 'houseGuardian');
  assert.deepEqual(deriveProgression(1840, { levelFloor: 1 }), {
    level: 6,
    titleKey: 'tidyTitan',
    xpIntoLevel: 340,
  });
  // xpPeak keeps the level after an undo lowered the current XP.
  assert.equal(deriveProgression(1200, { levelFloor: 1, xpPeak: 1840 }).level, 6);
  assert.equal(deriveProgression(0, { levelFloor: 1, xpPeak: 0 }).level, 1);
});

test('uses persisted lifetime XP and falls back to the bounded ledger for legacy members', () => {
  const ledger = [{ memberId: 'me', amount: 70 }];
  assert.equal(totalXpForMember({ xp: 620 }, ledger, 'me'), 620);
  assert.equal(totalXpForMember({}, ledger, 'me'), 70);
});

test('copies catalog chore rules into a new definition with independent subtask ids', () => {
  const source = {
    id: 'catalog-kitchen-blitz',
    name: 'Kitchen blitz',
    icon: '🍽️',
    category: 'kitchen',
    subtasks: [{ id: 'wash-dishes', name: 'Wash dishes', xp: 20, position: 0 }],
    bonusXp: 5,
    assigneeIds: ['someone'],
    recurrence: 'daily',
    dueTime: '20:00',
    isActive: false,
  };

  const copy = makeChoreCopy(source, 'house-kitchen-1');

  assert.equal(copy.id, 'house-kitchen-1');
  assert.deepEqual(copy.assigneeIds, []);
  assert.equal(copy.isActive, true);
  assert.equal(copy.subtasks[0]?.id, 'house-kitchen-1-step-1');
  assert.deepEqual(source.assigneeIds, ['someone']);
});

test('catalog translations preserve custom renames and subtask edits', () => {
  const template = CATALOG.find((chore) => chore.id === 'catalog-kitchen-blitz')!;
  const t = (key: string) => `translated:${key}`;
  assert.equal(choreDisplayName({ ...template, name: 'My kitchen' }, t), 'My kitchen');
  assert.equal(choreDisplayName(template, t), `translated:housegains.catalog.${template.id}.name`);
  assert.equal(subtaskDisplayName({ ...template.subtasks[0], name: 'My dishes' }, t), 'My dishes');
});

test('deleted definitions retain snapshot display and rules', () => {
  const template = CATALOG[0];
  const restored = resolveInstanceChore(
    {
      id: 'past',
      choreId: template.id,
      dueAt: '2026-01-01T21:00Z',
      choreSnapshot: {
        name: 'Historical name',
        icon: '🏠',
        category: 'pets',
        recurrence: 'daily',
        dueTime: '21:00',
      },
      subtasks: template.subtasks,
      bonusXp: 15,
      assigneeIds: [],
      status: 'done',
      completions: [],
      bonusAwards: {},
    },
    [],
  );
  assert.equal(restored?.name, 'Historical name');
  assert.equal(restored?.bonusXp, 15);
});

test('weekly goal uses XP rather than daily task counts and handles unavailable targets', () => {
  assert.deepEqual(deriveWeeklyGoal(320, 400), { goal: 400, ratio: 0.8, percent: 80 });
  assert.deepEqual(deriveWeeklyGoal(320, null), { goal: null, ratio: 0, percent: null });
  assert.deepEqual(deriveWeeklyGoal(500, 400), { goal: 400, ratio: 1, percent: 100 });
  assert.deepEqual(deriveWeeklyGoal(50, 0), { goal: null, ratio: 0, percent: null });
});

test('catalog copies retain subtask translation origin and preserve user edits', () => {
  const source = CATALOG[0];
  const copy = makeChoreCopy(source, 'copy');
  const t = (key: string) => `translated:${key}`;
  assert.equal(
    subtaskDisplayName(copy.subtasks[0], t),
    `translated:housegains.catalog.subtask.${source.subtasks[0].id}`,
  );
  assert.equal(subtaskDisplayName({ ...copy.subtasks[0], name: 'My own step' }, t), 'My own step');
});

test('retired instances leave Today and the dashboard summary', () => {
  const live = { id: 'live', dueAt: '2026-11-14T02:00:00.000Z' };
  const retired = {
    id: 'retired',
    dueAt: '2026-11-14T02:00:00.000Z',
    retiredAt: '2026-11-14T01:00:00.000Z',
  };
  assert.deepEqual(
    filterInstancesForHouseholdDate(
      [retired, live],
      new Date('2026-11-14T02:30:00.000Z'),
      'America/Sao_Paulo',
    ).map(({ id }) => id),
    ['live'],
  );

  const dashboardInstance = (id: string, retiredAt?: string) => ({
    id,
    assigneeIds: [],
    dueAt: '2999-11-13T21:00:00.000Z',
    ...(retiredAt ? { retiredAt } : {}),
    subtasks: [{ id: `${id}-step`, xp: 10 }],
    bonusXp: 0,
    status: 'open' as const,
    completions: [],
    bonusAwards: {},
  });
  const summary = deriveDashboardSummary(
    [dashboardInstance('live'), dashboardInstance('retired', '2026-11-14T01:00:00.000Z')],
    [{ id: 'me', name: 'Me' }],
    { me: 0 },
    'me',
  );
  assert.deepEqual(
    summary.orderedInstances.map(({ id }) => id),
    ['live'],
  );
  assert.equal(summary.totalSubtasks, 1);
  assert.equal(summary.remainingXp, 10);
});
