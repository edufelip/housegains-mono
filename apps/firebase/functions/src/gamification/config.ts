import { db } from '../admin';
import { GAMI_CONFIG_PATH, gamiRuleSetPath } from './paths';
import {
  cohortFor,
  DEFAULT_RULE_SET,
  validateRuleSet,
  type Cohort,
  type RolloutMode,
  type RuleSet,
} from '../domain/gamification';

// gamification/config (C1) plus the published rule set it points at, cached
// briefly per function instance (other instances pick a publish up within
// CACHE_MS). Under the emulator the cache is off so tests can flip the config
// between calls.

export interface GamiConfig {
  mode: RolloutMode;
  ruleSetVersion: number | null;
  rules: RuleSet;
  cohortSalt: string;
  livePercent: number;
  controlPercent: number;
}

const CACHE_MS = process.env.FIRESTORE_EMULATOR_HOST ? 0 : 60_000;
let cache: { value: GamiConfig; at: number } | null = null;

const OFF_CONFIG: GamiConfig = {
  mode: 'off',
  ruleSetVersion: null,
  rules: DEFAULT_RULE_SET,
  cohortSalt: '',
  livePercent: 0,
  controlPercent: 0,
};

/** Drops this instance's cached config; the admin callables call it after a config or publish change. */
export function invalidateGamiConfigCache(): void {
  cache = null;
}

export async function loadGamiConfig(): Promise<GamiConfig> {
  if (cache !== null && Date.now() - cache.at < CACHE_MS) return cache.value;
  const value = await readGamiConfig();
  cache = { value, at: Date.now() };
  return value;
}

/** The config and its published rule set straight from Firestore, bypassing the cache. */
export async function readGamiConfig(): Promise<GamiConfig> {
  const snap = await db().doc(GAMI_CONFIG_PATH).get();
  if (!snap.exists) return OFF_CONFIG;
  const d = snap.data()!;
  const mode: RolloutMode = d.mode === 'shadow' || d.mode === 'live' ? d.mode : 'off';
  const cohortSalt = typeof d.cohortSalt === 'string' ? d.cohortSalt : '';
  const livePercent = clampPercent(d.livePercent);
  const controlPercent = clampPercent(d.controlPercent);
  const base = { mode, cohortSalt, livePercent, controlPercent };
  const activeVersion =
    typeof d.activeVersion === 'number' && Number.isInteger(d.activeVersion) && d.activeVersion > 0
      ? d.activeVersion
      : null;
  if (activeVersion === null) return { ...base, ruleSetVersion: null, rules: DEFAULT_RULE_SET };

  const rulesSnap = await db().doc(gamiRuleSetPath(activeVersion)).get();
  const validated = validateRuleSet(rulesSnap.exists ? rulesSnap.get('rules') : undefined);
  if (validated.ok) return { ...base, ruleSetVersion: activeVersion, rules: validated.rules };
  console.warn('gamification rule set invalid; falling back to DEFAULT_RULE_SET', {
    version: activeVersion,
    errors: validated.errors.slice(0, 5),
  });
  return { ...base, ruleSetVersion: null, rules: DEFAULT_RULE_SET };
}

function clampPercent(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

/** The household's cohort under the current config (C1); recomputed every engine run. */
export function cohortOf(householdId: string, config: GamiConfig): Cohort {
  return cohortFor(householdId, {
    cohortSalt: config.cohortSalt,
    livePercent: config.livePercent,
    controlPercent: config.controlPercent,
  });
}
