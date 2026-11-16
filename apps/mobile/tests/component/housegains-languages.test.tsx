import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/features/appearance';
import { BuilderScreen } from '@/features/housegains-screens/chore-management-screens';
import { CATALOG, type Chore } from '@/features/household';
import ThemePickerScreen from '@/features/onboarding/theme-picker-screen';
import { HOUSEGAINS_DICTIONARIES } from '@/localization/housegains/catalog';
import { LocaleProvider, useLocale } from '@/localization/locale-context';
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
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
};
const app = () => (
  <SafeAreaProvider initialMetrics={metrics}>
    <LocaleProvider>
      <ThemeProvider>
        <ThemePickerScreen onContinue={jest.fn()} />
      </ThemeProvider>
    </LocaleProvider>
  </SafeAreaProvider>
);
beforeEach(() => {
  for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  mockStorage['app.language.override'] = 'en-US';
});
test.each(['pt-BR', 'es-ES', 'fr-FR', 'de-DE', 'it-IT'] as const)(
  'can select %s before onboarding and retain it after remount',
  async (locale) => {
    const view = await render(app());
    await fireEvent.press(view.getByTestId('theme-picker.next.sticker'));
    await fireEvent.press(view.getByTestId('theme-picker.language.arcade'));
    const button = await view.findByTestId(`housegains.onboarding.language.${locale}`);
    await fireEvent.press(button);
    await waitFor(() =>
      expect(
        view.getByText(HOUSEGAINS_DICTIONARIES[locale]['housegains.appearance.title']),
      ).toBeTruthy(),
    );
    expect(mockStorage['app.language.override']).toBe(locale);
    expect(view.getByTestId('theme-page.arcade').props.accessibilityElementsHidden).toBe(false);
    await view.unmount();
    const resumed = await render(app());
    await waitFor(() =>
      expect(
        resumed.getByText(HOUSEGAINS_DICTIONARIES[locale]['housegains.appearance.title']),
      ).toBeTruthy(),
    );
  },
);
test('a failed language write keeps the saved locale and exposes a working retry', async () => {
  const view = await render(app());
  await fireEvent.press(view.getByTestId('theme-picker.language.sticker'));
  const button = await view.findByTestId('housegains.onboarding.language.fr-FR');
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('storage unavailable'));
  await fireEvent.press(button);
  const retry = await view.findByTestId('housegains.onboarding.language.retry');
  expect(mockStorage['app.language.override']).toBe('en-US');
  await fireEvent.press(retry);
  await waitFor(() => expect(mockStorage['app.language.override']).toBe('fr-FR'));
});

jest.mock('@expo/vector-icons', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => React.createElement(Text, null, name);
  return { Ionicons: Icon, MaterialIcons: Icon };
});
const template = CATALOG.find((chore) => chore.id === 'catalog-kitchen-blitz')!;
function ReadyBuilder({ onSave }: { onSave: (chore: Chore) => Promise<void> }) {
  const { diagnostic } = useLocale();
  if (diagnostic.hydration === 'pending') return null;
  return (
    <BuilderScreen
      initialChore={null}
      template={template}
      members={[]}
      onSave={onSave}
      onCancel={jest.fn()}
      hasError={false}
    />
  );
}
test.each([false, true])(
  'catalog customization localizes defaults and preserves edited content (%s)',
  async (edited) => {
    mockStorage['app.language.override'] = 'fr-FR';
    const save = jest.fn(async (_chore: Chore) => undefined);
    const view = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <LocaleProvider>
          <ThemeProvider>
            <ReadyBuilder onSave={save} />
          </ThemeProvider>
        </LocaleProvider>
      </SafeAreaProvider>,
    );
    const name = await view.findByTestId('housegains.builder.name');
    expect(name.props.value).toBe(
      HOUSEGAINS_DICTIONARIES['fr-FR'][`housegains.catalog.${template.id}.name`],
    );
    expect(view.getByTestId('housegains.builder.subtask.0.name').props.value).toBe(
      HOUSEGAINS_DICTIONARIES['fr-FR'][`housegains.catalog.subtask.${template.subtasks[0].id}`],
    );
    if (edited) {
      await fireEvent.changeText(name, 'Ma cuisine');
      await fireEvent.changeText(
        view.getByTestId('housegains.builder.subtask.0.name'),
        'Mes assiettes',
      );
    }
    await fireEvent.press(view.getByTestId('housegains.builder.save'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].name).toBe(edited ? 'Ma cuisine' : template.name);
    expect(save.mock.calls[0][0].subtasks[0].name).toBe(
      edited ? 'Mes assiettes' : template.subtasks[0].name,
    );
  },
);
