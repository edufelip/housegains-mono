// Rollout cohorts (contract C1). Pure: the engine itself never reads config;
// the wiring layer uses these to decide whether to persist and celebrate.

export type Cohort = 'live' | 'control' | 'shadow';
export type RolloutMode = 'off' | 'shadow' | 'live';

const FNV_OFFSET_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;

/** FNV-1a 32-bit hash, as unsigned. */
export function fnv1a32(value: string): number {
  let hash = FNV_OFFSET_32;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME_32) >>> 0;
  }
  return hash >>> 0;
}

export interface CohortConfig {
  cohortSalt: string;
  livePercent: number;
  controlPercent: number;
}

/**
 * Household cohort: h = fnv1a32(householdId + cohortSalt) % 100;
 * h < livePercent -> live, h < livePercent + controlPercent -> control.
 */
export function cohortFor(householdId: string, config: CohortConfig): Cohort {
  const h = fnv1a32(householdId + config.cohortSalt) % 100;
  if (h < config.livePercent) return 'live';
  if (h < config.livePercent + config.controlPercent) return 'control';
  return 'shadow';
}

/**
 * What the engine's outputs may do under a rollout mode.
 * - off: nothing at all.
 * - shadow (or a control/shadow household under live): ledgers and projections
 *   are written, but no celebrations, inbox rows or FCM.
 * - live + live cohort: everything.
 */
export function visibility(mode: RolloutMode, cohort: Cohort): { write: boolean; celebrate: boolean } {
  if (mode === 'off') return { write: false, celebrate: false };
  if (mode === 'live' && cohort === 'live') return { write: true, celebrate: true };
  return { write: true, celebrate: false };
}
