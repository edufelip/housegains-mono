// Gamification visibility gate (contract C1): the Remote Config kill switch AND the household cohort.

/** Remote Config boolean; the bundled default is false (parameter unset reads as false). */
export const GAMIFICATION_FLAG_PARAM = 'gamification_enabled';

export type GamificationCohort = 'live' | 'control' | 'shadow';

export function parseCohort(value: unknown): GamificationCohort | null {
  return value === 'live' || value === 'control' || value === 'shadow' ? value : null;
}

/**
 * Gamification UI (toasts, badges, wallet, streak, organizer card, Ganhos chip) shows only when
 * `gamification_enabled === true` and `households/{hid}.gamificationCohort === 'live'`.
 * Control and shadow households, an unset flag and any unknown value see the app exactly as before.
 */
export function isGamificationVisible(input: {
  flagEnabled: boolean | null | undefined;
  cohort: unknown;
}): boolean {
  return input.flagEnabled === true && parseCohort(input.cohort) === 'live';
}
