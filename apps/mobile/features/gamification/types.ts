// Client view models for the Ganhos & Zelo program. Shapes follow
// docs/implementation/gamification-moderation-contract.md Part C and
// apps/firebase/functions/src/gamification/serialize.ts (the code wins).

export type Track = 'ganhos' | 'zelo';
export type Tier = 'bronze' | 'silver' | 'gold';
export type CelebrationMoment = 'toast' | 'badge' | 'streak' | 'level' | 'standings';

export interface CelebrationPart {
  ruleId: string;
  amount: number;
}

/** One moment to celebrate, from a callable response or a `users/{uid}/inbox` row. */
export interface Celebration {
  id: string;
  moment: CelebrationMoment;
  track: Track;
  amount?: number;
  parts?: CelebrationPart[];
  copyKey: string;
  achievementId?: string;
  tier?: Tier;
  level?: number;
  fullScreen?: boolean;
  data?: Record<string, string | number>;
}

/** A celebration read from the inbox: the document id is the celebration id. */
export interface InboxCelebration extends Celebration {
  seen: boolean;
  createdAt: string;
}

export interface AchievementState {
  tier: Tier;
  unlockedAt: string;
  /** `false` marks an active badge (fit, pillar, order) that lapsed. */
  active?: boolean;
}

export type AchievementMap = Record<string, AchievementState>;

export interface StreakRecentWeek {
  weekStart: string;
  counted: boolean;
  xp: number;
}

export interface StreakState {
  current: number;
  record: number;
  lastCountedWeek: string | null;
  lastActionWeek: string | null;
  folgas: number;
  folgaProgress: number;
  /** YYYY-MM-DD Mondays (members only). */
  awayWeeks: string[];
}

/** wallets/{uid}: owner-readable, private. */
export interface Wallet {
  householdId: string;
  memberId: string;
  balance: number;
  lifetimeEarned: number;
  pendingBalance: number;
  nextSpendableAt: string | null;
  level: number;
  xpPeak: number;
  streak: StreakState;
  achievements: AchievementMap;
  recentWeeks: StreakRecentWeek[];
  updatedAt: string;
}

/** wallets/{uid}/ledger/{key} */
export interface WalletLedgerRow {
  key: string;
  ruleId: string;
  track: Track;
  amount: number;
  sourceRef: string;
  reversesEntryId?: string;
  reason?: string;
  createdAt: string;
  spendableAt: string;
}

/** One closed week of the household's on-time record (organizer stats.orderWeeks). */
export interface OrganizerWeek {
  weekStart: string;
  due: number;
  onTime: number;
}

/** households/{hid}/organizer/{creatorUid}: readable by every member. */
export interface Organizer {
  memberId: string;
  zelo: number;
  lifetimeZelo: number;
  level: number;
  streak: Omit<StreakState, 'awayWeeks'>;
  achievements: AchievementMap;
  /** Recent closed weeks, oldest first. */
  orderWeeks: OrganizerWeek[];
}

/** Result of a callable that can earn: only the caller's own celebrations. */
export interface ActionCelebrations {
  celebrations: Celebration[];
}
