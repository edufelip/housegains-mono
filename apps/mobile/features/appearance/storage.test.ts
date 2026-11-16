import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readAppearancePreference, writeAppearancePreference } from './storage';

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

describe('HouseGains appearance storage', () => {
  it('reads a supported versioned theme choice', async () => {
    storage.getItem = async (key) => {
      assert.equal(key, 'housegains.appearance.v1');
      return JSON.stringify({ version: 1, themeId: 'soft' });
    };

    assert.deepEqual(await readAppearancePreference(), { status: 'present', themeId: 'soft' });
  });

  it('treats absent or invalid records as no saved choice', async () => {
    storage.getItem = async () => JSON.stringify({ version: 7, themeId: 'arcade' });
    assert.deepEqual(await readAppearancePreference(), { status: 'invalid' });

    storage.getItem = async () => null;
    assert.deepEqual(await readAppearancePreference(), { status: 'absent' });
  });

  it('writes the selected theme under the versioned key', async () => {
    const writes: { key: string; value: string }[] = [];
    storage.setItem = async (key, value) => {
      writes.push({ key, value });
    };

    await writeAppearancePreference('sticker');

    assert.deepEqual(writes, [
      {
        key: 'housegains.appearance.v1',
        value: JSON.stringify({ version: 1, themeId: 'sticker' }),
      },
    ]);
  });

  it('accepts config-defined style ids and keeps the saved composition', async () => {
    storage.getItem = async () =>
      JSON.stringify({ version: 1, themeId: 'midnight', composition: 'arcade' });
    assert.deepEqual(await readAppearancePreference(), {
      status: 'present',
      themeId: 'midnight',
      composition: 'arcade',
    });

    storage.getItem = async () =>
      JSON.stringify({ version: 1, themeId: 'midnight', composition: 'neon' });
    assert.deepEqual(await readAppearancePreference(), { status: 'present', themeId: 'midnight' });

    storage.getItem = async () => JSON.stringify({ version: 1, themeId: 'Not An Id' });
    assert.deepEqual(await readAppearancePreference(), { status: 'invalid' });
  });

  it('writes the composition next to the style id when given', async () => {
    const writes: string[] = [];
    storage.setItem = async (_key, value) => {
      writes.push(value);
    };

    await writeAppearancePreference('midnight', 'arcade');
    await assert.rejects(writeAppearancePreference('Bad Id'), TypeError);

    assert.deepEqual(writes, [
      JSON.stringify({ version: 1, themeId: 'midnight', composition: 'arcade' }),
    ]);
  });

  it('surfaces read failures so the provider can offer retry', async () => {
    const failure = new Error('storage unavailable');
    storage.getItem = async () => {
      throw failure;
    };

    await assert.rejects(readAppearancePreference(), failure);
  });
});
