import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthContext, type AuthValue } from '@/features/auth';
import { CelebrationHost } from '@/features/gamification/celebration-host';
import {
  GamificationProvider,
  useGamification,
  type GamificationViewModel,
} from '@/features/gamification/gamification-provider';
import { CelebrationScreen } from '@/features/housegains-screens/chore-completion-screens';
import { HouseholdContext } from '@/features/household/household-provider';
import { bia, fakeHousehold, me, metrics } from './gamification-support';
import type { Celebration, InboxCelebration } from '@/features/gamification/types';
import type { HouseholdViewModel, Instance, Chore, Member } from '@/features/household';

let mockReduced = false;
const mockClient = {
  inbox: undefined as ((rows: InboxCelebration[]) => void) | undefined,
  inboxError: undefined as (() => void) | undefined,
  walletError: undefined as (() => void) | undefined,
  organizerError: undefined as (() => void) | undefined,
  subscriptions: 0,
  inboxSubscriptions: 0,
  acks: [] as string[][],
  /** Number of upcoming acknowledgement calls that reject. */
  failAcks: 0,
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));
jest.mock('@/features/appearance', () => {
  const { getThemeTokens: tokensFor } = jest.requireActual('@/features/appearance/tokens');
  return {
    getThemeTokens: tokensFor,
    useAppearance: () => ({ themeId: 'arcade', tokens: tokensFor('arcade') }),
  };
});
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return new Proxy(actual, {
    get: (target, property) =>
      property === 'useReducedMotion' ? () => mockReduced : target[property],
  });
});
jest.mock('@/features/gamification/firebase-gamification-client', () => ({
  subscribeToWallet: (_uid: string, _onNext: unknown, onError: () => void) => {
    mockClient.subscriptions += 1;
    mockClient.walletError = onError;
    return () => undefined;
  },
  subscribeToWalletLedger: () => () => undefined,
  subscribeToOrganizer: (
    _householdId: string,
    _creatorId: string,
    _onNext: unknown,
    onError: () => void,
  ) => {
    mockClient.organizerError = onError;
    return () => undefined;
  },
  subscribeToInbox: (
    _uid: string,
    onNext: (rows: InboxCelebration[]) => void,
    onError: () => void,
  ) => {
    mockClient.inbox = onNext;
    mockClient.inboxError = onError;
    mockClient.inboxSubscriptions += 1;
    return () => undefined;
  },
  gamificationCalls: {
    ackCelebrations: async ({ ids }: { ids: string[] }) => {
      mockClient.acks.push(ids);
      if (mockClient.failAcks > 0) {
        mockClient.failAcks -= 1;
        throw new Error('ack failed');
      }
      return { ok: true, acknowledged: ids.length };
    },
    setAwayWeeks: async ({ weekStarts }: { weekStarts: string[] }) => ({ weekStarts }),
  },
}));

const toast = (id: string, amount: number): Celebration => ({
  id,
  moment: 'toast',
  track: 'ganhos',
  amount,
  copyKey: 'gami.earn.chore',
});
const badge = (
  id: string,
  achievementId: string,
  tier: 'bronze' | 'silver' | 'gold',
): Celebration => ({
  id,
  moment: 'badge',
  track: 'ganhos',
  amount: tier === 'gold' ? 120 : 50,
  copyKey: 'gami.achievement.unlocked',
  achievementId,
  tier,
  fullScreen: tier !== 'bronze',
});

let ctx: GamificationViewModel;
function Probe() {
  ctx = useGamification();
  return null;
}

const authValue = {
  status: 'signedIn',
  user: { uid: 'me' },
  signInProblem: null,
  clearSignInProblem: () => undefined,
  signInWithApple: async () => undefined,
  signInWithGoogle: async () => undefined,
  signInWithEmail: async () => undefined,
  createAccountWithEmail: async () => undefined,
  sendPasswordReset: async () => undefined,
  signOut: async () => undefined,
} as unknown as AuthValue;

function householdModel(
  member: Member = me,
  household: HouseholdViewModel['household'] = fakeHousehold(),
): HouseholdViewModel {
  const noop = async () => undefined;
  const none = async () => ({ celebrations: [] });
  return {
    hydrated: true,
    household,
    currentMember: member,
    chores: [],
    instances: [],
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
    weeklyTotals: {},
    streak: 0,
    xpLedger: [],
    disputes: [],
    lastWeek: null,
    setMemberRole: noop,
    reportCompletion: noop,
    resolveDispute: noop,
    moderateInstance: noop,
  };
}

async function mount(
  extra: React.ReactNode = null,
  member: Member = me,
  household: HouseholdViewModel['household'] = fakeHousehold(),
) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AuthContext.Provider value={authValue}>
        <HouseholdContext.Provider value={householdModel(member, household)}>
          <GamificationProvider>
            <Probe />
            <CelebrationHost />
            {extra}
          </GamificationProvider>
        </HouseholdContext.Provider>
      </AuthContext.Provider>
    </SafeAreaProvider>,
  );
  // let the first subscriptions settle
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockReduced = false;
  mockClient.inbox = undefined;
  mockClient.inboxError = undefined;
  mockClient.walletError = undefined;
  mockClient.organizerError = undefined;
  mockClient.subscriptions = 0;
  mockClient.inboxSubscriptions = 0;
  mockClient.acks = [];
  mockClient.failAcks = 0;
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
});

describe('gamification is always on', () => {
  test('with no flag and no cohort, listeners start and toasts show', async () => {
    await mount();
    expect(ctx.visible).toBe(true);
    expect(mockClient.subscriptions).toBe(1);
    await act(async () => {
      ctx.receiveActionCelebrations([toast('a', 25)]);
    });
    expect(screen.getByTestId('housegains.gamification.toast')).toBeTruthy();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Step done. +25 Gains');
  });

  test('before the member has a household nothing is subscribed or rendered', async () => {
    await mount(null, me, null);
    expect(ctx.visible).toBe(false);
    expect(mockClient.subscriptions).toBe(0);
    await act(async () => {
      ctx.receiveActionCelebrations([toast('a', 25)]);
    });
    expect(ctx.active).toBeNull();
    expect(screen.queryByTestId('housegains.gamification.toast')).toBeNull();
  });
});

describe('celebration queue on screen', () => {
  test('toasts come one after another and the list stays reachable', async () => {
    await mount();
    await act(async () => {
      ctx.receiveActionCelebrations([toast('a', 25), toast('b', 10)]);
    });
    expect(screen.getAllByTestId('housegains.gamification.toast')).toHaveLength(1);
    await act(async () => {
      jest.advanceTimersByTime(2500);
    });
    // the second toast replaced the first
    expect(ctx.active?.celebration.id).toBe('b');
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    expect(screen.getByTestId('housegains.gamification.toast.amount')).toHaveTextContent(
      '+10 Gains',
    );
  });

  test('the first silver/gold badge is a full-screen unlock with a delayed button; the second is a toast', async () => {
    await mount();
    await act(async () => {
      ctx.receiveActionCelebrations([badge('cel:badge:helper:silver:me', 'helper', 'silver')]);
    });
    expect(screen.getByTestId('housegains.gamification.unlock')).toBeTruthy();
    expect(screen.getByText('Helping Hand')).toBeTruthy();
    expect(screen.getByTestId('housegains.gamification.unlock.tier')).toHaveTextContent(
      /Silver tier/,
    );
    expect(screen.getByTestId('housegains.gamification.unlock.reward')).toHaveTextContent(
      '+50 Gains',
    );
    expect(
      screen.getByTestId('housegains.gamification.unlock.confetti', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    // the button is not active before 400 ms
    expect(
      screen.getByTestId('housegains.gamification.unlock.continue').props.accessibilityState
        .disabled,
    ).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(450);
    });
    expect(
      screen.getByTestId('housegains.gamification.unlock.continue').props.accessibilityState
        .disabled,
    ).toBe(false);
    await fireEvent.press(screen.getByTestId('housegains.gamification.unlock.continue'));
    expect(screen.queryByTestId('housegains.gamification.unlock')).toBeNull();

    await act(async () => {
      ctx.receiveActionCelebrations([badge('cel:badge:closer:gold:me', 'closer', 'gold')]);
    });
    // later full-screen badges in the same session become toasts
    expect(screen.queryByTestId('housegains.gamification.unlock')).toBeNull();
    expect(screen.getByTestId('housegains.gamification.toast.detail')).toHaveTextContent(
      'Closer · Gold',
    );
  });

  test('a bronze badge is a toast and does not use the session full screen', async () => {
    await mount();
    await act(async () => {
      ctx.receiveActionCelebrations([badge('cel:badge:helper:bronze:me', 'helper', 'bronze')]);
    });
    expect(screen.queryByTestId('housegains.gamification.unlock')).toBeNull();
    expect(screen.getByTestId('housegains.gamification.toast.detail')).toHaveTextContent(
      'Helping Hand · Bronze',
    );
  });

  test('reduced motion: the unlock card has no confetti and still reads in full', async () => {
    mockReduced = true;
    await mount();
    await act(async () => {
      ctx.receiveActionCelebrations([badge('cel:badge:helper:gold:me', 'helper', 'gold')]);
    });
    expect(
      screen.queryByTestId('housegains.gamification.unlock.confetti', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
    expect(screen.getByText('Helping Hand')).toBeTruthy();
    expect(screen.getByTestId('housegains.gamification.unlock.tier')).toHaveTextContent(
      /Gold tier/,
    );
  });

  test('a level-up from the inbox shows the new level and title, then is acknowledged', async () => {
    await mount();
    await act(async () => {
      mockClient.inbox?.([
        {
          id: 'cel:level:8:me',
          moment: 'level',
          track: 'ganhos',
          level: 8,
          copyKey: 'gami.level.up',
          seen: false,
          createdAt: new Date().toISOString(),
        },
      ]);
    });
    expect(screen.getByTestId('housegains.gamification.level.title')).toHaveTextContent('Level 8!');
    expect(screen.getByText('New title: Clean Master')).toBeTruthy();
    // not acknowledged while it is on screen
    expect(mockClient.acks).toEqual([]);
    await act(async () => {
      jest.advanceTimersByTime(3100);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockClient.acks).toEqual([['cel:level:8:me']]);
    expect(screen.queryByTestId('housegains.gamification.level')).toBeNull();
  });

  test('a level celebration at or below the displayed level floor is acknowledged silently', async () => {
    // Backfilled member {xp:600, levelFloor:5}: the server sends new-curve level 4, the app shows 5.
    await mount(null, { ...me, xp: 600, xpPeak: 600, levelFloor: 5 });
    await act(async () => {
      mockClient.inbox?.([
        {
          id: 'cel:level:4:me',
          moment: 'level',
          track: 'ganhos',
          level: 4,
          copyKey: 'gami.level.up',
          seen: false,
          createdAt: new Date().toISOString(),
        },
      ]);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('housegains.gamification.level')).toBeNull();
    expect(screen.queryByText('Level 4!')).toBeNull();
    expect(ctx.active).toBeNull();
    expect(mockClient.acks).toEqual([['cel:level:4:me']]);
  });

  test('a level-up above the floor shows the level the app displays', async () => {
    await mount(null, { ...me, xp: 1500, xpPeak: 1500, levelFloor: 5 });
    await act(async () => {
      ctx.receiveActionCelebrations([
        {
          id: 'cel:level:6:me',
          moment: 'level',
          track: 'ganhos',
          level: 6,
          copyKey: 'gami.level.up',
        },
      ]);
    });
    expect(screen.getByTestId('housegains.gamification.level.title')).toHaveTextContent('Level 6!');
  });

  describe('organizer (Zelo) level-ups', () => {
    const organizerLevel = (level: number): InboxCelebration => ({
      id: `cel:level:organizer:${level}:me`,
      moment: 'level',
      track: 'zelo',
      level,
      copyKey: 'gami.level.up',
      seen: false,
      createdAt: new Date().toISOString(),
    });

    test('is shown with the organizer title even when the member level is higher', async () => {
      // Member level 4 (levelFloor 4): the old check compared Zelo level 2 with it and acked it
      // silently, so a creator crossing 200 Zelo never saw it.
      await mount(null, { ...me, xp: 600, xpPeak: 600, levelFloor: 4 });
      await act(async () => {
        mockClient.inbox?.([organizerLevel(2)]);
      });
      expect(screen.getByTestId('housegains.gamification.level.title')).toHaveTextContent(
        'Level 2!',
      );
      expect(screen.getByTestId('housegains.gamification.level.organizer')).toHaveTextContent(
        'House organizer',
      );
      expect(screen.getByText('New title: House Manager')).toBeTruthy();
      expect(screen.queryByText(/Tidy Titan|Helper|Rookie|Clean Master/)).toBeNull();
      expect(mockClient.acks).toEqual([]);

      await act(async () => {
        jest.advanceTimersByTime(3100);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockClient.acks).toEqual([['cel:level:organizer:2:me']]);
      expect(screen.queryByTestId('housegains.gamification.level')).toBeNull();
    });

    test('names the organizer rank of the level, not a member title', async () => {
      // A new member (level 1) whose Zelo reaches level 5: the member curve would say "Tidy Titan".
      await mount();
      await act(async () => {
        mockClient.inbox?.([organizerLevel(5)]);
      });
      expect(screen.getByTestId('housegains.gamification.level.title')).toHaveTextContent(
        'Level 5!',
      );
      expect(screen.getByText('New title: Legendary Manager')).toBeTruthy();
      expect(screen.queryByText('New title: Tidy Titan')).toBeNull();
    });

    test('a member level-up keeps no organizer framing', async () => {
      await mount();
      await act(async () => {
        mockClient.inbox?.([
          {
            id: 'cel:level:member:8:me',
            moment: 'level',
            track: 'ganhos',
            level: 8,
            copyKey: 'gami.level.up',
            seen: false,
            createdAt: new Date().toISOString(),
          },
        ]);
      });
      expect(screen.queryByTestId('housegains.gamification.level.organizer')).toBeNull();
      expect(screen.getByText('New title: Clean Master')).toBeTruthy();
    });
  });

  test('the level number flips from the old to the new level (800 ms)', async () => {
    const level8: InboxCelebration = {
      id: 'cel:level:8:me',
      moment: 'level',
      track: 'ganhos',
      level: 8,
      copyKey: 'gami.level.up',
      seen: false,
      createdAt: new Date().toISOString(),
    };
    await mount();
    await act(async () => {
      mockClient.inbox?.([level8]);
    });
    // the title already names the new level; the digit flips in
    expect(screen.getByTestId('housegains.gamification.level.number')).toHaveTextContent('7');
    await act(async () => {
      jest.advanceTimersByTime(900);
    });
    expect(screen.getByTestId('housegains.gamification.level.number')).toHaveTextContent('8');
  });

  test('reduced motion: the level card is static and shows the new level straight away', async () => {
    mockReduced = true;
    await mount();
    await act(async () => {
      mockClient.inbox?.([
        {
          id: 'cel:level:8:me',
          moment: 'level',
          track: 'ganhos',
          level: 8,
          copyKey: 'gami.level.up',
          seen: false,
          createdAt: new Date().toISOString(),
        },
      ]);
    });
    expect(screen.getByTestId('housegains.gamification.level.number')).toHaveTextContent('8');
  });

  test('a streak milestone shows weeks in a row and the secured week text', async () => {
    await mount();
    await act(async () => {
      ctx.receiveActionCelebrations([
        {
          id: 'cel:streak:2026-11-16:4:me',
          moment: 'streak',
          track: 'ganhos',
          amount: 50,
          copyKey: 'gami.streak.milestone',
          data: { milestone: 4 },
        },
      ]);
    });
    expect(screen.getByText('4 weeks in a row!')).toBeTruthy();
    expect(screen.getByTestId('housegains.gamification.toast.detail')).toHaveTextContent(
      'Week secured',
    );
  });
});

describe('listener retry and acknowledgements', () => {
  const inboxToast = (id: string): InboxCelebration => ({
    ...toast(id, 25),
    seen: false,
    createdAt: new Date().toISOString(),
  });

  test('a retry keeps what was shown, so an unacknowledged inbox row is not celebrated again', async () => {
    await mount();
    mockClient.failAcks = 1;
    await act(async () => {
      mockClient.inbox?.([inboxToast('cel:toast:a')]);
    });
    expect(screen.getByTestId('housegains.gamification.toast')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(3200);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('housegains.gamification.toast')).toBeNull();
    expect(mockClient.acks).toEqual([['cel:toast:a']]); // rejected: still unacknowledged

    // Retry from an error state: listeners re-subscribe and the inbox redelivers the same row.
    await act(async () => {
      mockClient.organizerError?.();
      ctx.retry();
    });
    expect(mockClient.inboxSubscriptions).toBe(2);
    await act(async () => {
      mockClient.inbox?.([inboxToast('cel:toast:a')]);
    });
    expect(ctx.active).toBeNull();
    expect(screen.queryByTestId('housegains.gamification.toast')).toBeNull();
  });

  test('an inbox listener failure leaves the wallet screen status alone; a wallet failure does not', async () => {
    await mount();
    await act(async () => {
      mockClient.inboxError?.();
    });
    expect(ctx.inboxStatus).toBe('error');
    expect(ctx.walletStatus).not.toBe('error');
    await act(async () => {
      mockClient.walletError?.();
    });
    expect(ctx.walletStatus).toBe('error');
    expect(ctx.inboxStatus).toBe('error');
  });

  test('a failed acknowledgement is retried with a backoff until it goes through', async () => {
    await mount();
    mockClient.failAcks = 2;
    await act(async () => {
      mockClient.inbox?.([inboxToast('cel:toast:b')]);
    });
    await act(async () => {
      jest.advanceTimersByTime(3200);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockClient.acks).toEqual([['cel:toast:b']]);
    // 2 s later: second attempt (fails), then 4 s later: third attempt succeeds.
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockClient.acks).toHaveLength(2);
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockClient.acks).toHaveLength(3);
    // acknowledged: no further attempts
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(mockClient.acks).toHaveLength(3);
  });
});

const chore: Chore = {
  id: 'dog-care',
  name: 'Take care of the dog',
  icon: '🐕',
  category: 'home',
  subtasks: [{ id: 'feed', name: 'Feed', xp: 10, position: 0 }],
  bonusXp: 0,
  assigneeIds: ['me'],
  recurrence: 'daily',
  dueTime: '21:00',
  isActive: true,
};
const doneInstance: Instance = {
  id: 'dog-care-today',
  choreId: chore.id,
  dueAt: '2026-11-14T00:00:00.000Z',
  subtasks: chore.subtasks,
  bonusXp: 0,
  assigneeIds: ['me'],
  status: 'done',
  completions: [
    {
      id: 'c1',
      instanceId: 'dog-care-today',
      subtaskId: 'feed',
      memberId: 'me',
      xp: 10,
      completedAt: '2026-11-13T11:00:00.000Z',
      isAssist: false,
    },
  ],
  bonusAwards: {},
};

function CompletionScreenHarness() {
  const gamification = useGamification();
  return (
    <CelebrationScreen
      badges={gamification.completionBadges(doneInstance.id)}
      chore={chore}
      currentMember={me}
      hasError={false}
      instance={doneInstance}
      members={[me, bia]}
      onBack={jest.fn()}
      onPostToFeed={jest.fn().mockResolvedValue(undefined)}
    />
  );
}

describe('S3 completion screen with a badge', () => {
  test('a badge earned by the action that completed the chore shows inside S3, not as a second full screen', async () => {
    await mount(<CompletionScreenHarness />);
    expect(screen.queryByTestId('housegains.celebration.badges')).toBeNull();
    await act(async () => {
      ctx.receiveActionCelebrations(
        [toast('t1', 30), badge('cel:badge:closer:silver:me', 'closer', 'silver')],
        { instanceId: doneInstance.id, completesInstance: true },
      );
    });
    expect(screen.getByTestId('housegains.celebration.badges')).toBeTruthy();
    expect(screen.getByTestId('housegains.celebration.badge.closer')).toHaveTextContent(/Closer/);
    expect(screen.getByTestId('housegains.celebration.badge.closer')).toHaveTextContent(
      /Silver tier/,
    );
    expect(screen.getByTestId('housegains.celebration.badge.closer')).toHaveTextContent(
      /\+50 Gains/,
    );
    // no second full screen, only the earned toast
    expect(screen.queryByTestId('housegains.gamification.unlock')).toBeNull();
    expect(screen.getByTestId('housegains.gamification.toast')).toBeTruthy();
    // and the session's full-screen slot is still free
    await act(async () => {
      jest.advanceTimersByTime(2600);
    });
    await act(async () => {
      ctx.receiveActionCelebrations([badge('cel:badge:ontime:gold:me', 'ontime', 'gold')]);
    });
    expect(screen.getByTestId('housegains.gamification.unlock')).toBeTruthy();
  });

  test('S3 without badges has no badge section', async () => {
    await mount(<CompletionScreenHarness />);
    expect(screen.queryByTestId('housegains.celebration.badges')).toBeNull();
    expect(screen.getByTestId('housegains.celebration')).toBeTruthy();
  });
});
