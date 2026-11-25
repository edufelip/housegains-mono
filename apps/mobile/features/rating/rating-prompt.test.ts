import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EMPTY_RATING_PROMPT_STATE,
  RATING_PROMPT_INTERVAL_MS as INTERVAL,
  normalizeRatingPromptState,
  onDismissed,
  onRated,
  parseRatingPromptState,
  serializeRatingPromptState,
  shouldShowRatingPrompt,
  type RatingPromptState,
} from './rating-prompt';

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 0, 1);

function seenAt(at: number): RatingPromptState {
  return normalizeRatingPromptState(EMPTY_RATING_PROMPT_STATE, at);
}

describe('shouldShowRatingPrompt', () => {
  it('is hidden before the user has ever been seen', () => {
    assert.equal(shouldShowRatingPrompt(EMPTY_RATING_PROMPT_STATE, START + 100 * DAY), false);
  });

  it('is hidden on day 0 and until 14 days have passed', () => {
    const state = seenAt(START);
    assert.equal(shouldShowRatingPrompt(state, START), false);
    assert.equal(shouldShowRatingPrompt(state, START + 13 * DAY), false);
    assert.equal(shouldShowRatingPrompt(state, START + INTERVAL - 1), false);
  });

  it('is shown from day 14', () => {
    const state = seenAt(START);
    assert.equal(shouldShowRatingPrompt(state, START + INTERVAL), true);
    assert.equal(shouldShowRatingPrompt(state, START + 40 * DAY), true);
  });

  it('after "Not now" stays hidden until 14 days later, then shows again', () => {
    const dismissedAt = START + 20 * DAY;
    const state = onDismissed(seenAt(START), dismissedAt);
    assert.equal(shouldShowRatingPrompt(state, dismissedAt), false);
    assert.equal(shouldShowRatingPrompt(state, dismissedAt + 13 * DAY), false);
    assert.equal(shouldShowRatingPrompt(state, dismissedAt + INTERVAL), true);
  });

  it('repeats the 14 day cycle after every dismissal', () => {
    const first = onDismissed(seenAt(START), START + 14 * DAY);
    const second = onDismissed(first, START + 28 * DAY);
    assert.equal(shouldShowRatingPrompt(second, START + 41 * DAY), false);
    assert.equal(shouldShowRatingPrompt(second, START + 42 * DAY), true);
  });

  it('never shows again once the user tapped Rate, even years later', () => {
    const state = onRated(seenAt(START), START + 15 * DAY);
    assert.equal(shouldShowRatingPrompt(state, START + 15 * DAY), false);
    assert.equal(shouldShowRatingPrompt(state, START + 15 * DAY + INTERVAL), false);
    assert.equal(shouldShowRatingPrompt(state, START + 5 * 365 * DAY), false);
  });

  it('keeps rated even after an earlier dismissal', () => {
    const state = onRated(onDismissed(seenAt(START), START + 14 * DAY), START + 30 * DAY);
    assert.equal(shouldShowRatingPrompt(state, START + 400 * DAY), false);
  });

  it('is hidden while the clock is behind the recorded timestamps', () => {
    const state = seenAt(START);
    assert.equal(shouldShowRatingPrompt(state, START - 30 * DAY), false);
    const dismissed = onDismissed(state, START + 30 * DAY);
    assert.equal(shouldShowRatingPrompt(dismissed, START + 20 * DAY), false);
  });
});

describe('onRated / onDismissed', () => {
  it('record only their own timestamp and do not mutate the input', () => {
    const state = seenAt(START);
    const rated = onRated(state, START + DAY);
    const dismissed = onDismissed(state, START + 2 * DAY);
    assert.deepEqual(rated, { firstSeenAt: START, dismissedAt: null, ratedAt: START + DAY });
    assert.deepEqual(dismissed, {
      firstSeenAt: START,
      dismissedAt: START + 2 * DAY,
      ratedAt: null,
    });
    assert.deepEqual(state, { firstSeenAt: START, dismissedAt: null, ratedAt: null });
  });

  it('fill in firstSeenAt when it was never recorded', () => {
    assert.equal(onRated(EMPTY_RATING_PROMPT_STATE, START).firstSeenAt, START);
    assert.equal(onDismissed(EMPTY_RATING_PROMPT_STATE, START).firstSeenAt, START);
  });
});

describe('parseRatingPromptState', () => {
  it('round-trips a serialized state', () => {
    const state: RatingPromptState = {
      firstSeenAt: START,
      dismissedAt: START + DAY,
      ratedAt: null,
    };
    assert.deepEqual(parseRatingPromptState(serializeRatingPromptState(state)), state);
  });

  it('treats missing storage as an empty state', () => {
    assert.deepEqual(parseRatingPromptState(null), EMPTY_RATING_PROMPT_STATE);
  });

  it('treats unparsable or non-object JSON as an empty state', () => {
    for (const raw of ['', '{', 'not json', 'null', '42', '"text"', '[1,2]']) {
      assert.deepEqual(parseRatingPromptState(raw), EMPTY_RATING_PROMPT_STATE, raw);
    }
  });

  it('drops wrongly typed or invalid fields one by one', () => {
    const state = parseRatingPromptState(
      JSON.stringify({ firstSeenAt: 'yesterday', dismissedAt: -5, ratedAt: START }),
    );
    assert.deepEqual(state, { firstSeenAt: null, dismissedAt: null, ratedAt: START });
    assert.deepEqual(
      parseRatingPromptState('{"firstSeenAt":1e999,"dismissedAt":null}'),
      EMPTY_RATING_PROMPT_STATE,
    );
  });

  it('corrupt storage only delays the banner: it is hidden until firstSeenAt is recorded again', () => {
    const now = START + 100 * DAY;
    const parsed = parseRatingPromptState('{broken');
    assert.equal(shouldShowRatingPrompt(parsed, now), false);
    const recorded = normalizeRatingPromptState(parsed, now);
    assert.equal(recorded.firstSeenAt, now);
    assert.equal(shouldShowRatingPrompt(recorded, now), false);
    assert.equal(shouldShowRatingPrompt(recorded, now + INTERVAL), true);
  });
});

describe('normalizeRatingPromptState', () => {
  it('records firstSeenAt once and keeps it afterwards', () => {
    const first = normalizeRatingPromptState(EMPTY_RATING_PROMPT_STATE, START);
    assert.equal(first.firstSeenAt, START);
    assert.equal(normalizeRatingPromptState(first, START + 5 * DAY).firstSeenAt, START);
  });

  it('pulls future timestamps back to now when the clock went backwards', () => {
    const now = START + 10 * DAY;
    const state = normalizeRatingPromptState(
      { firstSeenAt: START + 400 * DAY, dismissedAt: START + 500 * DAY, ratedAt: null },
      now,
    );
    assert.deepEqual(state, { firstSeenAt: now, dismissedAt: now, ratedAt: null });
    // Delayed by at most one interval from the corrected clock, not by the clock jump.
    assert.equal(shouldShowRatingPrompt(state, now + INTERVAL), true);
  });

  it('leaves ratedAt untouched', () => {
    const state = normalizeRatingPromptState(
      { firstSeenAt: START, dismissedAt: null, ratedAt: START + 500 * DAY },
      START + DAY,
    );
    assert.equal(state.ratedAt, START + 500 * DAY);
    assert.equal(shouldShowRatingPrompt(state, START + 900 * DAY), false);
  });
});
