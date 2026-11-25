/**
 * Scheduling rules for the "rate HouseGains" banner. Pure: no storage, no clock, no UI.
 *
 * There is deliberately no reward of any kind attached to rating (store policies forbid
 * incentivised ratings). Stores also never tell the app whether a rating was submitted, so
 * `ratedAt` means "the user tapped Rate", not "a rating exists".
 *
 * Timestamps are epoch milliseconds.
 */

export const RATING_PROMPT_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

export interface RatingPromptState {
  /** First time this user was seen on this install. */
  firstSeenAt: number | null;
  /** Last "Not now" (or a Rate tap that could not reach any store). */
  dismissedAt: number | null;
  /** The user tapped Rate. The banner never shows again. */
  ratedAt: number | null;
}

export const EMPTY_RATING_PROMPT_STATE: RatingPromptState = {
  firstSeenAt: null,
  dismissedAt: null,
  ratedAt: null,
};

function readTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Parses the stored JSON. Missing, unparsable or wrongly typed data degrades field by field to
 * "unknown" (null), which can only delay the banner (a lost `firstSeenAt` is recorded again).
 */
export function parseRatingPromptState(raw: string | null): RatingPromptState {
  if (raw === null) return EMPTY_RATING_PROMPT_STATE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_RATING_PROMPT_STATE;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return EMPTY_RATING_PROMPT_STATE;
  }
  const record = parsed as Record<string, unknown>;
  return {
    firstSeenAt: readTimestamp(record.firstSeenAt),
    dismissedAt: readTimestamp(record.dismissedAt),
    ratedAt: readTimestamp(record.ratedAt),
  };
}

export function serializeRatingPromptState(state: RatingPromptState): string {
  return JSON.stringify(state);
}

/**
 * Records `firstSeenAt` the first time the user is seen, and pulls timestamps that lie in the
 * future (the device clock went backwards) back to `now`, so a clock jump delays the banner by
 * at most one interval instead of hiding it for however far the clock had moved ahead.
 */
export function normalizeRatingPromptState(
  state: RatingPromptState,
  now: number,
): RatingPromptState {
  const clamp = (value: number | null): number | null =>
    value === null ? null : Math.min(value, now);
  return {
    firstSeenAt: state.firstSeenAt === null ? now : Math.min(state.firstSeenAt, now),
    dismissedAt: clamp(state.dismissedAt),
    ratedAt: state.ratedAt,
  };
}

/**
 * True when the banner should be on screen: the user has not rated, and 14 days have passed since
 * the last "Not now", or since they were first seen when they never dismissed it.
 */
export function shouldShowRatingPrompt(state: RatingPromptState, now: number): boolean {
  if (state.ratedAt !== null) return false;
  const since = state.dismissedAt ?? state.firstSeenAt;
  if (since === null) return false;
  return now - since >= RATING_PROMPT_INTERVAL_MS;
}

export function onRated(state: RatingPromptState, now: number): RatingPromptState {
  return { ...state, firstSeenAt: state.firstSeenAt ?? now, ratedAt: now };
}

export function onDismissed(state: RatingPromptState, now: number): RatingPromptState {
  return { ...state, firstSeenAt: state.firstSeenAt ?? now, dismissedAt: now };
}
