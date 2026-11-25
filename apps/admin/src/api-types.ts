// API CONTRACT for the gamification admin callables (contract Part C10,
// docs/implementation/gamification-moderation-contract.md).
//
// The backend worker (apps/firebase/functions) implements exactly these
// callables and shapes; every request/response the admin app sends or expects
// is defined here. Dates cross the wire as ISO strings; the callables require
// the Auth custom claim `admin: true` and audit every mutation.

import type { RuleSet, Track } from './engine-types';

export type AdjustReasonCode = 'correction' | 'abuse' | 'support-goodwill';
export type RuleSetStatus = 'draft' | 'published' | 'archived';
export type AlertKind = 'velocity' | 'chore-xp-raise' | 'undo-rate';

// ---- adminListRuleSets ---------------------------------------------------------

/** gamification/ruleSets/{version} (C2), serialized. */
export interface AdminRuleSet {
  version: number;
  status: RuleSetStatus;
  notes: string;
  createdBy: string;
  createdAt: string;
  publishedAt: string | null;
  rules: RuleSet;
}
export type AdminListRuleSetsRequest = Record<string, never>;
export interface AdminListRuleSetsResponse {
  ruleSets: AdminRuleSet[];
}

// ---- adminSaveDraft ------------------------------------------------------------

export interface AdminSaveDraftRequest {
  /** Omitted → create a new draft from `rules`; given → overwrite that draft. */
  version?: number;
  notes: string;
  rules: RuleSet;
}
export interface AdminSaveDraftResponse {
  version: number;
  status: RuleSetStatus;
  createdAt: string;
}

// ---- adminPublish --------------------------------------------------------------

export interface AdminPublishRequest {
  version: number;
}
export interface AdminPublishResponse {
  activeVersion: number;
  previousVersion: number | null;
  publishedAt: string;
}

// ---- adminRollback -------------------------------------------------------------

export type AdminRollbackRequest = Record<string, never>;
export interface AdminRollbackResponse {
  activeVersion: number | null;
  previousVersion: number | null;
}

// ---- adminSimulate -------------------------------------------------------------

export interface AdminSimulateRequest {
  rules: RuleSet;
  days: number;
}

/** Aggregate totals for one side (published or draft) of a simulation. */
export interface SimSideTotals {
  ganhos: number;
  zelo: number;
  membersAffected: number;
  capHits: number;
  averagePerMember: number;
}

export interface SimRuleSide {
  total: number;
  membersAffected: number;
  capHits: number;
  averagePerMember: number;
}

/** A side is null when that side does not define the rule. */
export interface SimPerRule {
  ruleId: string;
  track: Track;
  published: SimRuleSide | null;
  draft: SimRuleSide | null;
}

export interface AdminSimulateResponse {
  days: number;
  published: SimSideTotals;
  draft: SimSideTotals;
  perRule: SimPerRule[];
}

// ---- adminLookupUser -----------------------------------------------------------

export interface AdminLookupUserRequest {
  uid: string;
}

/** wallets/{uid} projection summary (C3), serialized. */
export interface AdminWalletSummary {
  uid: string;
  householdId: string | null;
  balance: number;
  pendingBalance: number;
  lifetimeEarned: number;
  nextSpendableAt: string | null;
  level: number;
  xpPeak: number;
  streak: { current: number; record: number; folgas: number };
  updatedAt: string | null;
}

/** A wallet or organizer ledger row with the rule explanation attached. */
export interface AdminLedgerRow {
  key: string;
  ruleId: string;
  ruleSetVersion: number | null;
  track: Track;
  /** Signed; negative for reversals. */
  amount: number;
  sourceRef: string;
  householdId: string;
  memberId: string;
  reversesEntryId: string | null;
  reason: string | null;
  createdAt: string;
  spendableAt: string;
  explanation: string;
}

/** |amount| > 500 adjustments waiting for a second admin (C10). */
export interface AdminPendingAdjustment {
  id: string;
  uid: string;
  amount: number;
  reasonCode: AdjustReasonCode;
  note: string;
  createdBy: string;
  createdAt: string;
}

export interface AdminLookupUserResponse {
  uid: string;
  wallet: AdminWalletSummary | null;
  ledger: AdminLedgerRow[];
  pendingAdjustments: AdminPendingAdjustment[];
}

// ---- adminAdjust ---------------------------------------------------------------

export interface AdminAdjustRequest {
  uid: string;
  /** Signed integer Ganhos amount; non-zero. */
  amount: number;
  reasonCode: AdjustReasonCode;
  note: string;
}
export interface AdminAdjustResponse {
  /** Set when the adjustment was created pending (|amount| > 500). */
  id: string | null;
  status: 'applied' | 'pending';
}

// ---- adminApproveAdjustment ----------------------------------------------------

export interface AdminApproveAdjustmentRequest {
  id: string;
}
export interface AdminApproveAdjustmentResponse {
  id: string;
  status: 'applied';
  approvedBy: string;
  appliedAt: string;
}

// ---- adminListAlerts -----------------------------------------------------------

/** gamification/alerts/{id} (C9), serialized. */
export interface AdminAlert {
  id: string;
  kind: AlertKind;
  householdId: string;
  memberId: string | null;
  data: Record<string, string | number>;
  createdAt: string;
}
export type AdminListAlertsRequest = Record<string, never>;
export interface AdminListAlertsResponse {
  alerts: AdminAlert[];
}

// ---- adminRebuildWallet --------------------------------------------------------

export interface AdminRebuildWalletRequest {
  uid: string;
}
export interface AdminRebuildWalletResponse {
  uid: string;
  rows: number;
  balance: number;
}

// ---- adminBackfillLevelFloors --------------------------------------------------

export type AdminBackfillLevelFloorsRequest = Record<string, never>;
export interface AdminBackfillLevelFloorsResponse {
  updatedMembers: number;
}
