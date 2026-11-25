// Deterministic ledger and cap keys (contract C3).
//
// Wallet ledger key: `{ruleId}:{sourceRef}:{memberId}` with '/' in sourceRef
// replaced by '|'. Reversal key: `rev:{originalKey}`.
//
// Cap counters live in the projection `caps` map and are keyed by the local
// date or week (household timeZone), e.g. "day:2026-11-24:ganhos" or
// "day:2026-11-24:earn.assist:target:uidB".

export function escapeRef(sourceRef: string): string {
  return sourceRef.replace(/\//g, '|');
}

export function walletKey(ruleId: string, sourceRef: string, memberId: string): string {
  return `${ruleId}:${escapeRef(sourceRef)}:${memberId}`;
}

export function reversalKey(key: string): string {
  return `rev:${key}`;
}

// ---- amount pools (shared across rules; trim the award) --------------------------

export function dailyGanhosCapKey(dateKey: string): string {
  return `day:${dateKey}:ganhos`;
}

export function instanceGanhosCapKey(instanceId: string): string {
  return `instance:${escapeRef(instanceId)}:ganhos`;
}

export function zeloWeekCapKey(weekStart: string): string {
  return `week:${weekStart}:zelo`;
}

// ---- per-rule occurrence counters ------------------------------------------------

function periodKeyFor(window: 'day' | 'week' | 'life', dateKey: string, weekStart: string): string {
  if (window === 'day') return dateKey;
  if (window === 'week') return weekStart;
  return '';
}

export function ruleCapKey(ruleId: string, window: 'day' | 'week' | 'life', period: string): string {
  if (window === 'day') return `day:${period}:${ruleId}`;
  if (window === 'week') return `week:${period}:${ruleId}`;
  return `life:${ruleId}`;
}

export function targetCapKey(ruleId: string, window: 'day' | 'week' | 'life', period: string, targetId: string): string {
  const base = ruleCapKey(ruleId, window, period);
  return `${base}:target:${targetId}`;
}

export function householdCapKey(ruleId: string, window: 'day' | 'week' | 'life', period: string): string {
  if (window === 'week') return `hh:${ruleId}:${period}`;
  if (window === 'day') return `hh:${ruleId}:day:${period}`;
  return `hh:${ruleId}`;
}
