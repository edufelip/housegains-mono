import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { getThemeTokens } from '@/features/appearance/tokens';
import { AwayWeeksError } from '@/features/gamification/away-weeks-error';
import { WeeklyStreakScreen } from '@/features/gamification/weekly-streak-screen';
import { fakeWallet } from './gamification-support';
import type { Wallet } from '@/features/gamification/types';

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
    useAppearance: () => ({ themeId: 'soft', tokens: tokensFor('soft') }),
  };
});
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return new Proxy(actual, {
    get: (target, property) =>
      property === 'useReducedMotion' ? () => mockReduced : target[property],
  });
});
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return {
    ...actual,
    SafeAreaView: jest.requireActual('react-native').View,
  };
});

// Tuesday of the week after the fixture's last closed week (2026-11-16).
const NOW = new Date('2026-11-24T12:00:00.000Z');

async function renderStreak(
  wallet: Wallet | null,
  onSave = jest.fn(async (weeks: string[]) => weeks),
) {
  await render(
    <WeeklyStreakScreen
      now={NOW}
      onBack={jest.fn()}
      onSaveAwayWeeks={onSave}
      timeZone="UTC"
      wallet={wallet}
    />,
  );
  return onSave;
}

beforeEach(() => {
  mockReduced = false;
  jest.useFakeTimers();
});

describe('WeeklyStreakScreen', () => {
  test('counted streak: counter, words, record, week cells, secured week and next milestone', async () => {
    await renderStreak(fakeWallet());
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(screen.getByTestId('housegains.streak.count')).toHaveTextContent('5 weeks in a row');
    expect(screen.getByTestId('housegains.streak.record')).toHaveTextContent('Record: 9 weeks');
    expect(
      screen.getByTestId('housegains.streak.counter', { includeHiddenElements: true }),
    ).toHaveTextContent('5');
    // four closed weeks plus the current one, each readable as text
    expect(
      screen.getByTestId('housegains.streak.week.2026-11-16').props.accessibilityLabel,
    ).toMatch(/counted/);
    expect(
      screen.getByTestId('housegains.streak.week.2026-11-09').props.accessibilityLabel,
    ).toMatch(/not counted/);
    expect(screen.getByTestId('housegains.streak.week.2026-11-23').props.accessibilityLabel).toBe(
      'This week: in progress',
    );
    expect(screen.getByTestId('housegains.streak.secured')).toHaveTextContent('Week secured');
    expect(screen.getByTestId('housegains.streak.nextMilestone')).toHaveTextContent(
      /8 weeks, \+100 Gains/,
    );
    expect(screen.getByTestId('housegains.streak.folgas.count')).toHaveTextContent('1 available');
    // milestones the record already reached are text too
    expect(screen.getByTestId('housegains.streak.milestone.8')).toHaveTextContent(
      /8 weeks: reached/,
    );
    expect(screen.getByTestId('housegains.streak.milestone.12')).toHaveTextContent(
      /12 weeks: \+150 Gains/,
    );
  });

  test('the counter ticks up from the previous value, then shows the final number', async () => {
    await renderStreak(fakeWallet());
    expect(
      screen.getByTestId('housegains.streak.counter', { includeHiddenElements: true }),
    ).toHaveTextContent('4');
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(
      screen.getByTestId('housegains.streak.counter', { includeHiddenElements: true }),
    ).toHaveTextContent('5');
  });

  test('reduced motion: static, final counter at once, text says the week is secured', async () => {
    mockReduced = true;
    await renderStreak(fakeWallet());
    expect(
      screen.getByTestId('housegains.streak.counter', { includeHiddenElements: true }),
    ).toHaveTextContent('5');
    expect(screen.getByTestId('housegains.streak.secured')).toHaveTextContent('Week secured');
  });

  test('broken streak: a calm message with the record, no zero and no danger color', async () => {
    const tokens = getThemeTokens('soft');
    await renderStreak(
      fakeWallet({
        streak: { ...fakeWallet().streak, current: 0, record: 9 },
      }),
    );
    const broken = screen.getByTestId('housegains.streak.broken');
    expect(broken).toHaveTextContent('Your streak is resting. Record: 9 weeks.');
    expect(
      screen.queryByTestId('housegains.streak.counter', { includeHiddenElements: true }),
    ).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
    const flat = StyleSheet.flatten(broken.props.style) ?? {};
    expect(flat.color).not.toBe(tokens.danger);
    // the hero card carries no danger styling either
    const hero = StyleSheet.flatten(screen.getByTestId('housegains.streak.hero').props.style);
    expect(hero.borderColor).not.toBe(tokens.danger);
    expect(hero.backgroundColor).not.toBe(tokens.danger);
  });

  test('a record of one week uses the singular', async () => {
    await renderStreak(fakeWallet({ streak: { ...fakeWallet().streak, current: 0, record: 1 } }));
    expect(screen.getByTestId('housegains.streak.broken')).toHaveTextContent(
      'Your streak is resting. Record: 1 week.',
    );
  });

  test('no wallet yet: invites the first week', async () => {
    await renderStreak(null);
    expect(screen.getByTestId('housegains.streak.none')).toHaveTextContent(/Start your streak/);
    expect(
      screen.queryByTestId('housegains.streak.counter', { includeHiddenElements: true }),
    ).toBeNull();
  });

  describe('away mode', () => {
    test('saves the picked Mondays and confirms', async () => {
      const onSave = await renderStreak(fakeWallet());
      await fireEvent.press(screen.getByTestId('housegains.streak.away.week.2026-11-30'));
      await fireEvent.press(screen.getByTestId('housegains.streak.away.week.2026-12-07'));
      await act(async () => {
        await fireEvent.press(screen.getByTestId('housegains.streak.away.save'));
      });
      expect(onSave).toHaveBeenCalledWith(['2026-11-30', '2026-12-07']);
      expect(screen.getByTestId('housegains.streak.away.saved')).toHaveTextContent(
        'Away weeks saved.',
      );
      expect(screen.queryByTestId('housegains.streak.away.errors')).toBeNull();
    });

    test('shows the yearly limit before calling the server (past weeks count)', async () => {
      const wallet = fakeWallet();
      wallet.streak.awayWeeks = ['2026-02-02', '2026-03-02'];
      const onSave = await renderStreak(wallet);
      await fireEvent.press(screen.getByTestId('housegains.streak.away.week.2026-11-30'));
      await fireEvent.press(screen.getByTestId('housegains.streak.away.week.2026-12-07'));
      await act(async () => {
        await fireEvent.press(screen.getByTestId('housegains.streak.away.save'));
      });
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByTestId('housegains.streak.away.errors')).toHaveTextContent(
        /at most 3 away weeks per calendar year \(2026\)/,
      );
      expect(screen.queryByTestId('housegains.streak.away.saved')).toBeNull();
    });

    test('shows a server validation error as text with an icon', async () => {
      const onSave = jest.fn(async (_weeks: string[]): Promise<string[]> => {
        throw new AwayWeeksError({ key: 'housegains.gamification.away.error.notFuture' });
      });
      await renderStreak(fakeWallet(), onSave);
      await fireEvent.press(screen.getByTestId('housegains.streak.away.week.2026-11-30'));
      await act(async () => {
        await fireEvent.press(screen.getByTestId('housegains.streak.away.save'));
      });
      expect(onSave).toHaveBeenCalledTimes(1);
      const errors = screen.getByTestId('housegains.streak.away.errors');
      expect(errors).toHaveTextContent(/Away weeks must start in the future\./);
      expect(errors).toHaveTextContent(/alert-circle-outline/);
    });

    test('a failure that is not an AwayWeeksError shows the generic message', async () => {
      const onSave = jest.fn(async (_weeks: string[]): Promise<string[]> => {
        throw new Error('boom');
      });
      await renderStreak(fakeWallet(), onSave);
      await act(async () => {
        await fireEvent.press(screen.getByTestId('housegains.streak.away.save'));
      });
      expect(screen.getByTestId('housegains.streak.away.errors')).toHaveTextContent(
        /Could not save your away weeks/,
      );
    });

    test('chips expose a checked state besides their color, and weeks already saved start selected', async () => {
      const wallet = fakeWallet();
      wallet.streak.awayWeeks = ['2026-12-07'];
      await renderStreak(wallet);
      expect(
        screen.getByTestId('housegains.streak.away.week.2026-12-07').props.accessibilityState,
      ).toEqual({
        checked: true,
      });
      expect(
        screen.getByTestId('housegains.streak.away.week.2026-11-30').props.accessibilityState,
      ).toEqual({
        checked: false,
      });
      expect(screen.getByTestId('housegains.streak.away.week.2026-12-07')).toHaveTextContent(
        /checkmark-circle/,
      );
    });

    test('keeps the save button disabled while saving', async () => {
      let finish: (weeks: string[]) => void = () => undefined;
      const onSave = jest.fn(
        (weeks: string[]) =>
          new Promise<string[]>((resolve) => {
            finish = resolve;
            void weeks;
          }),
      );
      await renderStreak(fakeWallet(), onSave);
      await fireEvent.press(screen.getByTestId('housegains.streak.away.week.2026-11-30'));
      await act(async () => {
        await fireEvent.press(screen.getByTestId('housegains.streak.away.save'));
      });
      expect(
        screen.getByTestId('housegains.streak.away.save').props.accessibilityState.disabled,
      ).toBe(true);
      expect(screen.getByTestId('housegains.streak.away.save')).toHaveTextContent('Saving…');
      await act(async () => {
        finish(['2026-11-30']);
      });
      expect(screen.getByTestId('housegains.streak.away.saved')).toBeTruthy();
    });
  });
});
