import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_RATING_PROMPT_STATE } from './rating-prompt';
import {
  loadRatingPromptState,
  ratingPromptKey,
  saveRatingPromptState,
} from './rating-prompt-storage';

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

const storage = AsyncStorage as unknown as AsyncStorageLike;
const originalGetItem = storage.getItem;
const originalSetItem = storage.setItem;

afterEach(() => {
  storage.getItem = originalGetItem;
  storage.setItem = originalSetItem;
});

describe('rating prompt storage', () => {
  it('keys the state by user uid', () => {
    assert.notEqual(ratingPromptKey('a'), ratingPromptKey('b'));
    assert.ok(ratingPromptKey('uid-1').endsWith('uid-1'));
  });

  it('saves and loads per user', async () => {
    const values = new Map<string, string>();
    storage.getItem = async (key) => values.get(key) ?? null;
    storage.setItem = async (key, value) => {
      values.set(key, value);
    };
    await saveRatingPromptState('a', { firstSeenAt: 1, dismissedAt: 2, ratedAt: null });
    assert.deepEqual(await loadRatingPromptState('a'), {
      firstSeenAt: 1,
      dismissedAt: 2,
      ratedAt: null,
    });
    assert.deepEqual(await loadRatingPromptState('b'), EMPTY_RATING_PROMPT_STATE);
  });

  it('loads corrupt stored text as an empty state', async () => {
    storage.getItem = async () => '{oops';
    assert.deepEqual(await loadRatingPromptState('a'), EMPTY_RATING_PROMPT_STATE);
  });

  it('rejects when storage fails so callers can log it', async () => {
    storage.getItem = async () => {
      throw new Error('disk');
    };
    storage.setItem = async () => {
      throw new Error('disk');
    };
    await assert.rejects(loadRatingPromptState('a'), /disk/);
    await assert.rejects(saveRatingPromptState('a', EMPTY_RATING_PROMPT_STATE), /disk/);
  });
});
