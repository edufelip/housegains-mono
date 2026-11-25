import { db } from '../admin';
import { GAMI_CONFIG_PATH, gamiRuleSetPath } from './paths';
import { DEFAULT_RULE_SET, validateRuleSet, type RuleSet } from '../domain/gamification';

// gamification/config (C1): only the rule-set pointer (`activeVersion`), plus the published rule
// set it points at, cached briefly per function instance (other instances pick a publish up
// within CACHE_MS). The program itself is always on: a missing config doc means DEFAULT_RULE_SET.
// Under the emulator the cache is off so tests can flip the config between calls.

export interface GamiConfig {
  ruleSetVersion: number | null;
  rules: RuleSet;
}

const CACHE_MS = process.env.FIRESTORE_EMULATOR_HOST ? 0 : 60_000;
let cache: { value: GamiConfig; at: number } | null = null;

const DEFAULT_CONFIG: GamiConfig = { ruleSetVersion: null, rules: DEFAULT_RULE_SET };

/** Drops this instance's cached config; the admin callables call it after a publish or rollback. */
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
  if (!snap.exists) return DEFAULT_CONFIG;
  const d = snap.data()!;
  const activeVersion =
    typeof d.activeVersion === 'number' && Number.isInteger(d.activeVersion) && d.activeVersion > 0
      ? d.activeVersion
      : null;
  if (activeVersion === null) return DEFAULT_CONFIG;

  const rulesSnap = await db().doc(gamiRuleSetPath(activeVersion)).get();
  const validated = validateRuleSet(rulesSnap.exists ? rulesSnap.get('rules') : undefined);
  if (validated.ok) return { ruleSetVersion: activeVersion, rules: validated.rules };
  console.warn('gamification rule set invalid; falling back to DEFAULT_RULE_SET', {
    version: activeVersion,
    errors: validated.errors.slice(0, 5),
  });
  return DEFAULT_CONFIG;
}
