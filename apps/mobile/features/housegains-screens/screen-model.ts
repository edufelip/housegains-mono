import { CATALOG } from '@/features/household/catalog';
import type { Chore, Instance } from '@/features/household/types';

export type AssignableInstance = {
  id: string;
  assigneeIds: string[];
};

export function filterInstancesForHouseholdDate<T extends { dueAt: string }>(
  instances: readonly T[],
  date: Date,
  timeZone: string,
): T[] {
  const targetDate = householdDateKey(date, timeZone);
  return instances.filter((instance) => {
    const dueAt = new Date(instance.dueAt);
    return Number.isFinite(dueAt.getTime()) && householdDateKey(dueAt, timeZone) === targetDate;
  });
}

function householdDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export type ScoreMember = {
  id: string;
  name: string;
};

export function deriveInstanceProgress(instance: {
  subtasks: readonly { id: string; xp: number }[];
  completions: readonly { subtaskId: string }[];
}) {
  const completedSubtaskIds = new Set(instance.completions.map(({ subtaskId }) => subtaskId));
  const completedCount = instance.subtasks.reduce(
    (count, subtask) => count + (completedSubtaskIds.has(subtask.id) ? 1 : 0),
    0,
  );
  const remainingXp = instance.subtasks.reduce(
    (xp, subtask) => xp + (completedSubtaskIds.has(subtask.id) ? 0 : subtask.xp),
    0,
  );

  return {
    completedCount,
    totalCount: instance.subtasks.length,
    completedSubtaskIds,
    remainingXp,
  };
}

export type DashboardInstance = AssignableInstance & {
  dueAt: string;
  subtasks: readonly { id: string; xp: number }[];
  completions: readonly { subtaskId: string; memberId: string; xp: number }[];
  bonusAwards: Readonly<Record<string, number>>;
  bonusXp: number;
  status: 'open' | 'partial' | 'done';
};

export function deriveDashboardSummary<T extends DashboardInstance>(
  instances: readonly T[],
  members: readonly ScoreMember[],
  weeklyTotals: Readonly<Record<string, number>>,
  currentMemberId: string,
  now = new Date(),
) {
  const orderedInstances = orderTodayInstances(instances, currentMemberId);
  const score = deriveScoreSnapshot(members, weeklyTotals, currentMemberId);
  let completedSubtasks = 0;
  let totalSubtasks = 0;
  let remainingXp = 0;
  let pointsToday = 0;

  for (const instance of orderedInstances) {
    const progress = deriveInstanceProgress(instance);
    completedSubtasks += progress.completedCount;
    totalSubtasks += progress.totalCount;
    remainingXp += progress.remainingXp;
    if (
      progress.completedCount < progress.totalCount &&
      instance.status !== 'done' &&
      Date.parse(instance.dueAt) > now.getTime()
    ) {
      remainingXp += instance.bonusXp;
    }
    pointsToday += instance.completions.reduce(
      (points, completion) =>
        points + (completion.memberId === currentMemberId ? completion.xp : 0),
      0,
    );
    pointsToday += instance.bonusAwards[currentMemberId] ?? 0;
  }

  return {
    orderedInstances,
    completedSubtasks,
    totalSubtasks,
    remainingXp,
    pointsToday,
    weeklyPoints: score.points,
    rank: score.rank,
    leader: score.leader,
    pointsToOvertake: score.pointsToOvertake,
  };
}

export function deriveScoreSnapshot(
  members: readonly ScoreMember[],
  totals: Readonly<Record<string, number>>,
  currentMemberId: string,
): {
  points: number;
  rank: number;
  leader: (ScoreMember & { points: number }) | null;
  pointsToOvertake: number;
} {
  const points = totals[currentMemberId] ?? 0;
  const rank = members.filter((member) => (totals[member.id] ?? 0) > points).length + 1;
  const leader =
    [...members]
      .filter((member) => member.id !== currentMemberId)
      .sort((left, right) => (totals[right.id] ?? 0) - (totals[left.id] ?? 0))[0] ?? null;
  const leaderWithPoints = leader ? { ...leader, points: totals[leader.id] ?? 0 } : null;

  return {
    points,
    rank,
    leader: leaderWithPoints,
    pointsToOvertake: leaderWithPoints ? Math.max(0, leaderWithPoints.points - points + 1) : 0,
  };
}

export function deriveTotalXp(
  entries: readonly { memberId: string; amount: number }[],
  memberId: string,
): number {
  return Math.max(
    0,
    entries.reduce((total, entry) => total + (entry.memberId === memberId ? entry.amount : 0), 0),
  );
}

export function deriveProgression(totalXp: number): {
  level: number;
  titleKey: 'rookie' | 'tidyTitan';
  xpIntoLevel: number;
} {
  const earnedXp = Math.max(0, Math.floor(totalXp));
  const level = Math.floor(earnedXp / 100) + 1;
  return {
    level,
    titleKey: level >= 5 ? 'tidyTitan' : 'rookie',
    xpIntoLevel: earnedXp % 100,
  };
}

export function makeChoreCopy(source: Chore, id: string): Chore {
  return {
    ...source,
    catalogId: source.catalogId ?? source.id,
    id,
    assigneeIds: [],
    isActive: true,
    subtasks: source.subtasks.map((subtask, index) => ({
      ...subtask,
      catalogSubtaskId: subtask.catalogSubtaskId ?? subtask.id,
      id: `${id}-step-${index + 1}`,
      position: index,
    })),
  };
}

/**
 * Groups a member's chores first, other assigned work second, and open work last.
 * Filtering preserves the provider's order inside each group.
 */
export function orderTodayInstances<T extends AssignableInstance>(
  instances: readonly T[],
  memberId: string,
): T[] {
  const yours: T[] = [];
  const shared: T[] = [];
  const unassigned: T[] = [];

  for (const instance of instances) {
    if (instance.assigneeIds.length === 0) {
      unassigned.push(instance);
    } else if (instance.assigneeIds.length === 1 && instance.assigneeIds[0] === memberId) {
      yours.push(instance);
    } else {
      shared.push(instance);
    }
  }

  return [...yours, ...shared, ...unassigned];
}

/** Keep earned history displayable after its definition is renamed or removed. */
export function resolveInstanceChore(
  instance: Instance,
  definitions: readonly Chore[],
): Chore | undefined {
  const current = definitions.find((chore) => chore.id === instance.choreId);
  if (!current && !instance.choreSnapshot) return undefined;
  return {
    id: instance.choreId,
    name: '',
    icon: '',
    category: '',
    recurrence: 'daily',
    dueTime: '00:00',
    isActive: false,
    ...current,
    ...instance.choreSnapshot,
    subtasks: instance.subtasks,
    bonusXp: instance.bonusXp,
    assigneeIds: instance.assigneeIds,
  };
}

export function choreDisplayName(chore: Chore, t: (key: string) => string): string {
  const template = CATALOG.find((candidate) => candidate.id === (chore.catalogId ?? chore.id));
  return template && template.name === chore.name
    ? t(`housegains.catalog.${template.id}.name`)
    : chore.name;
}

export function subtaskDisplayName(
  subtask: { id: string; name: string; catalogSubtaskId?: string },
  t: (key: string) => string,
): string {
  const original = CATALOG.flatMap((chore) => chore.subtasks).find(
    (candidate) => candidate.id === (subtask.catalogSubtaskId ?? subtask.id),
  );
  return original && original.name === subtask.name
    ? t(`housegains.catalog.subtask.${original.id}`)
    : subtask.name;
}

/** The visual scorecard tracks weekly XP; daily set completion is a separate metric. */
export function deriveWeeklyGoal(points: number, target: number | null = 400) {
  if (target === null || !Number.isFinite(target) || target <= 0)
    return { goal: null, ratio: 0, percent: null };
  const ratio = Math.max(0, Math.min(1, points / target));
  return { goal: target, ratio, percent: Math.round(ratio * 100) };
}
