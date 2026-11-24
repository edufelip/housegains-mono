import { loadActivatedGamificationFlag } from '@/features/gamification/flag-source';

const fakeFirebase = (
  globalThis as { mockFirebase?: { gamificationEnabled: boolean; remoteConfigFails: boolean } }
).mockFirebase!;

describe('gamification_enabled Remote Config flag', () => {
  beforeEach(() => {
    fakeFirebase.gamificationEnabled = false;
    fakeFirebase.remoteConfigFails = false;
  });
  afterEach(() => {
    fakeFirebase.remoteConfigFails = false;
  });

  test('is false by default (bundled default) once the activated values are loaded', async () => {
    expect(await loadActivatedGamificationFlag()).toBe(false);
  });

  test('is true only when the activated value is true', async () => {
    fakeFirebase.gamificationEnabled = true;
    expect(await loadActivatedGamificationFlag()).toBe(true);
  });

  test('reads false, without throwing, when Remote Config is unavailable', async () => {
    fakeFirebase.gamificationEnabled = true;
    fakeFirebase.remoteConfigFails = true;
    expect(await loadActivatedGamificationFlag()).toBe(false);
  });
});
