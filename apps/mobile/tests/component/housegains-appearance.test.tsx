import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Button } from '@/components/housegains/ui';
import { ThemeProvider, useAppearance } from '@/features/appearance';
import ThemePickerScreen from '@/features/onboarding/theme-picker-screen';

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

describe('HouseGains appearance picker', () => {
  beforeEach(() => {
    delete mockStorage['housegains.appearance.v1'];
    jest
      .mocked(AsyncStorage.getItem)
      .mockImplementation(async (key: string) => mockStorage[key] ?? null);
    jest.mocked(AsyncStorage.setItem).mockImplementation(async (key: string, value: string) => {
      mockStorage[key] = value;
    });
  });

  test('keeps all themes unselected until a preview is chosen and Continue commits it', async () => {
    const onContinue = jest.fn();
    await render(
      <ThemeProvider>
        <ThemePickerScreen onContinue={onContinue} />
        <AppearanceProbe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('appearance.hydrated')).toHaveTextContent('yes'));
    expect(screen.getByTestId('housegains.theme-preview.arcade')).toBeTruthy();
    expect(screen.getByTestId('housegains.theme-preview.sticker')).toBeTruthy();
    expect(screen.getByTestId('housegains.theme-preview.soft')).toBeTruthy();
    expect(screen.getByTestId('theme-option.arcade').props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId('theme-option.sticker').props.accessibilityState.selected).toBe(
      false,
    );
    expect(screen.getByTestId('theme-option.soft').props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId('appearance.selected')).toHaveTextContent('none');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();

    await userEvent.setup().press(screen.getByTestId('theme-option.sticker'));

    expect(screen.getByTestId('appearance.theme')).toHaveTextContent('sticker');
    expect(screen.getByTestId('appearance.selected')).toHaveTextContent('none');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();

    await userEvent.setup().press(screen.getByTestId('theme-picker.continue'));

    await waitFor(() =>
      expect(screen.getByTestId('appearance.selected')).toHaveTextContent('sticker'),
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'housegains.appearance.v1',
      JSON.stringify({ version: 1, themeId: 'sticker' }),
    );
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  test('keeps a preview selected after a failed save and retries before continuing', async () => {
    const onContinue = jest.fn();
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('storage unavailable'));
    await render(
      <ThemeProvider>
        <ThemePickerScreen onContinue={onContinue} />
        <AppearanceProbe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('appearance.hydrated')).toHaveTextContent('yes'));
    await userEvent.setup().press(screen.getByTestId('theme-option.soft'));
    await userEvent.setup().press(screen.getByTestId('theme-picker.continue'));

    await waitFor(() => expect(screen.getByTestId('theme-picker.save-error')).toBeTruthy());
    expect(screen.getByTestId('appearance.theme')).toHaveTextContent('soft');
    expect(screen.getByTestId('appearance.selected')).toHaveTextContent('none');
    expect(onContinue).not.toHaveBeenCalled();

    await userEvent.setup().press(screen.getByTestId('theme-picker.retry-save'));

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

    await render(
      <ThemeProvider>
        <ThemePickerScreen onContinue={jest.fn()} />
        <AppearanceProbe />
      </ThemeProvider>,
    );

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
    });
  });
});
