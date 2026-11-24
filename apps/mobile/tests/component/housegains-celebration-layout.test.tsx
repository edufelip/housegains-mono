import { render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { getThemeTokens } from '@/features/appearance/tokens';
import { THEME_IDS, type ThemeId } from '@/features/appearance/types';
import { CelebrationScreen } from '@/features/housegains-screens/chore-completion-screens';
import { SUPPORTED_LOCALES } from '@/localization/core';
import { HOUSEGAINS_DICTIONARIES } from '@/localization/housegains/catalog';
import type { Chore, Instance, Member } from '@/features/household';

let mockTheme: ThemeId = 'arcade';
let mockLocale = 'en-US';

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
jest.mock('@/localization/housegains', () => {
  const { translateHouseGains: translate } = jest.requireActual(
    '@/localization/housegains/catalog',
  );
  return {
    useHouseGainsTranslation: () => ({
      locale: mockLocale,
      t: (key: string, params?: Record<string, string | number>) =>
        translate(mockLocale, key, params),
    }),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return { ...actual, SafeAreaView: jest.requireActual('react-native').View };
});

const members: Member[] = [
  { id: 'bia', name: 'Bia', initials: 'BI', color: '#F58BB7', role: 'member' },
  { id: 'edu', name: 'Edu', initials: 'ED', color: '#FFD33D', role: 'creator' },
];
const chore: Chore = {
  id: 'dog-care',
  name: 'Take care of the dog',
  icon: '🐕',
  category: 'home',
  subtasks: [{ id: 'feed', name: 'Feed', xp: 10, position: 0 }],
  bonusXp: 15,
  assigneeIds: ['bia'],
  recurrence: 'daily',
  dueTime: '21:00',
  isActive: true,
};
const instance: Instance = {
  id: 'dog-care-today',
  choreId: chore.id,
  dueAt: '2026-11-14T00:00:00.000Z',
  subtasks: chore.subtasks,
  bonusXp: 15,
  assigneeIds: ['bia'],
  status: 'done',
  completions: [
    {
      id: 'c1',
      instanceId: 'dog-care-today',
      subtaskId: 'feed',
      memberId: 'bia',
      xp: 10,
      completedAt: '2026-11-13T11:00:00.000Z',
      isAssist: false,
    },
  ],
  bonusAwards: { bia: 15 },
};

async function renderCelebration() {
  return render(
    <CelebrationScreen
      chore={chore}
      currentMember={members[0]}
      hasError={false}
      instance={instance}
      members={members}
      onBack={jest.fn()}
      onPostToFeed={jest.fn().mockResolvedValue(undefined)}
    />,
  );
}

describe('S3 completion disc', () => {
  test.each(THEME_IDS)(
    '%s: the disc grows with its text instead of a fixed circle, and holds only the big number and its word',
    async (themeId) => {
      mockTheme = themeId;
      mockLocale = 'en-US';
      await renderCelebration();
      const tokens = getThemeTokens(themeId);
      const disc = screen.getByTestId('housegains.celebration.disc');
      const style = StyleSheet.flatten(disc.props.style);
      // Regression: it used to be a fixed 148/132 dp circle, so "100% complete" and the bonus
      // sentence spilled out at default size in every language.
      expect(style.width).toBeUndefined();
      expect(style.height).toBeUndefined();
      expect(style.minWidth).toBe(themeId === 'sticker' ? 148 : 132);
      expect(style.minHeight).toBe(themeId === 'sticker' ? 148 : 132);
      expect(style.borderRadius).toBe(999);
      expect(style.maxWidth).toBe('100%');

      const value = within(disc).getByTestId('housegains.celebration.percentValue');
      const word = within(disc).getByTestId('housegains.celebration.percentWord');
      expect(value).toHaveTextContent('100%');
      expect(word).toHaveTextContent('complete');
      // The big number is one line that shrinks to fit rather than spilling out, in the display type role.
      expect(value.props.numberOfLines).toBe(1);
      expect(value.props.adjustsFontSizeToFit).toBe(true);
      expect(StyleSheet.flatten(value.props.style).fontSize).toBe(tokens.type.display.fontSize);
      expect(word.props.numberOfLines).toBe(1);
      expect(word.props.adjustsFontSizeToFit).toBe(true);
      // Text scaling stays on, so the largest system text size grows the disc.
      expect(value.props.allowFontScaling).toBe(true);

      // The bonus sentence is outside the disc, below it.
      expect(within(disc).queryByTestId('housegains.celebration.bonus')).toBeNull();
      expect(screen.getByTestId('housegains.celebration.bonus')).toHaveTextContent(
        'You earned +15 bonus XP',
      );
    },
  );

  test.each(SUPPORTED_LOCALES)(
    '%s: every disc string exists and the disc keeps one number line and one word line',
    async (locale) => {
      mockLocale = locale;
      mockTheme = 'soft';
      await renderCelebration();
      const dictionary = HOUSEGAINS_DICTIONARIES[locale];
      expect(dictionary['housegains.screens.celebration.percentValue']).toBeTruthy();
      expect(dictionary['housegains.screens.celebration.percentWord']).toBeTruthy();
      const disc = screen.getByTestId('housegains.celebration.disc');
      // The word is a single short word, not the old "{percent}% complete" sentence.
      expect(within(disc).getByTestId('housegains.celebration.percentWord').props.children).toBe(
        dictionary['housegains.screens.celebration.percentWord'],
      );
      expect(dictionary['housegains.screens.celebration.percentWord']).not.toMatch(/\{/);
      expect(disc.props.accessibilityLabel).toBe(
        dictionary['housegains.screens.celebration.percent'].replace('{percent}', '100'),
      );
    },
  );
});
