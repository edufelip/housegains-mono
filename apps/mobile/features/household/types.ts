export type HouseholdRole = 'creator' | 'member';

export interface Member {
  id: string;
  name: string;
  initials: string;
  color: string;
  role: HouseholdRole;
  xp?: number;
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
}

export interface Invite {
  code: string;
  expiresAt: string;
  uses: number;
  maxUses: number;
  revoked: boolean;
}

export interface Household {
  weeklyGoalXp?: number | null;
  id: string;
  name: string;
  icon: string;
  color: string;
  /** Captured at creation and used for recurrence and due-time calendar rules. */
  timeZone?: string;
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

/** Signed XP event. Undo rows use negative amounts and point to their source row. */
export interface XpLedgerEntry {
  id: string;
  instanceId: string;
  subtaskId?: string;
  memberId: string;
  amount: number;
  source: 'subtask' | 'bonus' | 'undo-subtask' | 'undo-bonus';
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
  completeSubtask(instanceId: string, subtaskId: string): Promise<void>;
  undoSubtask(instanceId: string, subtaskId: string): Promise<void>;
  regenerateInvite(): Promise<void>;
  finishSetup(): Promise<void>;
  setupComplete: boolean;
  feed: FeedPost[];
  postCompletion(instanceId: string): Promise<void>;
  /** Net XP earned by each member since the local Monday week boundary. */
  weeklyTotals: Record<string, number>;
  /** Consecutive local calendar days with net positive XP for currentMember. */
  streak: number;
  /** Persisted credit and reversal events used to derive all XP totals. */
  xpLedger: XpLedgerEntry[];
}
