import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/features/appearance';
import {
  CelebrationScreen,
  ChoreDetailScreen,
} from '@/features/housegains-screens/chore-completion-screens';
import type { Chore, Instance, Member } from '@/features/household';

const mockStorage: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(mockStorage[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete mockStorage[key];
      return Promise.resolve();
    }),
  },
}));

const members: Member[] = [
  { id: 'bia', name: 'Bia', initials: 'BI', color: '#F58BB7', role: 'member' },
  { id: 'rafa', name: 'Rafa', initials: 'RA', color: '#25DDA3', role: 'member' },
  { id: 'edu', name: 'Edu', initials: 'ED', color: '#FFD33D', role: 'creator' },
];

const currentMember = members[2];

function isDisabled(node: { props: unknown }): boolean {
  const props = node.props as { accessibilityState?: { disabled?: boolean } };
  return props.accessibilityState?.disabled === true;
}

const chore: Chore = {
  id: 'dog-care',
  name: 'Take care of the dog',
  icon: '🐕',
  category: 'home',
  subtasks: [
    { id: 'feed', name: 'Feed', xp: 10, position: 0 },
    { id: 'walk', name: 'Walk', xp: 20, position: 1 },
    { id: 'paws', name: 'Wash paws', xp: 15, position: 2 },
  ],
  bonusXp: 15,
  assigneeIds: ['bia', 'rafa'],
  recurrence: 'daily',
  dueTime: '21:00',
  isActive: true,
};

const openInstance: Instance = {
  id: 'dog-care-today',
  choreId: chore.id,
  dueAt: '2026-11-14T00:00:00.000Z',
  subtasks: chore.subtasks,
  bonusXp: chore.bonusXp,
  assigneeIds: chore.assigneeIds,
  status: 'open',
  completions: [],
  bonusAwards: {},
};

async function renderWithTheme(element: React.ReactElement) {
  return render(<ThemeProvider>{element}</ThemeProvider>);
}

describe('HouseGains chore completion screens', () => {
  // Pin the clock before the fixture's dueAt so the chore stays open on any real date.
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-13T12:00:00.000Z') });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('lets an unassigned helper complete a subtask and prevents duplicate taps while pending', async () => {
    let finishCompletion: (() => void) | undefined;
    const onComplete = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCompletion = resolve;
        }),
    );

    await renderWithTheme(
      <ChoreDetailScreen
        householdId="household-1"
        chore={chore}
        currentMember={currentMember}
        hasError={false}
        instance={{ ...openInstance, assigneeIds: [] }}
        members={members}
        onBack={jest.fn()}
        onComplete={onComplete}
        onUndo={jest.fn()}
      />,
    );

    const done = screen.getByTestId('housegains.choreDetail.done.paws');
    await act(async () => {
      await fireEvent.press(done);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(openInstance.id, 'paws');
    expect(isDisabled(screen.getByTestId('housegains.choreDetail.done.paws'))).toBe(true);

    await act(async () => {
      await fireEvent.press(done);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishCompletion?.();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(isDisabled(screen.getByTestId('housegains.choreDetail.done.paws'))).toBe(false),
    );
  });

  test('allows the remaining subtasks on a partial instance before its due date', async () => {
    const onComplete = jest.fn().mockResolvedValue(undefined);
    const partiallyCompleted: Instance = {
      ...openInstance,
      status: 'partial',
      completions: [
        {
          id: 'completion-bia-feed',
          instanceId: openInstance.id,
          subtaskId: 'feed',
          memberId: 'bia',
          xp: 10,
          completedAt: '2026-11-13T11:00:00.000Z',
          isAssist: false,
        },
      ],
    };

    const view = await renderWithTheme(
      <ChoreDetailScreen
        householdId="household-1"
        chore={chore}
        currentMember={currentMember}
        hasError={false}
        instance={partiallyCompleted}
        members={members}
        onBack={jest.fn()}
        onComplete={onComplete}
        onUndo={jest.fn()}
      />,
    );

    const walk = screen.getByTestId('housegains.choreDetail.done.walk');
    expect(isDisabled(walk)).toBe(false);
    await act(async () => {
      await fireEvent.press(walk);
    });
    expect(onComplete).toHaveBeenCalledWith(openInstance.id, 'walk');

    await view.rerender(
      <ThemeProvider>
        <ChoreDetailScreen
          householdId="household-1"
          chore={chore}
          currentMember={currentMember}
          hasError={false}
          instance={{ ...openInstance, status: 'partial', dueAt: '2026-11-12T00:00:00.000Z' }}
          members={members}
          onBack={jest.fn()}
          onComplete={jest.fn()}
          onUndo={jest.fn()}
        />
      </ThemeProvider>,
    );

    expect(isDisabled(screen.getByTestId('housegains.choreDetail.done.walk'))).toBe(true);
  });

  test('expires the current member undo control at the five-minute deadline', async () => {
    const now = new Date('2026-11-13T12:00:00.000Z');
    jest.useFakeTimers();
    jest.setSystemTime(now);
    const ownCompletion = {
      id: 'completion-edu-feed',
      instanceId: openInstance.id,
      subtaskId: 'feed',
      memberId: currentMember.id,
      xp: 10,
      completedAt: new Date(now.getTime() - 299_000).toISOString(),
      isAssist: true,
    };

    await renderWithTheme(
      <ChoreDetailScreen
        householdId="household-1"
        chore={chore}
        currentMember={currentMember}
        hasError={false}
        instance={{ ...openInstance, completions: [ownCompletion] }}
        members={members}
        onBack={jest.fn()}
        onComplete={jest.fn()}
        onUndo={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(isDisabled(screen.getByTestId('housegains.choreDetail.undo.feed'))).toBe(false);
    expect(screen.getByTestId('housegains.choreDetail.subtask.feed.assist')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(1_001);
      await Promise.resolve();
    });

    expect(screen.queryByTestId('housegains.choreDetail.undo.feed')).toBeNull();
    expect(screen.getByTestId('housegains.choreDetail.subtask.feed.undoExpired')).toBeTruthy();
  });

  test('shows each contributor’s subtask XP, allocated bonus, and combined total', async () => {
    const completed: Instance = {
      ...openInstance,
      status: 'done',
      completions: [
        {
          id: 'completion-bia-feed',
          instanceId: openInstance.id,
          subtaskId: 'feed',
          memberId: 'bia',
          xp: 10,
          completedAt: '2026-11-13T11:02:00.000Z',
          isAssist: false,
        },
        {
          id: 'completion-rafa-walk',
          instanceId: openInstance.id,
          subtaskId: 'walk',
          memberId: 'rafa',
          xp: 20,
          completedAt: '2026-11-13T11:04:00.000Z',
          isAssist: false,
        },
        {
          id: 'completion-edu-paws',
          instanceId: openInstance.id,
          subtaskId: 'paws',
          memberId: 'edu',
          xp: 15,
          completedAt: '2026-11-13T11:06:00.000Z',
          isAssist: true,
        },
      ],
      bonusAwards: { bia: 5, rafa: 5, edu: 5 },
    };

    await renderWithTheme(
      <CelebrationScreen
        chore={chore}
        currentMember={currentMember}
        hasError={false}
        instance={completed}
        members={members}
        onBack={jest.fn()}
        onPostToFeed={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByTestId('housegains.celebration.contributor.bia')).toHaveTextContent(/Bia/);
    expect(screen.getByTestId('housegains.celebration.contributor.bia.subtasks')).toHaveTextContent(
      /Feed/,
    );
    expect(screen.getByTestId('housegains.celebration.contributor.bia.bonus')).toHaveTextContent(
      /\+5/,
    );
    expect(screen.getByTestId('housegains.celebration.contributor.bia.total')).toHaveTextContent(
      /15/,
    );

    expect(screen.getByTestId('housegains.celebration.contributor.edu.subtasks')).toHaveTextContent(
      /Wash paws/,
    );
    expect(screen.getByTestId('housegains.celebration.contributor.edu.subtasks')).toHaveTextContent(
      /assist/i,
    );
    expect(screen.getByTestId('housegains.celebration.contributor.edu.bonus')).toHaveTextContent(
      /\+5/,
    );
    expect(screen.getByTestId('housegains.celebration.contributor.edu.total')).toHaveTextContent(
      /20/,
    );
  });

  test('keeps feed posting pending, avoids duplicate posts, and allows retry after failure', async () => {
    let rejectPost: ((error: Error) => void) | undefined;
    const onPostToFeed = jest.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectPost = reject;
        }),
    );
    const completed: Instance = {
      ...openInstance,
      status: 'done',
      completions: [],
      bonusAwards: {},
    };

    await renderWithTheme(
      <CelebrationScreen
        chore={chore}
        currentMember={currentMember}
        hasError={false}
        instance={completed}
        members={members}
        onBack={jest.fn()}
        onPostToFeed={onPostToFeed}
      />,
    );

    const post = screen.getByTestId('housegains.celebration.postToFeed');
    await act(async () => {
      await fireEvent.press(post);
    });
    expect(isDisabled(screen.getByTestId('housegains.celebration.postToFeed'))).toBe(true);

    await act(async () => {
      await fireEvent.press(post);
    });
    expect(onPostToFeed).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectPost?.(new Error('feed unavailable'));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByTestId('housegains.celebration.postError')).toBeTruthy(),
    );

    onPostToFeed.mockImplementationOnce(() => Promise.resolve());
    await act(async () => {
      await fireEvent.press(screen.getByTestId('housegains.celebration.postToFeed'));
    });
    await waitFor(() => expect(screen.getByTestId('housegains.celebration.posted')).toBeTruthy());
    expect(onPostToFeed).toHaveBeenCalledTimes(2);
  });
});
