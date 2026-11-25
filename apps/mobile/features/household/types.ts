import type { ActionCelebrations } from '@/features/gamification/types';

export type HouseholdRole = 'creator' | 'admin' | 'member';

export interface Member {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: HouseholdRole;
  xp?: number;
  /** Highest XP ever; missing on member documents written before the level migration. */
  xpPeak?: number;
  /** Old-curve level written once by the migration; missing on old member documents. */
  levelFloor?: number;
}

export interface Subtask {
  catalogSubtaskId?: string;
  id: string;
  name: string;
  xp: number;
  position: number;
}

export interface Chore {
  catalogId?: string;
  id: string;
  name: string;
  icon: string;
  category: string;
  subtasks: Subtask[];
  bonusXp: number;
  assigneeIds: string[];
  recurrence: string;
  dueTime: string;
  isActive: boolean;
}

export interface Completion {
  id: string;
  instanceId: string;
  subtaskId: string;
  memberId: string;
  xp: number;
  completedAt: string;
  isAssist: boolean;
}

export interface Instance {
  choreSnapshot?: Pick<
    Chore,
    'name' | 'icon' | 'category' | 'recurrence' | 'dueTime' | 'catalogId'
  >;
  id: string;
  choreId: string;
  dueAt: string;
  subtasks: Subtask[];
  bonusXp: number;
  assigneeIds: string[];
  status: 'open' | 'partial' | 'done';
  completions: Completion[];
  bonusAwards: Record<string, number>;
  /** Mirrors the dispute lifecycle; absent when the instance was never disputed. */
  disputeStatus?: 'open' | 'resolved' | 'expired';
  /** Moderation reversals: completions an admin revoked. */
  revocations?: InstanceRevocation[];
  /**
   * Set when the chore was deleted or paused while this review-record instance was still
   * reviewable: it stays in history, read-only, and leaves Today, dashboards and due lists.
   */
  retiredAt?: string;
}

export interface InstanceRevocation {
  subtaskId: string;
  memberId: string;
  xp: number;
  actorUid: string;
  verdict: 'partial' | 'not_done';
  at: string;
}

export interface Invite {
  code: string;
  expiresAt: string;
  uses: number;
  maxUses: number;
  revoked: boolean;
}

/** One member's report inside a dispute (contract Part A2). */
export interface DisputeReport {
  uid: string;
  subtaskIds: string[];
  reason: string;
  createdAt: string;
}

/** households/{hid}/disputes/{instanceId}, doc id = instanceId. */
export interface Dispute {
  id: string;
  instanceId: string;
  choreName: string;
  status: 'open' | 'resolved' | 'expired';
  subtaskIds: string[];
  /**
   * Ids of the completions the reports named; absent on disputes written before the field
   * existed, which cover every disputed subtask.
   */
  completionIds?: string[];
  completerIds: string[];
  reports: DisputeReport[];
  verdict?: 'done' | 'partial' | 'not_done';
  revokedSubtaskIds?: string[];
  resolverUid?: string;
  createdAt: string;
  resolvedAt?: string;
  expiresAt: string;
}

export interface WeekMemberTotals {
  xp: number;
  subtasks: number;
  assignedDue: number;
  missed: number;
}

/** Latest closed households/{hid}/weeks/{weekStart} snapshot (contract Part B). */
export interface WeekStandings {
  weekStart: string;
  weekEnd: string;
  topMember: { memberId: string; xp: number; subtasks: number } | null;
  wallOfShame: { memberId: string; missed: number; assignedDue: number } | null;
  members: Record<string, WeekMemberTotals>;
}

export interface Household {
  weeklyGoalXp?: number | null;
  id: string;
  name: string;
  icon: string;
  color: string;
  /** Captured at creation and used for recurrence and due-time calendar rules. */
  timeZone?: string;
  /** Rollout cohort written by the backend; the program shows only for 'live' (contract C1). */
  gamificationCohort?: 'live' | 'control' | 'shadow';
  members: Member[];
  /** Tombstoned members: left out of the roster, still named in history. */
  formerMembers?: Member[];
  invite: Invite;
}

export interface FeedPost {
  id: string;
  instanceId: string;
  memberId: string;
  createdAt: string;
}

/** Signed XP event. Undo and revoke rows use negative amounts and point to their source row. */
export interface XpLedgerEntry {
  id: string;
  instanceId: string;
  subtaskId?: string;
  memberId: string;
  amount: number;
  source: 'subtask' | 'bonus' | 'undo-subtask' | 'undo-bonus' | 'revoke-subtask' | 'revoke-bonus';
  createdAt: string;
  reversesEntryId?: string;
}

export interface HouseholdViewModel {
  hydrated: boolean;
  household: Household | null;
  currentMember: Member;
  chores: Chore[];
  instances: Instance[];
  error: string | null;
  retryHydration(): Promise<void>;
  createHousehold(name: string, icon: string, color: string): Promise<void>;
  updateHousehold(name: string, icon: string, color: string): Promise<void>;
  joinHousehold(code: string): Promise<void>;
  saveChore(chore: Chore): Promise<void>;
  setAssignments(choreId: string, ids: string[]): Promise<void>;
  pauseChore(id: string): Promise<void>;
  deleteChore(id: string): Promise<void>;
  /** Resolves with the caller's own celebrations (empty unless gamification is live for the household). */
  completeSubtask(instanceId: string, subtaskId: string): Promise<ActionCelebrations>;
  undoSubtask(instanceId: string, subtaskId: string): Promise<void>;
  regenerateInvite(): Promise<void>;
  finishSetup(): Promise<void>;
  setupComplete: boolean;
  feed: FeedPost[];
  postCompletion(instanceId: string): Promise<ActionCelebrations>;
  /** Net XP earned by each member since the local Monday week boundary. */
  weeklyTotals: Record<string, number>;
  /** Consecutive local calendar days with net positive XP for currentMember. */
  streak: number;
  /** Persisted credit and reversal events used to derive all XP totals. */
  xpLedger: XpLedgerEntry[];
  /** Open completion disputes (households/{hid}/disputes where status == 'open'),
   *  or null while the listener has not delivered. */
  disputes: Dispute[] | null;
  /** Latest closed week snapshot, or null before any week has closed. */
  lastWeek: WeekStandings | null;
  /** Creator-only role management (contract A1). */
  setMemberRole(memberId: string, role: 'admin' | 'member'): Promise<void>;
  /** Member report of someone else's completion (contract A2). */
  reportCompletion(instanceId: string, subtaskIds?: string[], reason?: string): Promise<void>;
  /** Admin verdict on an open dispute (contract A2). */
  resolveDispute(
    disputeId: string,
    verdict: 'done' | 'partial' | 'not_done',
    subtaskIds?: string[],
  ): Promise<void>;
  /** Admin verdict directly on a completion, without a report (contract A2). */
  moderateInstance(
    instanceId: string,
    verdict: 'partial' | 'not_done',
    subtaskIds?: string[],
  ): Promise<void>;
}
