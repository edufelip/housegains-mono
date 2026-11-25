// Rule-set types for the gamification engine, copied from
// apps/firebase/functions/src/domain/gamification/types.ts (contract Part C2).
// No cross-package import: the functions package is not a workspace dependency.
// Keep this copy in sync with the source; src/engine-types.test.ts reads the
// source file and fails when one of these exported names disappears there or
// the EventKind union drifts.

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

/** Select options for EventKind fields (kept aligned with the union above). */
export const EVENT_KINDS: readonly EventKind[] = [
  'ledger.subtask',
  'ledger.bonus',
  'ledger.undo-subtask',
  'ledger.undo-bonus',
  'ledger.revoke-subtask',
  'ledger.revoke-bonus',
  'feed.post',
  'instance.completed_on_time',
  'member.joined',
  'member.activated',
  'member.removed',
  'household.setup_finished',
  'chore.created',
  'chore.deleted',
  'household.week_closed',
];
