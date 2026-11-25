import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as StoreReview from 'expo-store-review';
import { Linking } from 'react-native';
import { AuthContext, type AuthValue } from '@/features/auth';
import { RatingBanner } from '@/features/rating';
import { RATING_PROMPT_INTERVAL_MS } from '@/features/rating/rating-prompt';
import { ratingPromptKey } from '@/features/rating/rating-prompt-storage';

const mockStore = new Map<string, string>();
let mockFailReads = false;

// Plain functions, not jest.fn: restoreMocks would reset a jest.fn implementation after each test.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => {
      if (mockFailReads) throw new Error('disk unavailable');
      return mockStore.get(key) ?? null;
    },
    setItem: async (key: string, value: string) => {
      mockStore.set(key, value);
    },
    removeItem: async (key: string) => {
      mockStore.delete(key);
    },
  },
}));
jest.mock('@/features/appearance', () => {
  const { getThemeTokens } = jest.requireActual('@/features/appearance/tokens');
  return {
    getThemeTokens,
    useAppearance: () => ({ themeId: 'arcade', tokens: getThemeTokens('arcade') }),
  };
});
jest.mock('@/localization/housegains', () => {
  const { translateHouseGains } = jest.requireActual('@/localization/housegains/catalog');
  return {
    useHouseGainsTranslation: () => ({
      locale: 'en-US',
      t: (key: string, params?: Record<string, string | number>) =>
        translateHouseGains('en-US', key, params),
    }),
  };
});

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1);
const UID = 'user-1';
const KEY = ratingPromptKey(UID);

function authValue(uid: string | null): AuthValue {
  const noop = async () => undefined;
  return {
    status: uid ? 'signedIn' : 'signedOut',
    user: uid ? ({ uid } as unknown as AuthValue['user']) : null,
    signInProblem: null,
    clearSignInProblem: () => undefined,
    signInWithApple: noop,
    signInWithGoogle: noop,
    signInWithEmail: noop,
    createAccountWithEmail: noop,
    sendPasswordReset: noop,
    signOut: noop,
  };
}

function tree(now: number, uid: string | null, instance: number) {
  return (
    <AuthContext.Provider value={authValue(uid)}>
      <RatingBanner key={instance} now={() => now} />
    </AuthContext.Provider>
  );
}

// Let the chained async storage reads and writes settle (a macrotask drains every microtask).
async function settle() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

async function renderBanner(now: number, uid: string | null = UID) {
  const view = await render(tree(now, uid, 0));
  await settle();
  let instance = 0;
  return {
    /** A fresh mount of the banner, like reopening the app, at a later time. */
    async remount(at: number) {
      instance += 1;
      await view.rerender(tree(at, uid, instance));
      await settle();
    },
  };
}

function seed(state: Record<string, number | null>) {
  mockStore.set(KEY, JSON.stringify(state));
}

const bannerId = 'housegains.rating.banner';

beforeEach(() => {
  mockStore.clear();
  mockFailReads = false;
  jest.mocked(StoreReview.hasAction).mockResolvedValue(true);
  jest.mocked(StoreReview.isAvailableAsync).mockResolvedValue(true);
  jest.mocked(StoreReview.requestReview).mockResolvedValue(undefined);
  jest.mocked(StoreReview.storeUrl).mockReturnValue('https://example.test/store');
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('RatingBanner', () => {
  test('is hidden on the first day and records when the user was first seen', async () => {
    await renderBanner(T0);
    expect(screen.queryByTestId(bannerId)).toBeNull();
    expect(JSON.parse(mockStore.get(KEY) ?? 'null')).toEqual({
      firstSeenAt: T0,
      dismissedAt: null,
      ratedAt: null,
    });
  });

  test('renders nothing for a signed-out user and stores nothing', async () => {
    await renderBanner(T0 + 30 * DAY, null);
    expect(screen.queryByTestId(bannerId)).toBeNull();
    expect(mockStore.size).toBe(0);
  });

  test('renders with accessible Rate and Not now buttons once 14 days have passed', async () => {
    seed({ firstSeenAt: T0, dismissedAt: null, ratedAt: null });
    await renderBanner(T0 + RATING_PROMPT_INTERVAL_MS);
    expect(screen.getByTestId(bannerId)).toBeTruthy();
    expect(screen.getByText('Enjoying HouseGains?')).toBeTruthy();
    expect(screen.getByLabelText('Rate HouseGains in the store')).toBeTruthy();
    expect(screen.getByLabelText('Not now, ask again in two weeks')).toBeTruthy();
    expect(screen.getByText('Rate HouseGains')).toBeTruthy();
    expect(screen.getByText('Not now')).toBeTruthy();
  });

  test('Rate requests the native review, hides the banner and it stays gone after remount', async () => {
    seed({ firstSeenAt: T0, dismissedAt: null, ratedAt: null });
    const first = await renderBanner(T0 + 20 * DAY);
    await fireEvent.press(screen.getByTestId('housegains.rating.rate'));
    await settle();
    await waitFor(() => expect(screen.queryByTestId(bannerId)).toBeNull());
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(JSON.parse(mockStore.get(KEY) ?? 'null')).toMatchObject({ ratedAt: T0 + 20 * DAY });

    await first.remount(T0 + 5 * 365 * DAY);
    expect(screen.queryByTestId(bannerId)).toBeNull();
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
  });

  test('Rate opens the store page when the native dialog is unavailable', async () => {
    jest.mocked(StoreReview.isAvailableAsync).mockResolvedValue(false);
    seed({ firstSeenAt: T0, dismissedAt: null, ratedAt: null });
    await renderBanner(T0 + 20 * DAY);
    await fireEvent.press(screen.getByTestId('housegains.rating.rate'));
    await settle();
    await waitFor(() => expect(screen.queryByTestId(bannerId)).toBeNull());
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
    expect(Linking.openURL).toHaveBeenCalledWith('https://example.test/store');
    expect(JSON.parse(mockStore.get(KEY) ?? 'null')).toMatchObject({ ratedAt: T0 + 20 * DAY });
  });

  test('Rate with no way to reach a store is not recorded as rated and asks again in 14 days', async () => {
    jest.mocked(StoreReview.hasAction).mockResolvedValue(false);
    seed({ firstSeenAt: T0, dismissedAt: null, ratedAt: null });
    const first = await renderBanner(T0 + 20 * DAY);
    await fireEvent.press(screen.getByTestId('housegains.rating.rate'));
    await settle();
    await waitFor(() => expect(screen.queryByTestId(bannerId)).toBeNull());
    expect(JSON.parse(mockStore.get(KEY) ?? 'null')).toEqual({
      firstSeenAt: T0,
      dismissedAt: T0 + 20 * DAY,
      ratedAt: null,
    });
    await first.remount(T0 + 34 * DAY);
    expect(screen.getByTestId(bannerId)).toBeTruthy();
  });

  test('a failing review request is logged and does not count as rated', async () => {
    jest.mocked(StoreReview.requestReview).mockRejectedValue(new Error('os refused'));
    seed({ firstSeenAt: T0, dismissedAt: null, ratedAt: null });
    await renderBanner(T0 + 20 * DAY);
    await fireEvent.press(screen.getByTestId('housegains.rating.rate'));
    await settle();
    await waitFor(() => expect(screen.queryByTestId(bannerId)).toBeNull());
    expect(console.warn).toHaveBeenCalled();
    expect(JSON.parse(mockStore.get(KEY) ?? 'null')).toMatchObject({ ratedAt: null });
  });

  test('Not now hides the banner, shows it again only 14 days later', async () => {
    seed({ firstSeenAt: T0, dismissedAt: null, ratedAt: null });
    const first = await renderBanner(T0 + 20 * DAY);
    await fireEvent.press(screen.getByTestId('housegains.rating.notNow'));
    await settle();
    await waitFor(() => expect(screen.queryByTestId(bannerId)).toBeNull());
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
    expect(JSON.parse(mockStore.get(KEY) ?? 'null')).toMatchObject({
      dismissedAt: T0 + 20 * DAY,
      ratedAt: null,
    });

    await first.remount(T0 + 33 * DAY);
    expect(screen.queryByTestId(bannerId)).toBeNull();
    await first.remount(T0 + 34 * DAY);
    expect(screen.getByTestId(bannerId)).toBeTruthy();
  });

  test('the state is kept per user', async () => {
    seed({ firstSeenAt: T0, dismissedAt: null, ratedAt: T0 + 15 * DAY });
    await renderBanner(T0 + 40 * DAY, 'someone-else');
    expect(screen.queryByTestId(bannerId)).toBeNull();
    // A different user is first seen now, so their own 14 days start now.
    expect(JSON.parse(mockStore.get(ratingPromptKey('someone-else')) ?? 'null')).toMatchObject({
      firstSeenAt: T0 + 40 * DAY,
      ratedAt: null,
    });
    expect(JSON.parse(mockStore.get(KEY) ?? 'null')).toMatchObject({ ratedAt: T0 + 15 * DAY });
  });

  test('a storage failure is logged and keeps the banner hidden without crashing', async () => {
    mockFailReads = true;
    await renderBanner(T0 + 40 * DAY);
    expect(screen.queryByTestId(bannerId)).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  test('corrupt stored state starts over instead of showing the banner', async () => {
    mockStore.set(KEY, '{definitely not json');
    await renderBanner(T0 + 40 * DAY);
    expect(screen.queryByTestId(bannerId)).toBeNull();
    expect(JSON.parse(mockStore.get(KEY) ?? 'null')).toMatchObject({ firstSeenAt: T0 + 40 * DAY });
  });

  test('a Rate tap pending while another user signs in is saved for the user who tapped', async () => {
    const OTHER = 'user-2';
    seed({ firstSeenAt: T0, dismissedAt: null, ratedAt: null });
    mockStore.set(
      ratingPromptKey(OTHER),
      JSON.stringify({ firstSeenAt: T0, dismissedAt: null, ratedAt: null }),
    );
    let finishReview: () => void = () => undefined;
    jest.mocked(StoreReview.requestReview).mockReturnValue(
      new Promise<void>((resolve) => {
        finishReview = resolve;
      }),
    );
    const at = T0 + 14 * DAY;
    const view = await render(
      <AuthContext.Provider value={authValue(UID)}>
        <RatingBanner now={() => at} />
      </AuthContext.Provider>,
    );
    await settle();
    await fireEvent.press(screen.getByTestId('housegains.rating.rate'));
    await settle();

    await view.rerender(
      <AuthContext.Provider value={authValue(OTHER)}>
        <RatingBanner now={() => at} />
      </AuthContext.Provider>,
    );
    await settle();
    expect(screen.getByTestId(bannerId)).toBeTruthy();

    await act(async () => {
      finishReview();
    });
    await settle();

    expect(JSON.parse(mockStore.get(KEY) ?? 'null').ratedAt).toBe(at);
    expect(JSON.parse(mockStore.get(ratingPromptKey(OTHER)) ?? 'null').ratedAt).toBeNull();
    expect(screen.getByTestId(bannerId)).toBeTruthy();
  });

  test('a second tap while Rate is still pending does nothing', async () => {
    seed({ firstSeenAt: T0, dismissedAt: null, ratedAt: null });
    let finishReview: () => void = () => undefined;
    jest.mocked(StoreReview.requestReview).mockReturnValue(
      new Promise<void>((resolve) => {
        finishReview = resolve;
      }),
    );
    await renderBanner(T0 + 14 * DAY);
    await fireEvent.press(screen.getByTestId('housegains.rating.rate'));
    await fireEvent.press(screen.getByTestId('housegains.rating.rate'));
    await fireEvent.press(screen.getByTestId('housegains.rating.notNow'));
    await act(async () => {
      finishReview();
    });
    await settle();

    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(mockStore.get(KEY) ?? 'null');
    expect(stored.ratedAt).toBe(T0 + 14 * DAY);
    expect(stored.dismissedAt).toBeNull();
    expect(screen.queryByTestId(bannerId)).toBeNull();
  });
});
