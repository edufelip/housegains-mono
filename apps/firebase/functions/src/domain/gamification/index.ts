// Public surface of the pure gamification engine (Part C).
//
// The wiring layer (Cloud Functions) uses:
// - evaluate(event, input)            after every XP-affecting action;
// - rebuildWalletProjection(rows, s)  for the admin rebuildWallet callable;
// - validateRuleSet(raw)              in adminSaveDraft;
// - DEFAULT_RULE_SET                  when activeVersion is null.

export * from './types';
export { DEFAULT_RULE_SET } from './default-rule-set';
export { validateRuleSet, type ValidateResult } from './validate-rule-set';
export {
  displayedLevel,
  levelForXp,
  memberTitleKey,
  organizerLevel,
  xpForLevel,
} from './levels';
export {
  escapeRef,
  householdCapKey,
  instanceGanhosCapKey,
  dailyGanhosCapKey,
  reversalKey,
  ruleCapKey,
  targetCapKey,
  walletKey,
  zeloWeekCapKey,
} from './keys';
export { isSouthernHemisphere, isSpring, springSeasonKey } from './hemisphere';
export { weekEndKeyForDateKey, weekStartKeyForDateKey, monthOfDateKey } from './weeks';
export { evaluate, rebuildWalletProjection, type WalletLedgerRowInput } from './engine';
export { applyCapChanges, reserveCaps, type CapContext, type CapsState } from './caps';
export {
  applyAwardToOrganizer,
  applyReversalToOrganizer,
  cloneOrganizer,
  cloneWallet,
  createOrganizer,
  createWallet,
  emptyOrganizerStats,
  emptyWalletStats,
} from './projections';
