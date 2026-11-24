import { addDaysToDateKey, dateKeyInTimeZone, localDateTimeToInstant, weekdayForDateKey } from './time';

// Part B of docs/implementation/gamification-moderation-contract.md: weekly top member
// and wall of shame. Pure date, stats and ranking logic; closeWeeks (scheduled.ts) owns I/O.

/** A Monday-start week in the household time zone, as YYYY-MM-DD keys. */
export interface WeekBounds {
  weekStart: string; // Monday
  weekEnd: string; // Sunday
}

/** A ledger row as standings sees it; `source` follows the contract's six values. */
export interface StandingRow {
  memberId: string;
  amount: number;
  source: string;
  createdAt: Date;
}

/** An instance as standings sees it: only who was assigned, when it was due, and status. */
export interface StandingInstance {
  assigneeIds: string[];
  dueAt: Date;
  status: string;
}

export interface MemberWeekStats {
  xp: number;
  subtasks: number;
  assignedDue: number;
  missed: number;
  /** Time of the member's last positive ledger row in the week (top-member tie-break). */
  lastPositiveAt: Date | null;
}

export interface TopMember {
  memberId: string;
  xp: number;
  subtasks: number;
}

export interface WallOfShame {
  memberId: string;
  missed: number;
  assignedDue: number;
}

/** The Monday-to-Sunday week containing `now`, on the household's wall clock. */
export function weekBounds(now: Date, timeZone: string): WeekBounds {
  const key = dateKeyInTimeZone(now, timeZone);
  const weekStart = addDaysToDateKey(key, -((weekdayForDateKey(key) + 6) % 7));
  return { weekStart, weekEnd: addDaysToDateKey(weekStart, 6) };
}

/**
 * The week this run closes: the one that ended last Sunday, but only once local time
 * has passed Monday 03:00 of the following week (contract Part B). Null before that.
 */
export function weekToClose(now: Date, timeZone: string): WeekBounds | null {
  const current = weekBounds(now, timeZone);
  if (now < localDateTimeToInstant(current.weekStart, '03:00', timeZone)) return null;
  const weekStart = addDaysToDateKey(current.weekStart, -7);
  return { weekStart, weekEnd: addDaysToDateKey(weekStart, 6) };
}

/** Absolute instants for the week: Monday 00:00 local to the next Monday 00:00 (DST-correct). */
export function weekInstants(week: WeekBounds, timeZone: string): { weekStart: Date; weekEnd: Date } {
  return {
    weekStart: localDateTimeToInstant(week.weekStart, '00:00', timeZone),
    weekEnd: localDateTimeToInstant(addDaysToDateKey(week.weekStart, 7), '00:00', timeZone),
  };
}

/**
 * Per-member week stats (contract Part B). `memberIds` is `memberUids` at close time;
 * rows and instances by anyone else are ignored. Rows/instances outside
 * [weekStart, weekEnd) are ignored, so callers may pass unfiltered reads.
 */
export function memberWeekStats(input: {
  memberIds: string[];
  rows: StandingRow[];
  instances: StandingInstance[];
  weekStart: Date;
  weekEnd: Date;
}): Record<string, MemberWeekStats> {
  const stats = new Map<string, MemberWeekStats>(
    input.memberIds.map((uid) => [uid, { xp: 0, subtasks: 0, assignedDue: 0, missed: 0, lastPositiveAt: null }]),
  );
  for (const entry of input.rows) {
    const member = stats.get(entry.memberId);
    if (!member || entry.createdAt < input.weekStart || entry.createdAt >= input.weekEnd) continue;
    member.xp += entry.amount;
    if (entry.source === 'subtask') member.subtasks += 1;
    else if (entry.source === 'undo-subtask' || entry.source === 'revoke-subtask') member.subtasks -= 1;
    if (entry.amount > 0 && (!member.lastPositiveAt || entry.createdAt > member.lastPositiveAt)) {
      member.lastPositiveAt = entry.createdAt;
    }
  }
  for (const instance of input.instances) {
    if (instance.dueAt < input.weekStart || instance.dueAt >= input.weekEnd) continue;
    for (const uid of instance.assigneeIds) {
      const member = stats.get(uid);
      if (!member) continue;
      member.assignedDue += 1;
      if (instance.status !== 'done') member.missed += 1;
    }
  }
  return Object.fromEntries(stats);
}

/** Code-unit ascending order: the contract's "memberId ascending", independent of the locale. */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Highest XP this week, ties broken by more subtasks, then the earlier last positive
 * ledger row, then the ascending member id. Null with fewer than 2 active members or
 * when nobody has positive XP.
 */
export function pickTopMember(stats: Record<string, MemberWeekStats>): TopMember | null {
  const entries = Object.entries(stats);
  if (entries.length < 2) return null;
  const ranked = entries
    .filter(([, member]) => member.xp > 0)
    .sort(
      (a, b) =>
        b[1].xp - a[1].xp ||
        b[1].subtasks - a[1].subtasks ||
        (a[1].lastPositiveAt?.getTime() ?? Infinity) - (b[1].lastPositiveAt?.getTime() ?? Infinity) ||
        compareIds(a[0], b[0]),
    );
  const [memberId, member] = ranked[0] ?? [];
  return memberId === undefined ? null : { memberId, xp: member.xp, subtasks: member.subtasks };
}

/**
 * Most missed instances this week, ties broken by the higher missed/assignedDue rate,
 * then lower XP, then the ascending member id. Null with fewer than 2 active members or
 * when nobody missed anything. The same member may hold the top title too.
 */
export function pickWallOfShame(stats: Record<string, MemberWeekStats>): WallOfShame | null {
  const entries = Object.entries(stats);
  if (entries.length < 2) return null;
  const ranked = entries
    .filter(([, member]) => member.missed >= 1)
    .sort(
      (a, b) =>
        b[1].missed - a[1].missed ||
        b[1].missed / b[1].assignedDue - a[1].missed / a[1].assignedDue ||
        a[1].xp - b[1].xp ||
        compareIds(a[0], b[0]),
    );
  const [memberId, member] = ranked[0] ?? [];
  return memberId === undefined ? null : { memberId, missed: member.missed, assignedDue: member.assignedDue };
}

/** What a just-closed week looks like to the Part C engine (contract C8 plugs in here). */
export interface WeekClosedContext {
  householdId: string;
  weekStart: string; // YYYY-MM-DD Monday
  weekEnd: string; // YYYY-MM-DD Sunday
  timeZone: string;
  closedAt: Date;
  members: Record<string, MemberWeekStats>;
  topMember: TopMember | null;
  wallOfShame: WallOfShame | null;
}

// Part C (gamification) registers its engine here when it lands; empty until then.
export const afterWeekClosedHooks: Array<(context: WeekClosedContext) => Promise<void>> = [];

/** Runs every registered Part C hook for a freshly closed week. A no-op today. */
export async function afterWeekClosed(context: WeekClosedContext): Promise<void> {
  await Promise.all(afterWeekClosedHooks.map((hook) => hook(context)));
}
