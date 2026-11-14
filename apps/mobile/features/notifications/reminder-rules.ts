// Pure reminder rules: no native imports, so they run under `bun test`.
export const MAX_FCM_TOKENS = 10;

/**
 * Adds this device's token as the newest entry and keeps at most `max` tokens,
 * dropping the oldest. Non-string entries are discarded.
 */
export function nextFcmTokens(
  existing: unknown,
  token: string,
  max: number = MAX_FCM_TOKENS,
): string[] {
  const kept = Array.isArray(existing)
    ? existing.filter((value): value is string => typeof value === 'string' && value !== token)
    : [];
  return [...kept, token].slice(-max);
}
