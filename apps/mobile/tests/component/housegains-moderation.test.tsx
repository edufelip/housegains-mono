import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getThemeTokens, type ThemeId } from '@/features/appearance';
import { ChoreDetailScreen } from '@/features/housegains-screens/chore-completion-screens';
import { HouseholdRanksScreen } from '@/features/housegains-screens/main-tab-screens';
import {
  AdminReportsScreen,
  ReportCompletionSheet,
} from '@/features/housegains-screens/moderation-screens';
import type { Chore, Dispute, Instance, Member, WeekStandings } from '@/features/household';

// The flows under test read tokens only, so the appearance module is faked with a
// switchable theme; the settings surface (which needs the real provider) is covered
// in housegains-moderation-settings.test.tsx.
const mockTheme: { id: ThemeId } = { id: 'arcade' };

jest.mock('@/features/appearance', () => {
  const { getThemeTokens } = jest.requireActual('@/features/appearance/tokens');
  return {
    getThemeTokens,
    useAppearance: () => ({ themeId: mockTheme.id, tokens: getThemeTokens(mockTheme.id) }),
  };
});

jest.mock('@expo/vector-icons', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => React.createElement(Text, null, name);
  return { Ionicons: Icon, MaterialIcons: Icon };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const NOW = new Date('2026-11-24T12:00:00.000Z');

const members: Member[] = [
  { id: 'edu', name: 'Edu', initials: 'ED', color: '#FFD33D', role: 'creator' },
  { id: 'bia', name: 'Bia', initials: 'BI', color: '#F58BB7', role: 'member' },
  { id: 'rafa', name: 'Rafa', initials: 'RA', color: '#25DDA3', role: 'admin' },
];

const chore: Chore = {
  id: 'dog-care',
  name: 'Take care of the dog',
  icon: '🐕',
  category: 'pets',
  subtasks: [
    { id: 'feed', name: 'Feed', xp: 10, position: 0 },
    { id: 'walk', name: 'Walk', xp: 20, position: 1 },
    { id: 'paws', name: 'Wash paws', xp: 15, position: 2 },
  ],
  bonusXp: 15,
  assigneeIds: ['bia'],
  recurrence: 'daily',
  dueTime: '21:00',
  isActive: true,
};

function completion(subtaskId: string, memberId: string, minutesAgo: number) {
  return {
    id: `c-${subtaskId}`,
    instanceId: 'dog-care-today',
    subtaskId,
    memberId,
    xp: 10,
    completedAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
    isAssist: false,
  };
}

function makeInstance(overrides: Partial<Instance> = {}): Instance {
  return {
    id: 'dog-care-today',
    choreId: chore.id,
    dueAt: '2026-11-24T21:00:00.000Z',
    subtasks: chore.subtasks,
    bonusXp: chore.bonusXp,
    assigneeIds: chore.assigneeIds,
    status: 'partial',
    completions: [completion('feed', 'bia', 60), completion('walk', 'rafa', 30)],
    bonusAwards: {},
    ...overrides,
  };
}

function makeDispute(overrides: Partial<Dispute> = {}): Dispute {
  return {
    id: 'dog-care-today',
    instanceId: 'dog-care-today',
    choreName: 'Take care of the dog',
    status: 'open',
    subtaskIds: ['feed', 'walk'],
    completerIds: ['bia', 'rafa'],
    reports: [
      {
        uid: 'bia',
        subtaskIds: ['feed'],
        reason: 'The bowl was still empty',
        createdAt: new Date(NOW.getTime() - 30 * 60_000).toISOString(),
      },
    ],
    createdAt: new Date(NOW.getTime() - 30 * 60_000).toISOString(),
    expiresAt: new Date(NOW.getTime() + 71 * 60 * 60_000).toISOString(),
    ...overrides,
  };
}

function makeWeek(
  top: WeekStandings['topMember'],
  shame: WeekStandings['wallOfShame'],
): WeekStandings {
  return {
    weekStart: '2026-11-16',
    weekEnd: '2026-11-22',
    topMember: top,
    wallOfShame: shame,
    members: {},
  };
}

function isDisabled(node: { props: unknown }): boolean {
  const props = node.props as { accessibilityState?: { disabled?: boolean } };
  return props.accessibilityState?.disabled === true;
}

function renderWithProviders(element: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={metrics}>{element}</SafeAreaProvider>);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  mockTheme.id = 'arcade';
});

afterEach(() => {
  jest.useRealTimers();
});

function choreDetailProps(overrides: Partial<Parameters<typeof ChoreDetailScreen>[0]> = {}) {
  return {
    householdId: 'home',
    chore,
    currentMember: members[0],
    disputes: [] as Dispute[],
    hasError: false,
    instance: makeInstance(),
    members,
    onBack: jest.fn(),
    onComplete: jest.fn(),
    onUndo: jest.fn(),
    rosterMembers: members,
    ...overrides,
  };
}

describe('HouseGains member report flow (chore detail)', () => {
  test('lets a member report someone else’s completion with picked steps and a reason', async () => {
    const onReport = jest.fn().mockResolvedValue(undefined);
    const member = { ...members[0], id: 'ana', role: 'member' as const };

    // Admins (creator included) mark completions directly instead of reporting.
    await act(async () => {
      await renderWithProviders(
        <ChoreDetailScreen {...choreDetailProps({ onModerate: jest.fn(), onReport })} />,
      );
    });
    expect(screen.queryByTestId('housegains.choreDetail.reportNotDone')).toBeNull();
    expect(screen.getByTestId('housegains.choreDetail.markNotDone')).toBeTruthy();

    await act(async () => {
      await renderWithProviders(
        <ChoreDetailScreen
          {...choreDetailProps({ currentMember: member, onModerate: jest.fn(), onReport })}
        />,
      );
    });
    expect(screen.queryByTestId('housegains.choreDetail.markNotDone')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.choreDetail.reportNotDone'));
    });

    const sheet = screen.getByTestId('housegains.choreDetail.reportSheet');
    expect(sheet).toHaveTextContent(/Feed/);
    expect(sheet).toHaveTextContent(/Walk/);
    // Both of the other members' steps start selected; drop one and add a reason.
    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.choreDetail.reportSheet.step.walk'));
    });
    await act(async () => {
      fireEvent.changeText(
        screen.getByTestId('housegains.choreDetail.reportSheet.reason'),
        'Still dirty',
      );
    });
    expect(screen.getByTestId('housegains.choreDetail.reportSheet.reasonCount')).toHaveTextContent(
      '11/280',
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.choreDetail.reportSheet.submit'));
    });
    expect(onReport).toHaveBeenCalledTimes(1);
    expect(onReport).toHaveBeenCalledWith('dog-care-today', ['feed'], 'Still dirty');
    expect(screen.getByTestId('housegains.choreDetail.reportSheet.message')).toHaveTextContent(
      /admin/i,
    );
  });

  test('hides the report action once the caller already reported, and shows the under-review banner', async () => {
    const member = { ...members[0], id: 'ana', role: 'member' as const };
    const openDispute = makeDispute({
      reports: [
        { uid: 'ana', subtaskIds: ['feed'], reason: '', createdAt: '2026-11-24T11:30:00.000Z' },
      ],
    });
    await renderWithProviders(
      <ChoreDetailScreen
        {...choreDetailProps({
          currentMember: member,
          disputes: [openDispute],
          instance: makeInstance({ disputeStatus: 'open' }),
          onReport: jest.fn(),
        })}
      />,
    );

    expect(screen.getByTestId('housegains.choreDetail.underReview')).toHaveTextContent(
      /Under review/i,
    );
    expect(screen.queryByTestId('housegains.choreDetail.reportNotDone')).toBeNull();
    expect(screen.getByTestId('housegains.choreDetail.alreadyReported')).toHaveTextContent(
      /already reported/i,
    );
  });

  test('hides the report action for a resolved dispute and for an expired window', async () => {
    const member = { ...members[0], id: 'ana', role: 'member' as const };
    const stale = makeInstance({
      completions: [completion('feed', 'bia', 60 * 96)],
    });

    await renderWithProviders(
      <ChoreDetailScreen
        {...choreDetailProps({
          currentMember: member,
          instance: makeInstance({ disputeStatus: 'resolved' }),
          onReport: jest.fn(),
        })}
      />,
    );
    expect(screen.queryByTestId('housegains.choreDetail.reportNotDone')).toBeNull();

    await renderWithProviders(
      <ChoreDetailScreen
        {...choreDetailProps({ currentMember: member, instance: stale, onReport: jest.fn() })}
      />,
    );
    expect(screen.queryByTestId('housegains.choreDetail.reportNotDone')).toBeNull();
  });

  test('shows each revocation with the actor and the verdict', async () => {
    const revoked = makeInstance({
      completions: [],
      revocations: [
        {
          subtaskId: 'feed',
          memberId: 'bia',
          xp: 10,
          actorUid: 'edu',
          verdict: 'not_done',
          at: '2026-11-24T10:00:00.000Z',
        },
      ],
    });
    await renderWithProviders(
      <ChoreDetailScreen {...choreDetailProps({ instance: revoked, onReport: jest.fn() })} />,
    );
    expect(screen.getByTestId('housegains.choreDetail.revocations')).toHaveTextContent(
      /Revoked by an admin/i,
    );
    expect(screen.getByTestId('housegains.choreDetail.revocation.feed')).toHaveTextContent(/Edu/);
    expect(screen.getByTestId('housegains.choreDetail.revocation.feed')).toHaveTextContent(
      /not done/i,
    );
    expect(screen.getByTestId('housegains.choreDetail.revocation.feed')).toHaveTextContent(/10/);
  });
});

describe('HouseGains admin verdict flow', () => {
  test('resolves a report as done, and as not done, through the confirm sheet', async () => {
    const onResolve = jest.fn().mockResolvedValue(undefined);
    await renderWithProviders(
      <AdminReportsScreen
        currentMember={members[0]}
        disputes={[makeDispute()]}
        hasError={false}
        instances={[makeInstance()]}
        members={members}
        onBack={jest.fn()}
        onResolve={onResolve}
        onRetry={jest.fn()}
      />,
    );

    const row = screen.getByTestId('housegains.reports.dispute.dog-care-today');
    expect(row).toHaveTextContent(/Take care of the dog/);
    expect(row).toHaveTextContent(/Reported by Bia/i);
    expect(row).toHaveTextContent(/The bowl was still empty/);
    expect(row).toHaveTextContent(/Feed/);
    expect(row).toHaveTextContent(/Walk/);

    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.reports.dispute.dog-care-today.done'));
    });
    expect(screen.getByTestId('housegains.reports.confirm')).toHaveTextContent(
      /Keep this chore as done\?/i,
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.reports.confirm.confirm'));
    });
    expect(onResolve).toHaveBeenCalledWith('dog-care-today', 'done');

    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.reports.dispute.dog-care-today.notDone'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.reports.confirm.confirm'));
    });
    expect(onResolve).toHaveBeenCalledWith('dog-care-today', 'not_done');
  });

  test('keeps the partial verdict disabled until the selection is a strict subset', async () => {
    const onResolve = jest.fn().mockResolvedValue(undefined);
    await renderWithProviders(
      <AdminReportsScreen
        currentMember={members[0]}
        disputes={[makeDispute()]}
        hasError={false}
        instances={[makeInstance()]}
        members={members}
        onBack={jest.fn()}
        onResolve={onResolve}
        onRetry={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.reports.dispute.dog-care-today.partial'));
    });
    const confirm = screen.getByTestId('housegains.reports.partial.confirm');
    expect(isDisabled(confirm)).toBe(true);
    // Selecting every disputed step is not a partial verdict.
    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.reports.partial.step.feed'));
    });
    expect(isDisabled(confirm)).toBe(false);
    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.reports.partial.step.walk'));
    });
    expect(isDisabled(confirm)).toBe(true);
    // Keeping one step done unlocks the verdict.
    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.reports.partial.step.feed'));
    });
    expect(isDisabled(confirm)).toBe(false);

    await act(async () => {
      fireEvent.press(confirm);
    });
    expect(onResolve).toHaveBeenCalledWith('dog-care-today', 'partial', ['walk']);
  });

  test('hides the partial verdict when a single subtask is disputed', async () => {
    await renderWithProviders(
      <AdminReportsScreen
        currentMember={members[0]}
        disputes={[makeDispute({ subtaskIds: ['feed'] })]}
        hasError={false}
        instances={[makeInstance()]}
        members={members}
        onBack={jest.fn()}
        onResolve={jest.fn()}
        onRetry={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('housegains.reports.dispute.dog-care-today.partial')).toBeNull();
    expect(screen.getByTestId('housegains.reports.dispute.dog-care-today.done')).toBeTruthy();
    expect(screen.getByTestId('housegains.reports.dispute.dog-care-today.notDone')).toBeTruthy();
  });

  test('a conflicted admin sees a note instead of verdict buttons on a dispute they took part in', async () => {
    // Edu (creator) completed 'feed'; Rafa is another admin, so Edu must not resolve this dispute.
    const onResolve = jest.fn();
    await renderWithProviders(
      <AdminReportsScreen
        currentMember={members[0]}
        disputes={[makeDispute()]}
        hasError={false}
        instances={[
          makeInstance({
            completions: [completion('feed', 'edu', 60), completion('walk', 'bia', 30)],
          }),
        ]}
        members={members}
        onBack={jest.fn()}
        onResolve={onResolve}
        onRetry={jest.fn()}
        rosterMembers={members}
      />,
    );
    expect(
      screen.getByTestId('housegains.reports.dispute.dog-care-today.conflict'),
    ).toHaveTextContent(/another admin must review it/i);
    expect(screen.queryByTestId('housegains.reports.dispute.dog-care-today.done')).toBeNull();
    expect(screen.queryByTestId('housegains.reports.dispute.dog-care-today.partial')).toBeNull();
    expect(screen.queryByTestId('housegains.reports.dispute.dog-care-today.notDone')).toBeNull();
  });

  describe('verdict buttons stay for a sole admin and for an admin outside the disputed steps', () => {
    const baseProps = () => ({
      disputes: [makeDispute()],
      hasError: false,
      instances: [
        makeInstance({
          completions: [completion('feed', 'edu', 60), completion('walk', 'bia', 30)],
        }),
      ],
      members,
      onBack: jest.fn(),
      onResolve: jest.fn(),
      onRetry: jest.fn(),
    });

    test('a sole admin may review their own completion', async () => {
      // Edu alone holds admin rights over [creator Edu, member Bia].
      await renderWithProviders(
        <AdminReportsScreen
          {...baseProps()}
          currentMember={members[0]}
          rosterMembers={[members[0], members[1]]}
        />,
      );
      expect(screen.getByTestId('housegains.reports.dispute.dog-care-today.done')).toBeTruthy();
      expect(screen.queryByTestId('housegains.reports.dispute.dog-care-today.conflict')).toBeNull();
    });

    test('an admin who completed none of the disputed steps is not conflicted', async () => {
      // Rafa completed neither 'feed' nor 'walk' here.
      await renderWithProviders(
        <AdminReportsScreen {...baseProps()} currentMember={members[2]} rosterMembers={members} />,
      );
      expect(screen.getByTestId('housegains.reports.dispute.dog-care-today.notDone')).toBeTruthy();
      expect(screen.queryByTestId('housegains.reports.dispute.dog-care-today.conflict')).toBeNull();
    });
  });

  test('the Reports conflict follows the completions the dispute still covers', async () => {
    // Edu undid 'feed' earlier and completed it again: the report named the older completion
    // (c-old), so Edu's current one is not under review and Edu may give the verdict.
    const replaced = {
      ...completion('feed', 'edu', 60),
      id: 'c-new',
    };
    const instances = [makeInstance({ completions: [replaced, completion('walk', 'bia', 30)] })];
    const props = {
      currentMember: members[0],
      hasError: false,
      instances,
      members,
      onBack: jest.fn(),
      onResolve: jest.fn(),
      onRetry: jest.fn(),
      rosterMembers: members,
    };
    const view = await renderWithProviders(
      <AdminReportsScreen
        {...props}
        disputes={[
          makeDispute({ subtaskIds: ['feed', 'walk'], completionIds: ['c-old', 'c-walk'] }),
        ]}
      />,
    );
    expect(screen.queryByTestId('housegains.reports.dispute.dog-care-today.conflict')).toBeNull();
    expect(screen.getByTestId('housegains.reports.dispute.dog-care-today.notDone')).toBeTruthy();

    // Same dispute reporting Edu's current completion: now it is a conflict.
    await act(async () => {
      view.rerender(
        <SafeAreaProvider initialMetrics={metrics}>
          <AdminReportsScreen
            {...props}
            disputes={[
              makeDispute({ subtaskIds: ['feed', 'walk'], completionIds: ['c-new', 'c-walk'] }),
            ]}
          />
        </SafeAreaProvider>,
      );
    });
    expect(screen.getByTestId('housegains.reports.dispute.dog-care-today.conflict')).toBeTruthy();
    expect(screen.queryByTestId('housegains.reports.dispute.dog-care-today.notDone')).toBeNull();
  });

  test('the back button uses the chevron icon, not a text glyph', async () => {
    await renderWithProviders(
      <AdminReportsScreen
        currentMember={members[0]}
        disputes={[]}
        hasError={false}
        instances={[]}
        members={members}
        onBack={jest.fn()}
        onResolve={jest.fn()}
        onRetry={jest.fn()}
      />,
    );
    const back = screen.getByTestId('housegains.reports.back');
    expect(back).toHaveTextContent('chevron-back');
    expect(back).not.toHaveTextContent('‹');
  });

  test('shows loading, empty, and error-with-retry states', async () => {
    const onRetry = jest.fn();
    const element = (disputes: Dispute[] | null, hasError: boolean) => (
      <AdminReportsScreen
        currentMember={members[0]}
        disputes={disputes}
        hasError={hasError}
        instances={[]}
        members={members}
        onBack={jest.fn()}
        onResolve={jest.fn()}
        onRetry={onRetry}
      />
    );
    const view = await renderWithProviders(element(null, false));
    expect(screen.getByTestId('housegains.reports.loading')).toBeTruthy();

    await act(async () => {
      view.rerender(
        <SafeAreaProvider initialMetrics={metrics}>{element([], false)}</SafeAreaProvider>,
      );
    });
    expect(screen.getByTestId('housegains.reports.empty')).toHaveTextContent(/Nothing to review/i);

    await act(async () => {
      view.rerender(
        <SafeAreaProvider initialMetrics={metrics}>{element([], true)}</SafeAreaProvider>,
      );
    });
    expect(screen.getByTestId('housegains.reports.error')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.reports.error.action'));
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('a conflicted admin cannot mark everything not done and is only offered other members’ steps', async () => {
    // Edu (creator) completed 'feed'; Rafa is another admin, so Edu is conflicted on 'feed' only.
    const onModerate = jest.fn().mockResolvedValue(undefined);
    const conflictedInstance = makeInstance({
      completions: [completion('feed', 'edu', 60), completion('walk', 'rafa', 30)],
    });
    await renderWithProviders(
      <ChoreDetailScreen {...choreDetailProps({ instance: conflictedInstance, onModerate })} />,
    );
    expect(screen.queryByTestId('housegains.choreDetail.markNotDone')).toBeNull();
    expect(screen.getByTestId('housegains.choreDetail.conflict')).toHaveTextContent(
      /another admin must review it/i,
    );
    // The server only checks the targets: Rafa's step stays selectable, Edu's own is not offered.
    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.choreDetail.markPartial'));
    });
    expect(screen.queryByTestId('housegains.choreDetail.partialSheet.step.feed')).toBeNull();
    expect(isDisabled(screen.getByTestId('housegains.choreDetail.partialSheet.confirm'))).toBe(
      true,
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.choreDetail.partialSheet.step.walk'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.choreDetail.partialSheet.confirm'));
    });
    expect(onModerate).toHaveBeenCalledWith('dog-care-today', 'partial', ['walk']);
  });

  test('a conflicted admin may pick every step that is not their own', async () => {
    const onModerate = jest.fn().mockResolvedValue(undefined);
    const instanceOne = makeInstance({
      completions: [
        completion('feed', 'edu', 90),
        completion('walk', 'rafa', 60),
        completion('paws', 'bia', 30),
      ],
    });
    await renderWithProviders(
      <ChoreDetailScreen {...choreDetailProps({ instance: instanceOne, onModerate })} />,
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.choreDetail.markPartial'));
    });
    expect(screen.queryByTestId('housegains.choreDetail.partialSheet.step.feed')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.choreDetail.partialSheet.step.walk'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.choreDetail.partialSheet.step.paws'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.choreDetail.partialSheet.confirm'));
    });
    expect(onModerate).toHaveBeenCalledWith('dog-care-today', 'partial', ['walk', 'paws']);
  });

  test('a conflicted admin with nothing else to pick sees the note only', async () => {
    await renderWithProviders(
      <ChoreDetailScreen
        {...choreDetailProps({
          instance: makeInstance({ completions: [completion('feed', 'edu', 60)] }),
          onModerate: jest.fn(),
        })}
      />,
    );
    expect(screen.getByTestId('housegains.choreDetail.conflict')).toBeTruthy();
    expect(screen.queryByTestId('housegains.choreDetail.moderation')).toBeNull();
  });

  test('the partial verdict is offered only when the picker has two steps to split', async () => {
    // 'walk' was completed 96 h ago: two completions, but only 'feed' can still be revoked.
    await renderWithProviders(
      <ChoreDetailScreen
        {...choreDetailProps({
          instance: makeInstance({
            completions: [completion('feed', 'bia', 60), completion('walk', 'rafa', 60 * 96)],
          }),
          onModerate: jest.fn(),
        })}
      />,
    );
    expect(screen.queryByTestId('housegains.choreDetail.markPartial')).toBeNull();
    expect(screen.getByTestId('housegains.choreDetail.markNotDone')).toBeTruthy();
  });

  test('lets a sole admin moderate directly: not done through the confirm, partial through the picker', async () => {
    const onModerate = jest.fn().mockResolvedValue(undefined);
    // Edu alone holds admin rights over the roster [creator Edu, member Bia].
    const roster = [members[0], members[1]];
    const soleAdminInstance = makeInstance({
      completions: [completion('feed', 'edu', 60), completion('walk', 'bia', 30)],
    });
    await renderWithProviders(
      <ChoreDetailScreen
        {...choreDetailProps({ instance: soleAdminInstance, onModerate, rosterMembers: roster })}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.choreDetail.markNotDone'));
    });
    expect(screen.getByTestId('housegains.choreDetail.confirmSheet')).toHaveTextContent(
      /Mark as not done\?/i,
    );
    expect(screen.getByTestId('housegains.choreDetail.confirmSheet')).toHaveTextContent(
      /Feed, Walk/,
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.choreDetail.confirmSheet.confirm'));
    });
    expect(onModerate).toHaveBeenCalledWith('dog-care-today', 'not_done', ['feed', 'walk']);

    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.choreDetail.markPartial'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.choreDetail.partialSheet.step.walk'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('housegains.choreDetail.partialSheet.confirm'));
    });
    expect(onModerate).toHaveBeenCalledWith('dog-care-today', 'partial', ['walk']);
  });

  test('hides the direct partial verdict when only one subtask is completed', async () => {
    await renderWithProviders(
      <ChoreDetailScreen
        {...choreDetailProps({
          instance: makeInstance({ completions: [completion('feed', 'bia', 60)] }),
          onModerate: jest.fn(),
        })}
      />,
    );
    expect(screen.queryByTestId('housegains.choreDetail.markPartial')).toBeNull();
    expect(screen.getByTestId('housegains.choreDetail.markNotDone')).toBeTruthy();
  });

  test('shows the closed review window to an admin instead of actions', async () => {
    const stale = makeInstance({ completions: [completion('feed', 'bia', 60 * 96)] });
    await renderWithProviders(
      <ChoreDetailScreen {...choreDetailProps({ instance: stale, onModerate: jest.fn() })} />,
    );
    expect(screen.queryByTestId('housegains.choreDetail.markNotDone')).toBeNull();
    expect(screen.getByTestId('housegains.choreDetail.reviewWindowClosed')).toHaveTextContent(
      /72 hours/i,
    );
  });
});

describe('HouseGains moderation follows the open dispute (chore detail)', () => {
  const ownFeedInstance = () =>
    makeInstance({
      completions: [
        completion('feed', 'edu', 90),
        completion('walk', 'rafa', 60),
        completion('paws', 'bia', 30),
      ],
    });

  test('an admin whose own completion an open dispute covers sees the conflict note, not Partial or Not done', async () => {
    // Bia reported Edu's 'feed'. Any verdict resolves that dispute, so the server refuses Edu
    // even for Rafa's 'walk' alone.
    const onModerate = jest.fn().mockResolvedValue(undefined);
    const dispute = makeDispute({
      subtaskIds: ['feed'],
      completionIds: ['c-feed'],
      completerIds: ['edu'],
    });
    await renderWithProviders(
      <ChoreDetailScreen
        {...choreDetailProps({ instance: ownFeedInstance(), disputes: [dispute], onModerate })}
      />,
    );
    expect(screen.getByTestId('housegains.choreDetail.conflict')).toHaveTextContent(
      /another admin must review it/i,
    );
    expect(screen.queryByTestId('housegains.choreDetail.moderation')).toBeNull();
    expect(screen.queryByTestId('housegains.choreDetail.markPartial')).toBeNull();
    expect(screen.queryByTestId('housegains.choreDetail.markNotDone')).toBeNull();
  });

  test('a legacy dispute without completionIds blocks through its subtaskIds', async () => {
    const dispute = makeDispute({ subtaskIds: ['feed'], completerIds: ['edu'] });
    await renderWithProviders(
      <ChoreDetailScreen
        {...choreDetailProps({
          instance: ownFeedInstance(),
          disputes: [dispute],
          onModerate: jest.fn(),
        })}
      />,
    );
    expect(screen.getByTestId('housegains.choreDetail.conflict')).toBeTruthy();
    expect(screen.queryByTestId('housegains.choreDetail.markPartial')).toBeNull();
  });

  test('a dispute that covers only other members’ completions keeps Partial for the admin', async () => {
    // Edu's 'feed' is not in the dispute (and the report named a completion that was replaced).
    const dispute = makeDispute({
      subtaskIds: ['feed', 'walk'],
      completionIds: ['c-walk'],
      completerIds: ['rafa'],
    });
    await renderWithProviders(
      <ChoreDetailScreen
        {...choreDetailProps({
          instance: ownFeedInstance(),
          disputes: [dispute],
          onModerate: jest.fn(),
        })}
      />,
    );
    expect(screen.getByTestId('housegains.choreDetail.markPartial')).toBeTruthy();
    expect(screen.getByTestId('housegains.choreDetail.conflict')).toBeTruthy();
  });

  test('the sole admin keeps both actions while an open dispute covers their own completion', async () => {
    const dispute = makeDispute({
      subtaskIds: ['feed'],
      completionIds: ['c-feed'],
      completerIds: ['edu'],
    });
    await renderWithProviders(
      <ChoreDetailScreen
        {...choreDetailProps({
          instance: ownFeedInstance(),
          disputes: [dispute],
          onModerate: jest.fn(),
          rosterMembers: [members[0], members[1]],
        })}
      />,
    );
    expect(screen.getByTestId('housegains.choreDetail.markPartial')).toBeTruthy();
    expect(screen.getByTestId('housegains.choreDetail.markNotDone')).toBeTruthy();
    expect(screen.queryByTestId('housegains.choreDetail.conflict')).toBeNull();
  });
});

describe('HouseGains retired instances are read-only history (chore detail)', () => {
  const retiredInstance = (overrides: Partial<Instance> = {}) =>
    makeInstance({
      retiredAt: '2026-11-24T11:00:00.000Z',
      completions: [completion('feed', 'bia', 3), completion('walk', 'rafa', 30)],
      ...overrides,
    });

  test('shows the history with no complete, undo, report or moderate actions for a member', async () => {
    // Bia completed 'feed' three minutes ago (undo window still open on a live instance) and
    // 'paws' is open; Rafa's 'walk' is reportable on a live instance.
    await renderWithProviders(
      <ChoreDetailScreen
        {...choreDetailProps({
          currentMember: members[1],
          instance: retiredInstance(),
          onModerate: jest.fn(),
          onReport: jest.fn(),
        })}
      />,
    );
    expect(screen.getByTestId('housegains.choreDetail.subtask.feed.receipt')).toBeTruthy();
    expect(screen.getByTestId('housegains.choreDetail.subtask.walk.receipt')).toBeTruthy();
    expect(screen.queryByTestId('housegains.choreDetail.done.paws')).toBeNull();
    expect(screen.queryByTestId('housegains.choreDetail.undo.feed')).toBeNull();
    expect(screen.queryByTestId('housegains.choreDetail.reportNotDone')).toBeNull();
    expect(screen.queryByTestId('housegains.choreDetail.bonusLocked')).toBeNull();
  });

  test('shows no moderation for an admin', async () => {
    await renderWithProviders(
      <ChoreDetailScreen
        {...choreDetailProps({
          instance: retiredInstance({
            completions: [completion('feed', 'bia', 60), completion('walk', 'rafa', 30)],
          }),
          onModerate: jest.fn(),
        })}
      />,
    );
    expect(screen.getByTestId('housegains.choreDetail.subtask.feed.receipt')).toBeTruthy();
    expect(screen.queryByTestId('housegains.choreDetail.moderation')).toBeNull();
    expect(screen.queryByTestId('housegains.choreDetail.markNotDone')).toBeNull();
    expect(screen.queryByTestId('housegains.choreDetail.markPartial')).toBeNull();
    expect(screen.queryByTestId('housegains.choreDetail.reviewWindowClosed')).toBeNull();
  });

  test('the same instance without retiredAt still offers the actions', async () => {
    await renderWithProviders(
      <ChoreDetailScreen
        {...choreDetailProps({
          currentMember: members[1],
          instance: makeInstance({
            completions: [completion('feed', 'bia', 3), completion('walk', 'rafa', 30)],
          }),
          onModerate: jest.fn(),
          onReport: jest.fn(),
        })}
      />,
    );
    expect(screen.getByTestId('housegains.choreDetail.done.paws')).toBeTruthy();
    expect(screen.getByTestId('housegains.choreDetail.undo.feed')).toBeTruthy();
    expect(screen.getByTestId('housegains.choreDetail.reportNotDone')).toBeTruthy();
  });
});

describe('HouseGains ranks last-week card', () => {
  const household = {
    id: 'home',
    name: 'Willow House',
    icon: '🏠',
    color: '#FFD33D',
    timeZone: 'UTC',
    members,
    formerMembers: [
      { id: 'gone', name: 'Gone', initials: 'GO', color: '#999999', role: 'member' as const },
    ],
    invite: {
      code: 'HG7K2P',
      expiresAt: '2027-01-01T00:00:00.000Z',
      uses: 0,
      maxUses: 8,
      revoked: false,
    },
  };

  async function renderRanks(lastWeek: WeekStandings | null) {
    return renderWithProviders(
      <HouseholdRanksScreen
        household={household}
        members={members}
        weeklyTotals={{}}
        currentMember={members[0]}
        lastWeek={lastWeek}
        onNavigate={jest.fn()}
      />,
    );
  }

  test('shows the top member and the wall of shame from the latest closed week', async () => {
    const view = await renderRanks(
      makeWeek(
        { memberId: 'bia', xp: 40, subtasks: 8 },
        {
          memberId: 'gone',
          missed: 3,
          assignedDue: 5,
        },
      ),
    );
    expect(view.getByTestId('housegains.ranks.lastWeek.top')).toHaveTextContent(
      /Top member of the week/i,
    );
    expect(view.getByTestId('housegains.ranks.lastWeek.topName')).toHaveTextContent(/Bia/);
    expect(view.getByTestId('housegains.ranks.lastWeek.top')).toHaveTextContent(/8 steps done/);
    expect(view.getByTestId('housegains.ranks.lastWeek.shame')).toHaveTextContent(/Wall of shame/i);
    // A tombstoned member keeps their name in the closed-week snapshot.
    expect(view.getByTestId('housegains.ranks.lastWeek.shameName')).toHaveTextContent(/Gone/);
    expect(view.getByTestId('housegains.ranks.lastWeek.shame')).toHaveTextContent(/3 of 5/);
  });

  test('hides each part when it is null', async () => {
    const onlyTop = await renderRanks(makeWeek({ memberId: 'bia', xp: 40, subtasks: 8 }, null));
    expect(onlyTop.getByTestId('housegains.ranks.lastWeek.top')).toBeTruthy();
    expect(onlyTop.queryByTestId('housegains.ranks.lastWeek.shame')).toBeNull();

    const onlyShame = await renderRanks(
      makeWeek(null, { memberId: 'rafa', missed: 2, assignedDue: 4 }),
    );
    expect(onlyShame.queryByTestId('housegains.ranks.lastWeek.top')).toBeNull();
    expect(onlyShame.getByTestId('housegains.ranks.lastWeek.shame')).toBeTruthy();
    expect(onlyShame.getByTestId('housegains.ranks.lastWeek.shameName')).toHaveTextContent(/Rafa/);
  });

  test('shows the empty state before any week has closed', async () => {
    const view = await renderRanks(null);
    expect(view.getByTestId('housegains.ranks.lastWeek.empty')).toHaveTextContent(
      /No week has closed yet/i,
    );
    expect(view.queryByTestId('housegains.ranks.lastWeek.top')).toBeNull();
    expect(view.queryByTestId('housegains.ranks.lastWeek.shame')).toBeNull();
  });
});

describe('HouseGains moderation in all three themes', () => {
  const themeCases = ['arcade', 'sticker', 'soft'] as const;

  test.each(themeCases)('renders the reports screen in %s', async (themeId) => {
    mockTheme.id = themeId;
    const view = await renderWithProviders(
      <AdminReportsScreen
        currentMember={members[0]}
        disputes={[makeDispute()]}
        hasError={false}
        instances={[makeInstance()]}
        members={members}
        onBack={jest.fn()}
        onResolve={jest.fn()}
        onRetry={jest.fn()}
      />,
    );
    expect(view.getByTestId('housegains.reports.dispute.dog-care-today')).toBeTruthy();
    // The theme actually applied: the screen canvas comes from that theme's tokens.
    const screenHost = view.getByTestId('housegains.reports');
    expect(screenHost.props.style[1].backgroundColor).toBe(getThemeTokens(themeId).canvas);
  });

  test.each(themeCases)('renders the last-week card in %s', async (themeId) => {
    mockTheme.id = themeId;
    const view = await renderWithProviders(
      <HouseholdRanksScreen
        household={{
          id: 'home',
          name: 'Willow House',
          icon: '🏠',
          color: '#FFD33D',
          members,
          invite: {
            code: 'HG7K2P',
            expiresAt: '2027-01-01T00:00:00.000Z',
            uses: 0,
            maxUses: 8,
            revoked: false,
          },
        }}
        members={members}
        weeklyTotals={{}}
        currentMember={members[0]}
        lastWeek={makeWeek(
          { memberId: 'bia', xp: 40, subtasks: 8 },
          { memberId: 'rafa', missed: 1, assignedDue: 4 },
        )}
        onNavigate={jest.fn()}
      />,
    );
    expect(view.getByTestId('housegains.ranks.lastWeek.top')).toHaveTextContent(
      /Top member of the week/i,
    );
    expect(view.getByTestId('housegains.ranks.lastWeek.shame')).toHaveTextContent(/Wall of shame/i);
    expect(view.getByTestId('housegains.tab.ranks').props.style[1].backgroundColor).toBe(
      getThemeTokens(themeId).canvas,
    );
  });

  test.each(themeCases)('renders the report sheet in %s', async (themeId) => {
    mockTheme.id = themeId;
    await renderWithProviders(
      <ReportCompletionSheet
        onClose={jest.fn()}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
        steps={[
          { id: 'feed', label: 'Feed', completer: 'Bia' },
          { id: 'walk', label: 'Walk', completer: 'Rafa' },
        ]}
        testID="theme.sheet"
        visible
      />,
    );
    expect(screen.getByTestId('theme.sheet')).toBeTruthy();
    expect(screen.getByTestId('theme.sheet.step.feed')).toHaveTextContent(/Feed/);
    expect(screen.getByTestId('theme.sheet.step.feed')).toHaveTextContent(/Bia/);
  });
});
