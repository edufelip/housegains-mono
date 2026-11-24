import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/features/appearance';
import { AuthContext, type AuthValue } from '@/features/auth';
import { HouseGainsApp } from '@/features/housegains-screens';
import {
  CATALOG,
  type Chore,
  type Household,
  type HouseholdViewModel,
  type Instance,
  type Member,
} from '@/features/household';
import { HouseholdContext } from '@/features/household/household-provider';
import { LocaleProvider } from '@/localization/locale-context';

const NOW = '2026-11-13T12:00:00.000Z';
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

let mockRouteParams: { code?: string | string[] } = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) =>
      key === 'housegains.appearance.v1'
        ? JSON.stringify({ version: 1, themeId: 'arcade' })
        : key === 'app.language.override'
          ? 'en-US'
          : null,
    ),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
}));

jest.mock('expo-camera', () => ({
  CameraView: 'View',
  useCameraPermissions: () => [{ granted: false }, jest.fn(async () => ({ granted: false }))],
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => undefined),
}));

jest.mock('@expo/vector-icons', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const Icon = (props: { name: string; color?: string; size?: number }) =>
    React.createElement(Text, { style: { color: props.color, fontSize: props.size } }, props.name);
  return { Ionicons: Icon, MaterialIcons: Icon };
});

const me: Member = { id: 'me', name: 'Edu', initials: 'ED', color: '#FFD33D', role: 'creator' };
const template = CATALOG.find((chore) => chore.id === 'catalog-kitchen-blitz')!;
const chore: Chore = { ...template, assigneeIds: ['me'], isActive: true };
// Due after the fake clock, so the step is still open.
const DUE_AT = '2026-11-13T15:00:00.000Z';
const instance: Instance = {
  id: `${chore.id}:${DUE_AT}`,
  choreId: chore.id,
  dueAt: DUE_AT,
  subtasks: chore.subtasks,
  bonusXp: 0,
  assigneeIds: ['me'],
  status: 'open',
  completions: [],
  bonusAwards: {},
};
const household: Household = {
  id: 'home',
  name: 'Willow House',
  icon: '🏠',
  color: '#FFD33D',
  timeZone: 'UTC',
  members: [me],
  invite: {
    code: 'HG7K2P',
    expiresAt: '2027-01-01T00:00:00.000Z',
    uses: 0,
    maxUses: 8,
    revoked: false,
  },
};

/** A signed-in view model with every action stubbed, so tests assert the calls the screens make. */
function fakeModel(overrides: Partial<HouseholdViewModel> = {}): HouseholdViewModel {
  const noop = async () => undefined;
  return {
    hydrated: true,
    household,
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
    completeSubtask: async () => ({ celebrations: [] }),
    undoSubtask: noop,
    regenerateInvite: noop,
    finishSetup: noop,
    setupComplete: true,
    feed: [],
    postCompletion: async () => ({ celebrations: [] }),
    weeklyTotals: { me: 0 },
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

function signedIn(): AuthValue {
  const noop = async () => undefined;
  return {
    status: 'signedIn',
    user: null,
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

async function renderApp(model: HouseholdViewModel) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <LocaleProvider>
        <ThemeProvider>
          <AuthContext.Provider value={signedIn()}>
            <HouseholdContext.Provider value={model}>
              <HouseGainsApp />
            </HouseholdContext.Provider>
          </AuthContext.Provider>
        </ThemeProvider>
      </LocaleProvider>
    </SafeAreaProvider>,
  );
}

async function findByTestId(view: Awaited<ReturnType<typeof render>>, testId: string | RegExp) {
  let match: ReturnType<typeof view.getByTestId> | undefined;
  await waitFor(() => {
    match = view.getByTestId(testId);
  });
  return match!;
}

beforeEach(() => {
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
  mockRouteParams = {};
});

afterEach(() => jest.useRealTimers());

describe('HouseGains signed-in flow', () => {
  test('completing a chore step on today’s dashboard calls completeSubtask with the instance and step', async () => {
    const model = fakeModel({ completeSubtask: jest.fn(async () => ({ celebrations: [] })) });
    const view = await renderApp(model);

    const todayChore = await findByTestId(
      view,
      /^housegains\.dashboard\.chore\.catalog-kitchen-blitz:/,
    );
    await fireEvent.press(todayChore);
    await findByTestId(view, 'housegains.choreDetail');

    const firstStep = chore.subtasks[0].id;
    await fireEvent.press(await findByTestId(view, `housegains.choreDetail.done.${firstStep}`));

    await waitFor(() => expect(model.completeSubtask).toHaveBeenCalledWith(instance.id, firstStep));
  });

  test('a signed-in member with no household starts onboarding at the create step', async () => {
    const view = await renderApp(
      fakeModel({ household: null, instances: [], chores: [], setupComplete: false }),
    );

    await findByTestId(view, 'housegains.onboarding.createHousehold');
    expect(view.queryByTestId('housegains.join')).toBeNull();
  });

  test('an invite deep link opens the join screen for a member with no household', async () => {
    mockRouteParams = { code: 'HG7K2P' };
    const view = await renderApp(
      fakeModel({ household: null, instances: [], chores: [], setupComplete: false }),
    );

    await findByTestId(view, 'housegains.join');
  });
});
