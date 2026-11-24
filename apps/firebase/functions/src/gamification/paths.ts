// Firestore locations of the gamification back office (contract C1/C2/C9). A document path has an
// even number of segments, so each sub-collection of `gamification` is `{name}/items/{id}`.
// No client access (firestore.rules); Cloud Functions and the admin callables only.

export const GAMI_CONFIG_PATH = 'gamification/config';
export const GAMI_RULE_SETS_PATH = 'gamification/ruleSets/items';
export const GAMI_ALERTS_PATH = 'gamification/alerts/items';
export const GAMI_AUDIT_PATH = 'gamification/audit/items';
export const GAMI_ADJUSTMENTS_PATH = 'gamification/adjustments/items';

export const gamiRuleSetPath = (version: number) => `${GAMI_RULE_SETS_PATH}/${version}`;

/**
 * households/{hid}/gamiProcessed/{ledgerRowId}: written by the runner, in its own transaction, for every XP
 * ledger row an engine run covered. The safety-net trigger skips marked rows without waiting.
 */
export const gamiProcessedPath = (householdId: string, ledgerRowId: string) =>
  `households/${householdId}/gamiProcessed/${ledgerRowId}`;
