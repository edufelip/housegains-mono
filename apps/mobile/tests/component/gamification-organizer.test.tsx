import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { getThemeTokens } from '@/features/appearance/tokens';
import { THEME_IDS, type ThemeId } from '@/features/appearance/types';
import { OrganizerCard, onTimeRate } from '@/features/gamification/organizer-card';
import type { Organizer } from '@/features/gamification/types';

let mockTheme: ThemeId = 'arcade';
let mockReduced = false;

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
    useAppearance: () => ({ themeId: mockTheme, tokens: tokensFor(mockTheme) }),
  };
});
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return new Proxy(actual, {
    get: (target, property) =>
      property === 'useReducedMotion' ? () => mockReduced : target[property],
  });
});

const organizer: Organizer = {
  memberId: 'me',
  zelo: 230,
  lifetimeZelo: 300,
  level: 2,
  streak: {
    current: 3,
    record: 4,
    lastCountedWeek: '2026-11-16',
    lastActionWeek: '2026-11-16',
    folgas: 1,
    folgaProgress: 0,
  },
  achievements: {
    host: { tier: 'bronze', unlockedAt: '2026-11-01T00:00:00.000Z' },
    order: { tier: 'bronze', unlockedAt: '2026-11-02T00:00:00.000Z', active: false },
  },
  orderWeeks: [
    { weekStart: '2026-10-26', due: 10, onTime: 8 },
    { weekStart: '2026-11-02', due: 10, onTime: 9 },
    { weekStart: '2026-11-09', due: 5, onTime: 3 },
    { weekStart: '2026-11-16', due: 5, onTime: 5 },
  ],
};

beforeEach(() => {
  mockTheme = 'arcade';
  mockReduced = false;
  jest.useFakeTimers();
});

describe('OrganizerCard', () => {
  test('shows Care, the organizer title, the house streak and achievements to the household', async () => {
    await render(
      <OrganizerCard creatorName="Edu" onRetry={jest.fn()} organizer={organizer} status="ready" />,
    );
    expect(screen.getByText('Edu')).toBeTruthy();
    expect(screen.getByTestId('housegains.organizer.zelo')).toHaveTextContent('230 Care');
    // 230 Care is the second title band
    expect(screen.getByTestId('housegains.organizer.rank')).toHaveTextContent(
      'Level 2 · House Manager',
    );
    expect(screen.getByTestId('housegains.organizer.streak')).toHaveTextContent(/House up to date/);
    expect(screen.getByTestId('housegains.organizer.streak.text')).toHaveTextContent(
      '3 weeks in a row',
    );
    expect(screen.getByTestId('housegains.organizer.achievement.host')).toHaveTextContent(/Host/);
    expect(
      screen.getByTestId('housegains.organizer.achievement.host').props.accessibilityLabel,
    ).toBe('Host. Bronze tier');
    // never shows a spendable balance
    expect(screen.queryByText(/Gains/)).toBeNull();
  });

  test('health ring shows the on-time rate in text, with a bar per week', async () => {
    await render(
      <OrganizerCard creatorName="Edu" onRetry={jest.fn()} organizer={organizer} status="ready" />,
    );
    await act(async () => {
      jest.advanceTimersByTime(900);
    });
    // 25 of 30 on time = 83 %
    expect(screen.getByTestId('housegains.organizer.health.percent')).toHaveTextContent('83%');
    expect(
      screen.getByTestId('housegains.organizer.week.2026-11-09').props.accessibilityLabel,
    ).toBe('Week of 2026-11-09: 3 of 5 on time');
  });

  test('reduced motion still shows the rate and the bars', async () => {
    mockReduced = true;
    await render(
      <OrganizerCard creatorName="Edu" onRetry={jest.fn()} organizer={organizer} status="ready" />,
    );
    expect(screen.getByTestId('housegains.organizer.health.percent')).toHaveTextContent('83%');
  });

  test('before the organizer earned anything: zero Care, a start message, no zeros for the streak', async () => {
    await render(
      <OrganizerCard creatorName="Edu" onRetry={jest.fn()} organizer={null} status="ready" />,
    );
    expect(screen.getByTestId('housegains.organizer.zelo')).toHaveTextContent('0 Care');
    expect(screen.getByTestId('housegains.organizer.streak.text')).toHaveTextContent(
      'Keep 60% of chores on time in a week to start the streak.',
    );
    expect(screen.getByTestId('housegains.organizer.health')).toHaveTextContent(
      /after the first closed week/,
    );
    expect(screen.getByTestId('housegains.organizer.achievements')).toHaveTextContent(
      /No organizer achievements yet/,
    );
  });

  test('a broken streak is calm and keeps the record', async () => {
    await render(
      <OrganizerCard
        creatorName="Edu"
        onRetry={jest.fn()}
        organizer={{ ...organizer, streak: { ...organizer.streak, current: 0, record: 6 } }}
        status="ready"
      />,
    );
    expect(screen.getByTestId('housegains.organizer.streak.text')).toHaveTextContent(
      'The streak is resting. Record: 6 weeks.',
    );
  });

  test('loading and error (with retry) use the state panel', async () => {
    const onRetry = jest.fn();
    const view = await render(
      <OrganizerCard creatorName="Edu" onRetry={onRetry} organizer={null} status="loading" />,
    );
    expect(screen.getByTestId('housegains.organizer.loading')).toBeTruthy();
    await view.rerender(
      <OrganizerCard creatorName="Edu" onRetry={onRetry} organizer={null} status="error" />,
    );
    await fireEvent.press(screen.getByTestId('housegains.organizer.error.action'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test.each(THEME_IDS)('is built from the %s theme tokens', async (themeId) => {
    mockTheme = themeId;
    await render(
      <OrganizerCard creatorName="Edu" onRetry={jest.fn()} organizer={organizer} status="ready" />,
    );
    const tokens = getThemeTokens(themeId);
    const card = StyleSheet.flatten(screen.getByTestId('housegains.organizer.card').props.style);
    expect(card.backgroundColor).toBe(tokens.surface);
    expect(card.borderRadius).toBe(tokens.radius);
  });

  test('onTimeRate sums due and on-time instances and ignores empty weeks', () => {
    expect(onTimeRate([])).toBeNull();
    expect(onTimeRate([{ weekStart: '2026-11-09', due: 0, onTime: 0 }])).toBeNull();
    expect(onTimeRate(organizer.orderWeeks)).toBeCloseTo(25 / 30);
  });
});
