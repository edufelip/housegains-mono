import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { getThemeTokens } from '@/features/appearance/tokens';
import { THEME_IDS, type ThemeId } from '@/features/appearance/types';
import { WalletScreen, type WalletScreenProps } from '@/features/gamification/wallet-screen';
import { fakeLedger, fakeWallet, me } from './gamification-support';

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
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return { ...actual, SafeAreaView: jest.requireActual('react-native').View };
});

function props(overrides: Partial<WalletScreenProps> = {}): WalletScreenProps {
  return {
    status: 'ready',
    wallet: fakeWallet(),
    ledger: fakeLedger(),
    member: { ...me, xp: 1000, xpPeak: 1000, levelFloor: 1 },
    totalXp: 1000,
    lastSeenBalance: 100,
    onBalanceSeen: jest.fn(),
    onBack: jest.fn(),
    onRetry: jest.fn(),
    onOpenStreak: jest.fn(),
    ...overrides,
  };
}

async function renderWallet(overrides: Partial<WalletScreenProps> = {}) {
  const p = props(overrides);
  await render(<WalletScreen {...p} />);
  return p;
}

beforeEach(() => {
  mockTheme = 'arcade';
  mockReduced = false;
  jest.useFakeTimers();
});

describe('WalletScreen states', () => {
  test('loading shows the loading panel only', async () => {
    await renderWallet({ status: 'loading', wallet: null, ledger: [] });
    expect(screen.getByTestId('housegains.wallet.loading')).toBeTruthy();
    expect(screen.queryByTestId('housegains.wallet.balance')).toBeNull();
  });

  test('error offers a retry that calls onRetry', async () => {
    const p = await renderWallet({ status: 'error', wallet: null, ledger: [] });
    expect(screen.getByTestId('housegains.wallet.error').props.accessibilityRole).toBe('alert');
    expect(screen.getByText('We couldn’t load your Gains')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('housegains.wallet.error.action'));
    expect(p.onRetry).toHaveBeenCalledTimes(1);
  });

  test('a wallet that does not exist yet is an empty state that points to the streak', async () => {
    const p = await renderWallet({ wallet: null, ledger: [] });
    expect(screen.getByTestId('housegains.wallet.empty')).toBeTruthy();
    expect(screen.getByText('No Gains yet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('housegains.wallet.empty.action'));
    expect(p.onOpenStreak).toHaveBeenCalledTimes(1);
  });

  test('back goes back', async () => {
    const p = await renderWallet();
    await fireEvent.press(screen.getByTestId('housegains.wallet.back'));
    expect(p.onBack).toHaveBeenCalledTimes(1);
  });
});

describe('WalletScreen data', () => {
  test('private balance counts up from the last seen value, with pending, date and lifetime as text', async () => {
    const p = await renderWallet();
    expect(screen.getByText('Only you can see this wallet.')).toBeTruthy();
    const value = screen.getByTestId('housegains.wallet.balance.value');
    expect(value).toHaveTextContent('100');
    await act(async () => {
      jest.advanceTimersByTime(800);
    });
    expect(value).toHaveTextContent('120');
    expect(screen.getByTestId('housegains.wallet.balance').props.accessibilityLabel).toBe(
      'Available: 120 Gains',
    );
    expect(screen.getByTestId('housegains.wallet.pending')).toHaveTextContent(/Pending: 30 Gains/);
    expect(screen.getByTestId('housegains.wallet.pending')).toHaveTextContent(
      /Becomes available from Nov 25, 2026/,
    );
    expect(screen.getByTestId('housegains.wallet.lifetime')).toHaveTextContent(
      'Earned in total: 340 Gains',
    );
    // the screen records what it showed, for the next count-up
    expect(p.onBalanceSeen).toHaveBeenCalledWith(120);
  });

  test('reduced motion shows the final balance at once', async () => {
    mockReduced = true;
    await renderWallet();
    expect(screen.getByTestId('housegains.wallet.balance.value')).toHaveTextContent('120');
  });

  test('no pending line when nothing is pending', async () => {
    await renderWallet({ wallet: fakeWallet({ pendingBalance: 0, nextSpendableAt: null }) });
    expect(screen.queryByTestId('housegains.wallet.pending')).toBeNull();
  });

  test('level ring, title and progress to the next level on the new curve', async () => {
    await renderWallet();
    // levelFloor 1 and xpPeak 1000: level 5 (1000 = 50·5·4), title Tidy Titan, 1000 XP to level 6 (1500).
    expect(screen.getByTestId('housegains.wallet.level.title')).toHaveTextContent(
      'Level 5 · Tidy Titan',
    );
    expect(screen.getByTestId('housegains.wallet.level.progress')).toHaveTextContent(
      '500 XP to level 6',
    );
    expect(screen.getByLabelText(/Level 5, 0% of the way to level 6/)).toBeTruthy();
  });

  test('achievements show tiers as text, locked tiles, and active/paused pills', async () => {
    await renderWallet();
    expect(screen.getByTestId('housegains.wallet.achievements')).toHaveTextContent(/4 unlocked/);
    expect(screen.getByTestId('housegains.wallet.achievement.helper.tier')).toHaveTextContent(
      'Silver tier',
    );
    // an active badge that lapsed is paused, one that holds is active
    expect(screen.getByTestId('housegains.wallet.achievement.fit.paused')).toHaveTextContent(
      /Paused/,
    );
    expect(screen.getByTestId('housegains.wallet.achievement.pillar.active')).toHaveTextContent(
      /Active/,
    );
    expect(screen.getByTestId('housegains.wallet.achievement.spring')).toHaveTextContent(
      /Seasonal/,
    );
    // not earned yet: locked, with the way to earn it
    expect(screen.getByTestId('housegains.wallet.achievement.kitchen.locked')).toHaveTextContent(
      /Locked/,
    );
    expect(screen.getByTestId('housegains.wallet.achievement.kitchen')).toHaveTextContent(
      /Complete steps of kitchen chores/,
    );
    // organizer-only badges are not in the member wallet
    expect(screen.queryByTestId('housegains.wallet.achievement.host')).toBeNull();
    expect(
      screen.getByTestId('housegains.wallet.achievement.helper').props.accessibilityLabel,
    ).toBe('Helping Hand. Silver tier');
  });

  test('recent rows have readable rule names, signed amounts and a named reversal', async () => {
    await renderWallet();
    const subtask = screen.getByTestId('housegains.wallet.ledger.row.earn.subtask:a:me');
    expect(subtask).toHaveTextContent(/Chore step/);
    expect(
      screen.getByTestId('housegains.wallet.ledger.row.earn.subtask:a:me.amount'),
    ).toHaveTextContent('+20 Gains');
    expect(screen.getByTestId('housegains.wallet.ledger.row.earn.assist:a:me')).toHaveTextContent(
      /Helping hand/,
    );
    const reversal = screen.getByTestId('housegains.wallet.ledger.row.rev:earn.subtask:b:me');
    expect(reversal).toHaveTextContent(/Reversed: Chore step/);
    expect(
      screen.getByTestId('housegains.wallet.ledger.row.rev:earn.subtask:b:me.amount'),
    ).toHaveTextContent(/-10 Gains/);
    expect(subtask.props.accessibilityLabel).toMatch(/Chore step, \+20 Gains, Nov 24, 2026/);
  });

  test('an empty ledger explains how to earn', async () => {
    await renderWallet({ ledger: [] });
    expect(screen.getByTestId('housegains.wallet.ledger')).toHaveTextContent(
      /Complete a step to earn your first Gains/,
    );
  });

  test('the streak entry opens the weekly streak', async () => {
    const p = await renderWallet();
    expect(screen.getByTestId('housegains.wallet.streak')).toHaveTextContent(/5 weeks in a row/);
    await fireEvent.press(screen.getByTestId('housegains.wallet.streak'));
    expect(p.onOpenStreak).toHaveBeenCalledTimes(1);
  });

  test.each(THEME_IDS)('is built from the %s theme tokens', async (themeId) => {
    mockTheme = themeId;
    await renderWallet();
    const tokens = getThemeTokens(themeId);
    const card = StyleSheet.flatten(screen.getByTestId('housegains.wallet.balance').props.style);
    expect(card.backgroundColor).toBe(tokens.surface);
    expect(card.borderColor).toBe(tokens.border);
    expect(card.borderRadius).toBe(tokens.radius);
    const screenView = screen.getByTestId('housegains.wallet');
    expect(StyleSheet.flatten(screenView.props.style).backgroundColor).toBe(tokens.canvas);
  });
});
