import { act, fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/features/appearance';
import { CatalogScreen } from '@/features/housegains-screens/catalog-screen';
import { CATALOG } from '@/features/household';

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

describe('HouseGains catalog screen', () => {
  test('does not save the same catalog chore again before its snapshot arrives', async () => {
    const selectedChores: typeof CATALOG = [];
    const onToggle = jest.fn().mockResolvedValue(undefined);
    const chore = CATALOG[0];

    const view = await render(
      <ThemeProvider>
        <CatalogScreen
          selectedChores={[...selectedChores]}
          onToggle={onToggle}
          onOpenChore={jest.fn()}
          onBuildCustom={jest.fn()}
          onBack={jest.fn()}
          onNext={jest.fn()}
          hasError={false}
        />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(view.getByTestId(`housegains.catalog.toggle.${chore.id}`));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(view.getByTestId(`housegains.catalog.toggle.${chore.id}`));
      await Promise.resolve();
    });

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test('unlocks a saved chore after 5 seconds when its snapshot never matches', async () => {
    jest.useFakeTimers();
    const onToggle = jest.fn().mockResolvedValue(undefined);
    const chore = CATALOG[0];
    const view = await render(
      <ThemeProvider>
        <CatalogScreen
          selectedChores={[]}
          onToggle={onToggle}
          onOpenChore={jest.fn()}
          onBuildCustom={jest.fn()}
          onBack={jest.fn()}
          onNext={jest.fn()}
          hasError={false}
        />
      </ThemeProvider>,
    );
    const press = async () =>
      act(async () => {
        fireEvent.press(view.getByTestId(`housegains.catalog.toggle.${chore.id}`));
        await Promise.resolve();
      });

    await press();
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    await press();

    expect(onToggle).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});
