import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Button } from '@/components/housegains/ui';
import { ThemeProvider, useAppearance } from '@/features/appearance';
import { BUNDLED_PICKER_CONFIG } from '@/features/appearance/picker-config';
import ThemePickerScreen from '@/features/onboarding/theme-picker-screen';
import { HOUSEGAINS_DICTIONARIES } from '@/localization/housegains/catalog';
import { LocaleProvider } from '@/localization/locale-context';

const mockStorage: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStorage[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStorage[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete mockStorage[key];
    }),
  },
}));

const fakeFirebase = (
  globalThis as unknown as {
    mockFirebase: {
      remoteConfigValue: string;
      remoteConfigFetches: number;
      remoteConfigFetchedValue: string | null;
    };
  }
).mockFirebase;

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
};

function AppearanceProbe() {
  const { themeId, selected, hydrated, loadError } = useAppearance();
  return (
    <>
      <Text testID="appearance.theme">{themeId}</Text>
      <Text testID="appearance.selected">{selected ?? 'none'}</Text>
      <Text testID="appearance.hydrated">{hydrated ? 'yes' : 'no'}</Text>
      <Text testID="appearance.load-error">{loadError ? 'error' : 'none'}</Text>
    </>
  );
}

function AppearanceActions() {
  const { selected, selectTheme } = useAppearance();
  return (
    <>
      <Button
        title="Arcade"
        onPress={() => void selectTheme('arcade').catch(() => {})}
        testID="action.arcade"
      />
      <Button
        title="Soft"
        onPress={() => void selectTheme('soft').catch(() => {})}
        testID="action.soft"
      />
      <Text testID="appearance.action-selected">{selected ?? 'none'}</Text>
    </>
  );
}

function renderPicker(onContinue: () => void = jest.fn()) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <LocaleProvider>
        <ThemeProvider>
          <ThemePickerScreen onContinue={onContinue} />
          <AppearanceProbe />
        </ThemeProvider>
      </LocaleProvider>
    </SafeAreaProvider>,
  );
}

// Pages off screen are hidden from accessibility, so they need includeHiddenElements.
const HIDDEN = { includeHiddenElements: true } as const;

function pageIds() {
  return screen.getAllByTestId(/^theme-page\./, HIDDEN).map((page) => page.props.testID);
}

async function waitForHydrated() {
  await waitFor(() => expect(screen.getByTestId('appearance.hydrated')).toHaveTextContent('yes'));
}

describe('HouseGains appearance picker', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
    mockStorage['app.language.override'] = 'en-US';
    jest
      .mocked(AsyncStorage.getItem)
      .mockImplementation(async (key: string) => mockStorage[key] ?? null);
    jest.mocked(AsyncStorage.setItem).mockImplementation(async (key: string, value: string) => {
      mockStorage[key] = value;
    });
    fakeFirebase.remoteConfigValue = '';
    fakeFirebase.remoteConfigFetches = 0;
    fakeFirebase.remoteConfigFetchedValue = null;
  });

  test('renders the pages in order sticker, arcade, soft and saves nothing before Choose', async () => {
    const onContinue = jest.fn();
    await renderPicker(onContinue);

    await waitForHydrated();
    expect(pageIds()).toEqual(['theme-page.sticker', 'theme-page.arcade', 'theme-page.soft']);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
  });

  test('Choose on arcade saves the style and continues once', async () => {
    const onContinue = jest.fn();
    await renderPicker(onContinue);
    await waitForHydrated();

    await userEvent.setup().press(screen.getByTestId('theme-choose.arcade', HIDDEN));

    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'housegains.appearance.v1',
      JSON.stringify({ version: 1, themeId: 'arcade', composition: 'arcade' }),
    );
    expect(screen.getByTestId('appearance.selected')).toHaveTextContent('arcade');
  });

  test('a failed save shows the save error and the same button retries', async () => {
    const onContinue = jest.fn();
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('storage unavailable'));
    await renderPicker(onContinue);
    await waitForHydrated();

    const user = userEvent.setup();
    await user.press(screen.getByTestId('theme-choose.sticker'));

    await waitFor(() => expect(screen.getByTestId('theme-picker.save-error')).toBeTruthy());
    expect(within(screen.getByTestId('theme-choose.sticker')).getByText('Retry save')).toBeTruthy();
    expect(onContinue).not.toHaveBeenCalled();

    await user.press(screen.getByTestId('theme-choose.sticker'));

    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('appearance.selected')).toHaveTextContent('sticker');
  });

  test('a failed read shows the load error, and retry clears it', async () => {
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('storage unavailable'));
    await renderPicker();

    await waitFor(() => expect(screen.getByTestId('theme-picker.load-error')).toBeTruthy());

    await userEvent.setup().press(screen.getByTestId('theme-picker.retry-load'));

    await waitFor(() => expect(screen.queryByTestId('theme-picker.load-error')).toBeNull());
  });

  test('the language sheet switches the page titles and Done closes it', async () => {
    await renderPicker();
    await waitForHydrated();
    const user = userEvent.setup();

    await user.press(screen.getByTestId('theme-picker.language.sticker'));
    expect(screen.getByTestId('theme-picker.language-sheet')).toBeTruthy();

    await user.press(screen.getByTestId('housegains.onboarding.language.pt-BR'));

    const ptTitle = HOUSEGAINS_DICTIONARIES['pt-BR']['housegains.appearance.title'];
    await waitFor(() => expect(screen.getAllByText(ptTitle).length).toBeGreaterThan(0));

    await user.press(screen.getByTestId('theme-picker.language.done'));
    await waitFor(() => expect(screen.queryByTestId('theme-picker.language-sheet')).toBeNull());
  });

  test('a remote config that hides soft leaves two pages', async () => {
    const config = JSON.parse(JSON.stringify(BUNDLED_PICKER_CONFIG));
    config.styles.find((style: { id: string }) => style.id === 'soft').enabled = false;
    fakeFirebase.remoteConfigValue = JSON.stringify(config);
    await renderPicker();

    await waitFor(() => expect(pageIds()).toHaveLength(2));
    expect(pageIds()).toEqual(['theme-page.sticker', 'theme-page.arcade']);
    expect(screen.queryByTestId('theme-page.soft')).toBeNull();
  });

  test('an invalid remote config falls back to the three bundled pages', async () => {
    fakeFirebase.remoteConfigValue = '{ not json';
    await renderPicker();

    await waitForHydrated();
    expect(pageIds()).toEqual(['theme-page.sticker', 'theme-page.arcade', 'theme-page.soft']);
  });

  test('schedules one background remote config fetch when the provider mounts', async () => {
    await renderPicker();

    await waitFor(() => expect(fakeFirebase.remoteConfigFetches).toBe(1));
  });

  test('keeps a preview selected after a failed save and retries before continuing', async () => {
    const onContinue = jest.fn();
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('storage unavailable'));
    await renderPicker(onContinue);

    await waitForHydrated();
    const user = userEvent.setup();
    await user.press(screen.getByTestId('theme-choose.soft', HIDDEN));

    await waitFor(() => expect(screen.getByTestId('theme-picker.save-error', HIDDEN)).toBeTruthy());
    expect(screen.getByTestId('appearance.theme')).toHaveTextContent('soft');
    expect(screen.getByTestId('appearance.selected')).toHaveTextContent('none');
    expect(onContinue).not.toHaveBeenCalled();

    await user.press(screen.getByTestId('theme-choose.soft', HIDDEN));

    await waitFor(() =>
      expect(screen.getByTestId('appearance.selected')).toHaveTextContent('soft'),
    );
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  test('shows a retryable read error and hydrates the saved theme after retry', async () => {
    mockStorage['housegains.appearance.v1'] = JSON.stringify({ version: 1, themeId: 'arcade' });
    jest
      .mocked(AsyncStorage.getItem)
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockImplementation(async (key: string) => mockStorage[key] ?? null);

    await renderPicker();

    await waitFor(() =>
      expect(screen.getByTestId('appearance.load-error')).toHaveTextContent('error'),
    );
    expect(screen.getByTestId('appearance.hydrated')).toHaveTextContent('yes');
    expect(screen.getByTestId('appearance.selected')).toHaveTextContent('none');

    await userEvent.setup().press(screen.getByTestId('theme-picker.retry-load'));

    await waitFor(() =>
      expect(screen.getByTestId('appearance.selected')).toHaveTextContent('arcade'),
    );
    expect(screen.getByTestId('appearance.load-error')).toHaveTextContent('none');
  });

  test('serializes rapid theme changes and keeps the latest choice selected', async () => {
    const finishWrites: (() => void)[] = [];
    jest.mocked(AsyncStorage.setItem).mockImplementation(
      (key: string, value: string) =>
        new Promise<void>((resolve) => {
          finishWrites.push(() => {
            mockStorage[key] = value;
            resolve();
          });
        }),
    );

    await render(
      <ThemeProvider>
        <AppearanceActions />
      </ThemeProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('appearance.action-selected')).toHaveTextContent('none'),
    );

    const user = userEvent.setup();
    await user.press(screen.getByTestId('action.arcade'));
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));
    await user.press(screen.getByTestId('action.soft'));
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);

    await act(async () => finishWrites[0]());
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('appearance.action-selected')).toHaveTextContent('none');

    await act(async () => finishWrites[1]());
    await waitFor(() =>
      expect(screen.getByTestId('appearance.action-selected')).toHaveTextContent('soft'),
    );
    expect(JSON.parse(mockStorage['housegains.appearance.v1'])).toEqual({
      version: 1,
      themeId: 'soft',
      composition: 'soft',
    });
  });
});

function PreviewProbe() {
  const { previewTheme } = useAppearance();
  return (
    <Button title="Preview soft" onPress={() => previewTheme('soft')} testID="probe.preview-soft" />
  );
}

describe('HouseGains appearance picker regressions (PR #5 review)', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
    mockStorage['app.language.override'] = 'en-US';
    jest
      .mocked(AsyncStorage.getItem)
      .mockImplementation(async (key: string) => mockStorage[key] ?? null);
    jest.mocked(AsyncStorage.setItem).mockImplementation(async (key: string, value: string) => {
      mockStorage[key] = value;
    });
    fakeFirebase.remoteConfigValue = '';
    fakeFirebase.remoteConfigFetches = 0;
    fakeFirebase.remoteConfigFetchedValue = null;
  });

  test('mounting never previews a style; Next previews the next page', async () => {
    mockStorage['housegains.appearance.v1'] = JSON.stringify({ version: 1, themeId: 'soft' });
    await renderPicker();
    await waitForHydrated();
    expect(screen.getByTestId('appearance.theme')).toHaveTextContent('soft');

    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    await userEvent.setup().press(screen.getByTestId('theme-picker.next.sticker'));
    await waitFor(() => expect(screen.getByTestId('appearance.theme')).toHaveTextContent('arcade'));
    // Screen-reader focus moves to the new page's heading, which reads its position.
    await waitFor(() => expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus'));
    expect(screen.getByTestId('theme-picker.name.arcade').props.accessibilityLabel).toBe(
      '2 of 3: Arcade',
    );
  });

  test('Retry save stores the failed page style even if another style is previewed', async () => {
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('storage unavailable'));
    const onContinue = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <LocaleProvider>
          <ThemeProvider>
            <ThemePickerScreen onContinue={onContinue} />
            <AppearanceProbe />
            <PreviewProbe />
          </ThemeProvider>
        </LocaleProvider>
      </SafeAreaProvider>,
    );
    await waitForHydrated();
    const user = userEvent.setup();
    await user.press(screen.getByTestId('theme-choose.sticker'));
    await waitFor(() => expect(screen.getByTestId('theme-picker.save-error')).toBeTruthy());

    await user.press(screen.getByTestId('probe.preview-soft'));
    await user.press(screen.getByTestId('theme-choose.sticker'));

    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
    expect(JSON.parse(mockStorage['housegains.appearance.v1'])).toEqual({
      version: 1,
      themeId: 'sticker',
      composition: 'sticker',
    });
  });

  test('each sample preview test id is unique', async () => {
    await renderPicker();
    await waitForHydrated();
    expect(screen.getAllByTestId('housegains.theme-preview.sticker', HIDDEN)).toHaveLength(1);
  });

  test('each page sizes its phone from its own free space', async () => {
    await renderPicker();
    await waitForHydrated();
    const layout = (id: string, height: number) =>
      fireEvent(screen.getByTestId(`theme-picker.sample.${id}`, HIDDEN), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 350, height } },
      });
    await layout('sticker', 400);
    await layout('soft', 480);

    const phoneHeight = (name: string) =>
      StyleSheet.flatten(
        screen.getByLabelText(`Sample household preview: ${name}`, HIDDEN).props.style,
      ).height;
    expect(phoneHeight('Sticker Pop')).toBe(400);
    expect(phoneHeight('Soft Home')).toBe(480);
  });

  test('a newly fetched config applies on the next launch, not the current one (R8)', async () => {
    const softHidden = structuredClone(BUNDLED_PICKER_CONFIG);
    softHidden.styles = softHidden.styles.map((style) =>
      style.id === 'soft' ? { ...style, enabled: false } : style,
    );
    fakeFirebase.remoteConfigFetchedValue = JSON.stringify(softHidden);

    await renderPicker();
    await waitForHydrated();
    await waitFor(() => expect(fakeFirebase.remoteConfigFetches).toBe(1));

    expect(pageIds()).toEqual(['theme-page.sticker', 'theme-page.arcade', 'theme-page.soft']);
    expect(fakeFirebase.remoteConfigValue).toBe(JSON.stringify(softHidden));
  });

  // Keep this test last: the two overlapping presses open overlapping act() scopes,
  // which can leave React's act queue unusable for a following render.
  test('a second tap on Choose while saving does not start a second save', async () => {
    const pending: (() => void)[] = [];
    jest.mocked(AsyncStorage.setItem).mockImplementation(
      (key: string, value: string) =>
        new Promise<void>((resolve) => {
          pending.push(() => {
            mockStorage[key] = value;
            resolve();
          });
        }),
    );
    const onContinue = jest.fn();
    await renderPicker(onContinue);
    await waitForHydrated();

    // Start both presses before either settles: both handlers run before React re-renders,
    // like two fast touches on a device.
    const button = screen.getByTestId('theme-choose.sticker');
    const first = fireEvent.press(button);
    const second = fireEvent.press(button);
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));
    // Release every write that gets queued, so a second save (the bug) cannot hang the suite.
    for (let round = 0; round < 3; round += 1) {
      await act(async () => {
        while (pending.length) pending.shift()?.();
      });
    }
    await Promise.all([first, second]);

    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  });
});
