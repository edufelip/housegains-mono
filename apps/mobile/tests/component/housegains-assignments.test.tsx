import { act, fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/features/appearance';
import { AssignChoresScreen } from '@/features/housegains-screens/household-flow-screens';
import type { Chore, Household, Member } from '@/features/household';

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

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));

const members: Member[] = [
  { id: 'bia', name: 'Bia', initials: 'BI', color: '#F58BB7', role: 'member' },
  { id: 'rafa', name: 'Rafa', initials: 'RA', color: '#25DDA3', role: 'member' },
  { id: 'edu', name: 'Edu', initials: 'ED', color: '#FFD33D', role: 'creator' },
];

const household: Household = {
  id: 'household-1',
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
};

const chore: Chore = {
  id: 'dog-care',
  name: 'Take care of the dog',
  icon: '🐕',
  category: 'home',
  subtasks: [{ id: 'feed', name: 'Feed', xp: 10, position: 0 }],
  bonusXp: 0,
  assigneeIds: [],
  recurrence: 'daily',
  dueTime: '21:00',
  isActive: true,
};

describe('HouseGains chore assignments', () => {
  test('ignores another member tap while the chore assignment is pending', async () => {
    const onSetAssignments = jest.fn(() => new Promise<void>(() => undefined));

    const view = await render(
      <ThemeProvider>
        <AssignChoresScreen
          household={household}
          chores={[chore]}
          members={members}
          currentMember={members[2]}
          onBack={jest.fn()}
          onFinish={jest.fn().mockResolvedValue(undefined)}
          onSetAssignments={onSetAssignments}
          hasError={false}
        />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(view.getByTestId('housegains.assignments.dog-care.bia'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('housegains.assignments.dog-care.rafa'));
      await Promise.resolve();
    });

    expect(onSetAssignments).toHaveBeenCalledTimes(1);
    expect(onSetAssignments).toHaveBeenCalledWith('dog-care', ['bia']);
  });
});
