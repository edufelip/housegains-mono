import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/features/appearance';
import { AuthContext, type AuthValue } from '@/features/auth';
import {
  GamificationContext,
  GamificationProvider,
  INERT_GAMIFICATION,
  type GamificationViewModel,
} from '@/features/gamification/gamification-provider';
import { HouseGainsApp } from '@/features/housegains-screens';
import { CATALOG, type Chore, type HouseholdViewModel, type Instance } from '@/features/household';
import { HouseholdContext } from '@/features/household/household-provider';
import { LocaleProvider } from '@/localization/locale-context';
import { bia, fakeHousehold, fakeLedger, fakeWallet, me, metrics } from './gamification-support';
import type { Celebration } from '@/features/gamification/types';

const NOW = '2026-11-13T12:00:00.000Z';
let mockThemeId = 'arcade';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) =>
      key === 'housegains.appearance.v1'
        ? JSON.stringify({ version: 1, themeId: mockThemeId })
        : key === 'app.language.override'
          ? 'en-US'
          : null,
    ),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));
// The real provider runs in the "always on" test; its Firestore listeners are stubbed here.
jest.mock('@/features/gamification/firebase-gamification-client', () => ({
  subscribeToWallet: (_uid: string, onNext: (wallet: unknown) => void) => {
    const { fakeWallet: wallet } = jest.requireActual('./gamification-support');
    onNext(wallet());
    return () => undefined;
  },
  subscribeToWalletLedger: (_uid: string, onNext: (rows: unknown[]) => void) => {
    onNext([]);
    return () => undefined;
  },
  subscribeToOrganizer: () => () => undefined,
  subscribeToInbox: (_uid: string, onNext: (rows: unknown[]) => void) => {
    onNext([]);
    return () => undefined;
  },
  gamificationCalls: {
    ackCelebrations: async ({ ids }: { ids: string[] }) => ({ ok: true, acknowledged: ids.length }),
    setAwayWeeks: async ({ weekStarts }: { weekStarts: string[] }) => ({ weekStarts }),
  },
}));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}) }));
jest.mock('expo-camera', () => ({
  CameraView: 'View',
  useCameraPermissions: () => [{ granted: false }, jest.fn(async () => ({ granted: false }))],
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => undefined) }));

const template = CATALOG.find((chore) => chore.id === 'catalog-kitchen-blitz')!;
const chore: Chore = { ...template, assigneeIds: ['me'], isActive: true };
const DUE_AT = '2026-11-13T15:00:00.000Z';
const lastStep = chore.subtasks[chore.subtasks.length - 1];
// Every step but the last is done, so completing the last one finishes the chore.
const instance: Instance = {
  id: `${chore.id}:${DUE_AT}`,
  choreId: chore.id,
  dueAt: DUE_AT,
  subtasks: chore.subtasks,
  bonusXp: 0,
  assigneeIds: ['me'],
  status: 'partial',
  completions: chore.subtasks.slice(0, -1).map((subtask) => ({
    id: `c-${subtask.id}`,
    instanceId: `${chore.id}:${DUE_AT}`,
    subtaskId: subtask.id,
    memberId: 'me',
    xp: subtask.xp,
    completedAt: '2026-11-13T11:00:00.000Z',
    isAssist: false,
  })),
  bonusAwards: {},
};

function model(overrides: Partial<HouseholdViewModel> = {}): HouseholdViewModel {
  const noop = async () => undefined;
  const none = async () => ({ celebrations: [] as Celebration[] });
  return {
    hydrated: true,
    household: fakeHousehold(),
    currentMember: me,
    chores: [chore],
    instances: [instance],
    error: null,
    retryHydration: noop,
    createHousehold: noop,
    updateHousehold: noop,
    joinHousehold: noop,
    saveChore: noop,
    setAssignments: noop,
    pauseChore: noop,
    deleteChore: noop,
    completeSubtask: none,
    undoSubtask: noop,
    regenerateInvite: noop,
    finishSetup: noop,
    setupComplete: true,
    feed: [],
    postCompletion: none,
    weeklyTotals: { me: 0, bia: 0 },
    streak: 0,
    xpLedger: [],
    disputes: [],
    lastWeek: null,
    setMemberRole: noop,
    reportCompletion: noop,
    resolveDispute: noop,
    moderateInstance: noop,
    ...overrides,
  };
}

const auth = {
  status: 'signedIn',
  user: null,
  signInProblem: null,
  clearSignInProblem: () => undefined,
  signInWithApple: async () => undefined,
  signInWithGoogle: async () => undefined,
  signInWithEmail: async () => undefined,
  createAccountWithEmail: async () => undefined,
  sendPasswordReset: async () => undefined,
  signOut: async () => undefined,
} as AuthValue;

function visibleGamification(
  overrides: Partial<GamificationViewModel> = {},
): GamificationViewModel {
  return {
    ...INERT_GAMIFICATION,
    visible: true,
    walletStatus: 'ready',
    inboxStatus: 'ready',
    wallet: fakeWallet(),
    ledger: fakeLedger(),
    organizerStatus: 'ready',
    organizer: {
      memberId: 'me',
      zelo: 230,
      lifetimeZelo: 300,
      level: 2,
      streak: {
        current: 3,
        record: 4,
        lastCountedWeek: null,
        lastActionWeek: null,
        folgas: 0,
        folgaProgress: 0,
      },
      achievements: {},
      orderWeeks: [],
    },
    receiveActionCelebrations: jest.fn(),
    markBalanceSeen: jest.fn(),
    ...overrides,
  };
}

const signedIn = { ...auth, user: { uid: 'me' } } as unknown as AuthValue;

/** With a view model the context is fixed; without one the real GamificationProvider runs. */
async function renderApp(
  householdModel: HouseholdViewModel,
  gamification?: GamificationViewModel,
  authValue: AuthValue = auth,
) {
  const app = (
    <SafeAreaProvider initialMetrics={metrics}>
      <LocaleProvider>
        <ThemeProvider>
          <AuthContext.Provider value={authValue}>
            <HouseholdContext.Provider value={householdModel}>
              {gamification ? (
                <GamificationContext.Provider value={gamification}>
                  <HouseGainsApp />
                </GamificationContext.Provider>
              ) : (
                <GamificationProvider>
                  <HouseGainsApp />
                </GamificationProvider>
              )}
            </HouseholdContext.Provider>
          </AuthContext.Provider>
        </ThemeProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  );
  return render(app);
}

async function findByTestId(view: Awaited<ReturnType<typeof render>>, testId: string | RegExp) {
  let match: ReturnType<typeof view.getByTestId> | undefined;
  await waitFor(() => {
    match = view.getByTestId(testId);
  });
  return match!;
}

beforeEach(() => {
  mockThemeId = 'arcade';
  jest.useFakeTimers({
    now: new Date(NOW),
    doNotFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'nextTick',
      'queueMicrotask',
      'performance',
      'hrtime',
    ],
  });
});
afterEach(() => jest.useRealTimers());

describe('gamification is always on', () => {
  test('the real provider shows the Ganhos chip with no flag and no cohort on the household', async () => {
    const view = await renderApp(model(), undefined, signedIn);
    const chip = await findByTestId(view, 'housegains.ganhosChip');
    expect(view.getByTestId('housegains.ganhosChip.label')).toHaveTextContent('120 Gains');
    await fireEvent.press(chip);
    await findByTestId(view, 'housegains.wallet');
  });

  test.each(['arcade', 'sticker', 'soft'])(
    '%s: a Ganhos chip opens the wallet, the wallet opens the streak',
    async (themeId) => {
      mockThemeId = themeId;
      const view = await renderApp(model(), visibleGamification());
      const chip = await findByTestId(view, 'housegains.ganhosChip');
      expect(view.getByTestId('housegains.ganhosChip.label')).toHaveTextContent('120 Gains');
      await fireEvent.press(chip);
      await findByTestId(view, 'housegains.wallet');
      expect(view.getByTestId('housegains.wallet.balance')).toBeTruthy();
      await fireEvent.press(view.getByTestId('housegains.wallet.streak'));
      await findByTestId(view, 'housegains.streak');
      await fireEvent.press(view.getByTestId('housegains.streak.back'));
      await findByTestId(view, 'housegains.wallet');
      await fireEvent.press(view.getByTestId('housegains.wallet.back'));
      await findByTestId(view, /^housegains\.dashboard\.chore\./);
    },
  );

  test('Ranks shows the organizer card to every member', async () => {
    const view = await renderApp(model({ currentMember: bia }), visibleGamification());
    await findByTestId(view, /^housegains\.dashboard\.chore\./);
    await fireEvent.press(await findByTestId(view, 'housegains.dock.arcade.ranks'));
    await findByTestId(view, 'housegains.organizer.card');
    expect(view.getByTestId('housegains.organizer.zelo')).toHaveTextContent('230 Care');
    expect(within(view.getByTestId('housegains.organizer.card')).getByText('Edu')).toBeTruthy();
  });

  test('the response celebrations go to the queue with the completion context', async () => {
    const celebrations: Celebration[] = [
      {
        id: 'cel:toast:x',
        moment: 'toast',
        track: 'ganhos',
        amount: 25,
        copyKey: 'gami.earn.chore',
      },
      {
        id: 'cel:badge:closer:silver:me',
        moment: 'badge',
        track: 'ganhos',
        amount: 50,
        copyKey: 'gami.achievement.unlocked',
        achievementId: 'closer',
        tier: 'silver',
        fullScreen: true,
      },
    ];
    const completeSubtask = jest.fn(async () => ({ celebrations }));
    const gamification = visibleGamification({
      completionBadges: () => [celebrations[1]],
    });
    const view = await renderApp(model({ completeSubtask }), gamification);
    await fireEvent.press(await findByTestId(view, /^housegains\.dashboard\.chore\./));
    await fireEvent.press(await findByTestId(view, `housegains.choreDetail.done.${lastStep.id}`));
    await findByTestId(view, 'housegains.celebration');
    expect(gamification.receiveActionCelebrations).toHaveBeenCalledWith(celebrations, {
      instanceId: instance.id,
      completesInstance: true,
    });
    expect(view.getByTestId('housegains.celebration.badge.closer')).toBeTruthy();
  });
});
