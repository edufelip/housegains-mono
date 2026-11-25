import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GanhosToast } from '@/components/housegains/gamification/ganhos-toast';
import { getThemeTokens } from '@/features/appearance/tokens';
import { THEME_IDS, type ThemeId } from '@/features/appearance/types';

let mockTheme: ThemeId = 'arcade';
let mockReduced = false;

jest.mock('@/features/appearance', () => {
  const { getThemeTokens: tokensFor } = jest.requireActual('@/features/appearance/tokens');
  return {
    getThemeTokens: tokensFor,
    useAppearance: () => ({ themeId: mockTheme, tokens: tokensFor(mockTheme) }),
  };
});
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  // Only the system reduced-motion switch is replaced; everything else stays real.
  return new Proxy(actual, {
    get: (target, property) =>
      property === 'useReducedMotion' ? () => mockReduced : target[property],
  });
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function format(amount: number) {
  return `+${amount} Gains`;
}

async function renderToast(
  onDismiss = jest.fn(),
  overrides: Partial<Parameters<typeof GanhosToast>[0]> = {},
) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <GanhosToast
        amount={25}
        announcement="Step done. +25 Gains"
        detail="Chore step +20 · Helping hand +5"
        dismissLabel="Dismiss"
        formatAmount={format}
        icon="sparkles"
        onDismiss={onDismiss}
        title="Step done"
        {...overrides}
      />
    </SafeAreaProvider>,
  );
  return onDismiss;
}

describe('GanhosToast', () => {
  beforeEach(() => {
    mockTheme = 'arcade';
    mockReduced = false;
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  });

  test('counts the amount up to the final number, with particles, and announces the same copy', async () => {
    await renderToast();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Step done. +25 Gains');
    // Particles are decorative and hidden from screen readers, so look them up explicitly.
    expect(
      screen.getByTestId('housegains.gamification.toast.particles', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(screen.getByText('Step done')).toBeTruthy();
    expect(screen.getByTestId('housegains.gamification.toast.detail')).toHaveTextContent(
      'Chore step +20 · Helping hand +5',
    );
    // It starts at zero and counts up (500 ms), so the animation really runs.
    expect(screen.getByTestId('housegains.gamification.toast.amount')).toHaveTextContent(
      '+0 Gains',
    );
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    expect(screen.getByTestId('housegains.gamification.toast.amount')).toHaveTextContent(
      '+25 Gains',
    );
    // the pressable's accessible name is the announced copy, final number included
    expect(screen.getByTestId('housegains.gamification.toast').props.accessibilityLabel).toBe(
      'Step done. +25 Gains',
    );
  });

  test('dismisses itself after 2.4 s, not before', async () => {
    const onDismiss = await renderToast();
    await act(async () => {
      jest.advanceTimersByTime(2300);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(150);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('a tap dismisses it, and the wrapper lets touches through to the list below', async () => {
    const onDismiss = await renderToast();
    const toast = screen.getByTestId('housegains.gamification.toast');
    // The full-screen layer is box-none: only the toast itself takes touches.
    let layer = toast.parent;
    while (layer && layer.props.pointerEvents === undefined) layer = layer.parent;
    expect(layer?.props.pointerEvents).toBe('box-none');
    await fireEvent.press(toast);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('reduced motion: final number at once, no particles, stays 3 s', async () => {
    mockReduced = true;
    const onDismiss = await renderToast();
    expect(screen.getByTestId('housegains.gamification.toast.amount')).toHaveTextContent(
      '+25 Gains',
    );
    expect(
      screen.queryByTestId('housegains.gamification.toast.particles', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(2600);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('an amount-less toast (for example a badge) shows no number', async () => {
    await renderToast(jest.fn(), { amount: undefined, detail: undefined });
    expect(screen.queryByTestId('housegains.gamification.toast.amount')).toBeNull();
  });

  test.each(THEME_IDS)('renders from the %s theme tokens', async (themeId) => {
    mockTheme = themeId;
    await renderToast();
    const tokens = getThemeTokens(themeId);
    const flat = Object.assign(
      {},
      ...[screen.getByTestId('housegains.gamification.toast').props.style].flat(Infinity),
    );
    // The Pressable's style is a plain object in tests.
    expect(flat.backgroundColor).toBe(tokens.surface);
    expect(flat.borderColor).toBe(tokens.border);
    expect(flat.borderRadius).toBe(tokens.radius);
  });
});
