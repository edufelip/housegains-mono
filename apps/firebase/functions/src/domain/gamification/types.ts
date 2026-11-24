// Pure gamification engine types (contract Part C). No I/O, no Firestore.
// The wiring layer translates Firestore documents into GamiEvents and writes
// EngineResults back; everything here is deterministic given the input.

export const PROJECTION_VERSION = 1;

export type EventKind =
  | 'ledger.subtask'
  | 'ledger.bonus'
  | 'ledger.undo-subtask'
  | 'ledger.undo-bonus'
  | 'ledger.revoke-subtask'
  | 'ledger.revoke-bonus'
  | 'feed.post'
  | 'instance.completed_on_time'
  | 'member.joined'
  | 'member.activated'
  | 'member.removed'
  | 'household.setup_finished'
  | 'chore.created'
  | 'chore.deleted'
  | 'household.week_closed';

export type Track = 'ganhos' | 'zelo';
export type Tier = 'bronze' | 'silver' | 'gold';
export type RolloutMode = 'off' | 'shadow' | 'live';
export type Cohort = 'live' | 'control' | 'shadow';

// ---- Rule set (C2) -------------------------------------------------------------

/** Counters shared across rules ("pools") vs per-rule occurrence caps. */
export type CapPool = 'dailyGanhos' | 'perInstanceGanhos' | 'weeklyZelo';
export type CapScope = 'member' | 'member+target' | 'household' | 'lifetime';
export type CapWindow = 'day' | 'week' | 'life';

export interface CapRule {
  scope: CapScope;
  window: CapWindow;
  max: number;
  /** Amount pool: shared counter (C3 caps config), trims the award. */
  pool?: CapPool;
  /** What "member+target" keys on: the instance, each assignee, or the chore. */
  target?: 'instance' | 'assignee' | 'chore';
}

export interface AwardOverride {
  where: Record<string, unknown>;
  amount: number;
}

export interface AwardSpec {
  /** Flat amount, or 1-per-XP when `perXp` is set. */
  amount: number;
  perXp?: boolean;
  /** First matching override replaces the amount (zelo.on_time >=90% -> 60). */
  overrides?: AwardOverride[];
  /** Milestone ladder keyed by the milestone value (streak milestones). */
  milestones?: Record<string, number>;
  /** Payout per achievement tier (earn.achievement). */
  tiers?: Partial<Record<Tier, number>>;
}

export interface ClawbackRule {
  on: EventKind;
  match: 'sourceRef';
}

export interface EarnRule {
  id: string;
  track: Track;
  status: 'active' | 'paused';
  on: { kind: EventKind; where?: Record<string, unknown> };
  award: AwardSpec;
  caps: CapRule[];
  clawback?: ClawbackRule[];
  spendableAfterHours: number;
  celebrate?: { moment: 'toast' | 'badge' | 'streak' | 'level'; copyKey: string };
  audience?: { minHouseholdMembers?: number };
  activeFrom?: string;
  activeTo?: string | null;
  /** What the row's sourceRef is taken from; default is the event's action id. */
  ref?: 'action' | 'chore' | 'member' | 'instance';
}

export interface AchievementDef {
  id: string;
  track: 'member' | 'organizer';
  /** Metric the engine resolves against the projection (see achievements.ts). */
  metric: string;
  /** Active badges toggle `active` instead of unlocking once (fit, pillar, order). */
  active?: boolean;
  /** Resets its stat when the season changes (spring, yearend). */
  seasonal?: boolean;
  tiers: { bronze: number; silver?: number; gold?: number };
}

export interface MemberStreakRule {
  minWeekCredits: number;
  folgaEveryWeeks: number;
  folgaMax: number;
  folgaHighLevelFrom: number;
  folgaMaxHighLevel: number;
}

export interface OrganizerStreakRule {
  minOnTimeRatePercent: number;
  minWeekInstancesDue: number;
  folgaEveryWeeks: number;
  folgaMax: number;
}

export interface QuestDef {
  id: string;
  titleKey: string;
  steps: { ruleId: string; count: number }[];
  reward: { track: Track; amount: number; copyKey: string };
}

export interface CampaignDef {
  id: string;
  multiplier: 1.5 | 2;
  ruleIds: string[];
  activeFrom: string;
  activeTo: string | null;
  audience?: { minHouseholdMembers?: number };
}

export interface RuleSet {
  schemaVersion: 1;
  earnRules: EarnRule[];
  achievements: AchievementDef[];
  streak: { member: MemberStreakRule; organizer: OrganizerStreakRule };
  levels: {
    member: { base: number; titles: { fromLevel: number; key: string }[] };
    organizer: { thresholds: { zelo: number; key: string }[] };
  };
  caps: { dailyGanhos: number; perInstanceGanhos: number; weeklyZelo: number; newChoreCooldownHours: number };
  quests: QuestDef[];
  campaigns: CampaignDef[];
}

// ---- Events (one GamiEvent variant per EventKind) -------------------------------

export interface LedgerSubtaskEvent {
  kind: 'ledger.subtask';
  householdId: string;
  /** households/{hid}/ledger row id: the sourceRef for earn.subtask/assist/welcome. */
  ledgerRowId: string;
  instanceId: string;
  subtaskId: string;
  memberId: string;
  /** XP credited by this row. */
  amount: number;
  isAssist: boolean;
  isFinalCompleter: boolean;
  assigneeIds: string[];
  category: string;
  choreId: string;
  choreCreatedBy: string;
  choreIsCustom: boolean;
  choreUpdatedAt: Date | null;
  completedAt: Date;
  /** For zelo.member_activated (credits 3 within N days of joining). */
  memberJoinedAt?: Date | null;
  /** The member's xpPeak after this credit (level-up detection). */
  xpPeakAfter?: number | null;
  /** C9 alerts. */
  choreXpRaised?: boolean;
  recentSubtaskTimestamps?: Date[];
}

export interface LedgerBonusEvent {
  kind: 'ledger.bonus';
  householdId: string;
  ledgerRowId: string;
  instanceId: string;
  memberId: string;
  amount: number;
  choreId: string;
  choreUpdatedAt: Date | null;
  completedAt: Date;
  xpPeakAfter?: number | null;
}

/** What the original wallet rows actually paid, read from the wallet ledger. */
export interface ReversedRow {
  amount: number;
  awardedAt: Date;
}

export interface SubtaskReversalEvent {
  householdId: string;
  instanceId: string;
  subtaskId: string;
  memberId: string;
  /** The XP ledger row being undone: sourceRef of the earn.subtask/assist rows. */
  reversedRowId: string;
  reversedAmount: number;
  isAssist: boolean;
  category: string;
  isFinalCompleter: boolean;
  instanceStatusAfter: 'open' | 'partial' | 'done';
  assigneeIds: string[];
  completedAt: Date;
  reversedAward: { subtask: ReversedRow | null; assist: ReversedRow | null };
}

export interface LedgerUndoSubtaskEvent extends SubtaskReversalEvent {
  kind: 'ledger.undo-subtask';
}

export interface LedgerRevokeSubtaskEvent extends SubtaskReversalEvent {
  kind: 'ledger.revoke-subtask';
  actorUid: string;
  verdict: 'partial' | 'not_done';
  disputeId: string | null;
}

export interface LedgerUndoBonusEvent {
  kind: 'ledger.undo-bonus';
  householdId: string;
  instanceId: string;
  memberId: string;
  reversedRowId: string;
  reversedAmount: number;
  completedAt: Date;
  reversedAward: { bonus: ReversedRow | null };
}

export interface LedgerRevokeBonusEvent {
  kind: 'ledger.revoke-bonus';
  householdId: string;
  instanceId: string;
  memberId: string;
  reversedRowId: string;
  reversedAmount: number;
  completedAt: Date;
  actorUid: string;
  verdict: 'partial' | 'not_done';
  disputeId: string | null;
  reversedAward: { bonus: ReversedRow | null };
}

export interface InstanceCompletedOnTimeEvent {
  kind: 'instance.completed_on_time';
  householdId: string;
  instanceId: string;
  dueAt: Date;
  completedAt: Date;
  assigneeIds: string[];
  /** Members whose completions stand on the instance. */
  contributorIds: string[];
  finalCompleterId: string;
  /** Ledger row of the completion that finished the instance (re-award generation). */
  finalRowId: string;
  choreId: string;
  choreUpdatedAt: Date | null;
}

export interface FeedPostEvent {
  kind: 'feed.post';
  householdId: string;
  postId: string;
  memberId: string;
  postedAt: Date;
}

export interface MemberJoinedEvent {
  kind: 'member.joined';
  householdId: string;
  memberId: string;
  joinedAt: Date;
}

/** Informational: activation is detected by the engine on ledger.subtask. */
export interface MemberActivatedEvent {
  kind: 'member.activated';
  householdId: string;
  memberId: string;
  joinedAt: Date;
  activatedAt: Date;
}

export interface MemberRemovedEvent {
  kind: 'member.removed';
  householdId: string;
  memberId: string;
  joinedAt: Date;
  removedAt: Date;
}

export interface HouseholdSetupFinishedEvent {
  kind: 'household.setup_finished';
  householdId: string;
  finishedAt: Date;
}

export interface ChoreCreatedEvent {
  kind: 'chore.created';
  householdId: string;
  choreId: string;
  createdBy: string;
  isCustom: boolean;
  createdAt: Date;
}

export interface ChoreDeletedEvent {
  kind: 'chore.deleted';
  householdId: string;
  choreId: string;
  createdBy: string;
  isCustom: boolean;
  createdAt: Date;
  deletedAt: Date;
}

export interface WeekMemberStats {
  xp: number;
  /** Net subtask credits in the week (subtask - undo - revoke). */
  credits: number;
  assignedDue: number;
  missed: number;
  undoCount: number;
  revokeCount: number;
}

export interface HouseholdWeekClosedEvent {
  kind: 'household.week_closed';
  householdId: string;
  weekStart: string;
  weekEnd: string;
  timeZone: string;
  closedAt: Date;
  weeklyGoalXp: number | null;
  goalReached: boolean;
  instancesDue: number;
  instancesOnTime: number;
  /** Every (active) member is away this week: organizer streak pauses. */
  allAway: boolean;
  members: Record<string, WeekMemberStats>;
}

export type GamiEvent =
  | LedgerSubtaskEvent
  | LedgerBonusEvent
  | LedgerUndoSubtaskEvent
  | LedgerUndoBonusEvent
  | LedgerRevokeSubtaskEvent
  | LedgerRevokeBonusEvent
  | InstanceCompletedOnTimeEvent
  | FeedPostEvent
  | MemberJoinedEvent
  | MemberActivatedEvent
  | MemberRemovedEvent
  | HouseholdSetupFinishedEvent
  | ChoreCreatedEvent
  | ChoreDeletedEvent
  | HouseholdWeekClosedEvent;

// ---- Projections (C3) -----------------------------------------------------------

export interface StreakState {
  current: number;
  record: number;
  lastCountedWeek: string | null;
  /** Last weekStart this projection already processed (idempotency). */
  lastActionWeek: string | null;
  folgas: number;
  folgaProgress: number;
  /** Member only: Mondays set via setAwayWeeks. */
  awayWeeks?: string[];
}

export interface AchievementState {
  tier: Tier;
  unlockedAt: Date;
  active?: boolean;
}

export interface WalletStats {
  assists: number;
  finals: number;
  onTime: number;
  /** Subtask credits (drives zelo.member_activated and spring). */
  credits: number;
  categories: Record<string, number>;
  weeksCounted: number;
  welcomePaid?: boolean;
  /** Last 4 processed weeks, for `fit` and `pillar`. */
  recentWeeks: { weekStart: string; counted: boolean; xp: number }[];
  /** Household week XP totals (last 4), for `pillar`. */
  householdXpByWeek: Record<string, number>;
  springSubtasks: number;
  springSeasonKey: string | null;
  decemberGoalWeeks: number;
  /** Milestones already paid in the current streak run. */
  streakMilestonesPaid: number[];
}

export interface WalletProjection {
  householdId: string;
  memberId: string;
  balance: number;
  lifetimeEarned: number;
  pendingBalance: number;
  nextSpendableAt: Date | null;
  level: number;
  xpPeak: number;
  streak: StreakState;
  achievements: Record<string, AchievementState>;
  stats: WalletStats;
  caps: Record<string, number>;
  projectionVersion: number;
  updatedAt: Date;
}

export interface OrganizerStats {
  membersActivated: number;
  maestroWeeks: number;
  evenSplitWeeks: number;
  /** Completion counts per custom chore, for `architect`. */
  customChoreCompletions: Record<string, number>;
  weeksCounted: number;
  /** Last 4 weeks {due, onTime}, for `order`. */
  orderWeeks: { weekStart: string; due: number; onTime: number }[];
  streakMilestonesPaid: number[];
}

export interface OrganizerProjection {
  householdId: string;
  /** The creator: the only member who can earn Zelo. */
  memberId: string;
  zelo: number;
  lifetimeZelo: number;
  level: number;
  streak: StreakState;
  achievements: Record<string, AchievementState>;
  stats: OrganizerStats;
  caps: Record<string, number>;
  updatedAt: Date;
}

// ---- Outputs --------------------------------------------------------------------

export interface LedgerRowDraft {
  key: string;
  ruleId: string;
  ruleSetVersion: number | null;
  track: Track;
  /** Signed; negative for reversals. */
  amount: number;
  sourceRef: string;
  householdId: string;
  memberId: string;
  /** The original row key this reversal negates. */
  reversesEntryId?: string;
  reason?: string;
  createdAt: Date;
  spendableAt: Date;
}

export interface CelebrationPart {
  ruleId: string;
  amount: number;
}

export interface Celebration {
  id: string;
  moment: 'toast' | 'badge' | 'streak' | 'level' | 'standings';
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

export type ServerEventName =
  | 'gami_earned'
  | 'gami_clawback'
  | 'gami_streak_week_counted'
  | 'gami_streak_broken'
  | 'gami_folga_used'
  | 'gami_milestone'
  | 'gami_achievement_unlocked'
  | 'gami_achievement_lost'
  | 'gami_level_up'
  | 'gami_week_closed'
  | 'gami_reminder_sent';

export interface ServerEventDraft {
  name: ServerEventName;
  householdId: string;
  memberId?: string;
  data: Record<string, string | number | boolean | null>;
  createdAt: Date;
}

export type AlertKind = 'velocity' | 'chore-xp-raise' | 'undo-rate';

/** C9 integrity alerts. Never claw back automatically. */
export interface AlertDraft {
  kind: AlertKind;
  householdId: string;
  memberId?: string;
  data: Record<string, string | number>;
  createdAt: Date;
}

// ---- Engine surface --------------------------------------------------------------

export interface EngineInput {
  now: Date;
  rules: RuleSet;
  ruleSetVersion: number | null;
  /** The affected member's wallet; created on first earn when null. */
  wallet: WalletProjection | null;
  /**
   * The household organizer (creator) projection. Pass null when it does not
   * exist yet; omit (undefined) to skip organizer processing entirely.
   */
  organizer?: OrganizerProjection | null;
  householdMemberCount: number;
  timeZone: string;
  /** Keys already present in the wallet ledger and the organizer ledger. */
  existingKeys: ReadonlySet<string>;
  /**
   * What the rows behind `existingKeys` actually paid, and when. Clawbacks reverse exactly the paid
   * amount (cap trimming and campaigns make it differ from the rule's flat amount) and refund the
   * cap counters of the award's own day/week. A key without an entry falls back to the rule's amount
   * and the reversal's own date; the runner always supplies the rows it loaded.
   */
  existingRows?: ReadonlyMap<string, PaidRow>;
  creatorUid: string;
}

/** A standing ledger row as the engine needs it for a clawback. */
export interface PaidRow {
  amount: number;
  createdAt: Date;
}

export interface EngineResult {
  walletRows: LedgerRowDraft[];
  zeloRows: LedgerRowDraft[];
  /** Next wallet projection, or null when nothing changed. */
  wallet: WalletProjection | null;
  /** Next organizer projection, or null when nothing changed. */
  organizer: OrganizerProjection | null;
  celebrations: Celebration[];
  serverEvents: ServerEventDraft[];
  alerts: AlertDraft[];
}

/** Shared evaluation context (internal). */
export interface EvalContext {
  now: Date;
  rules: RuleSet;
  ruleSetVersion: number | null;
  timeZone: string;
  creatorUid: string;
  householdMemberCount: number;
  existingKeys: ReadonlySet<string>;
  existingRows: ReadonlyMap<string, PaidRow>;
  /** Keys emitted during this evaluate call. */
  emittedKeys: Set<string>;
}

/** Mutable accumulator the engine modules fill (internal). */
export interface ResultCollector {
  householdId: string;
  walletRows: LedgerRowDraft[];
  zeloRows: LedgerRowDraft[];
  celebrations: Celebration[];
  serverEvents: ServerEventDraft[];
  alerts: AlertDraft[];
  walletDirty: boolean;
  organizerDirty: boolean;
}
