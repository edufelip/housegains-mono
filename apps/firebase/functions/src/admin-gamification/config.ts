// gamification/config (C1) holds only the rule-set pointer. The program itself has no switch; the
// document is read leniently, exactly like the runner does (versions must be positive integers).
// Publish and rollback (rule-sets.ts) are the only writers.

export interface RuleSetPointer {
  activeVersion: number | null;
  previousVersion: number | null;
}

export function configFromDoc(data: Record<string, unknown> | undefined): RuleSetPointer {
  const d = data ?? {};
  const version = (value: unknown): number | null =>
    typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
  return {
    activeVersion: version(d.activeVersion),
    previousVersion: version(d.previousVersion),
  };
}
