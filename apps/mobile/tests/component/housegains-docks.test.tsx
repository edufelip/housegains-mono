import { fireEvent, render, screen } from '@testing-library/react-native';
import { ArcadeDock, SoftDock, StickerDock } from '@/components/housegains/variants';
import { THEME_IDS, type ThemeId } from '@/features/appearance/types';
import { SUPPORTED_LOCALES } from '@/localization/core';
import { HOUSEGAINS_DICTIONARIES, translateHouseGains } from '@/localization/housegains/catalog';
import type { AppTab } from '@/features/housegains-screens/screen-types';

let mockTheme: ThemeId = 'arcade';
let mockLocale = 'en-US';

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

const DOCKS: Record<ThemeId, typeof ArcadeDock> = {
  arcade: ArcadeDock,
  sticker: StickerDock,
  soft: SoftDock,
};
const TABS: AppTab[] = ['today', 'feed', 'add', 'ranks', 'me'];

describe('bottom docks', () => {
  test.each(THEME_IDS)(
    '%s dock labels every tab with its real localized name, in all six languages',
    async (themeId) => {
      mockTheme = themeId;
      const Dock = DOCKS[themeId];
      for (const locale of SUPPORTED_LOCALES) {
        mockLocale = locale;
        const view = await render(<Dock active="today" onNavigate={jest.fn()} />);
        for (const tab of TABS) {
          const key = `housegains.screens.tabs.${tab}`;
          const expected = HOUSEGAINS_DICTIONARIES[locale][key];
          // the key must exist in the bundle: an unknown key would be humanized into "Screens tabs ..."
          expect(expected).toBeTruthy();
          const node = screen.getByTestId(`housegains.dock.${themeId}.${tab}`);
          expect(node.props.accessibilityLabel).toBe(expected);
          expect(node.props.accessibilityLabel).not.toMatch(/screens tabs/i);
        }
        expect(screen.queryByText(/Screens tabs/i)).toBeNull();
        await view.unmount();
      }
    },
  );

  test.each(THEME_IDS)(
    '%s dock shows the visible name of each inactive tab and marks the active tab',
    async (themeId) => {
      mockTheme = themeId;
      mockLocale = 'en-US';
      const Dock = DOCKS[themeId];
      const onNavigate = jest.fn();
      await render(<Dock active="ranks" onNavigate={onNavigate} />);
      // The create action is icon-only and Soft Home shows the active tab as an icon pill; every
      // tab still has its accessibility label (checked above).
      for (const tab of TABS.filter((item) => item !== 'add' && item !== 'ranks')) {
        expect(
          screen.getByText(translateHouseGains('en-US', `housegains.screens.tabs.${tab}`)),
        ).toBeTruthy();
      }
      expect(
        screen.getByTestId(`housegains.dock.${themeId}.ranks`).props.accessibilityState.selected,
      ).toBe(true);
      expect(
        screen.getByTestId(`housegains.dock.${themeId}.today`).props.accessibilityState.selected,
      ).toBe(false);
      await fireEvent.press(screen.getByTestId(`housegains.dock.${themeId}.feed`));
      expect(onNavigate).toHaveBeenCalledWith('feed');
    },
  );
});
