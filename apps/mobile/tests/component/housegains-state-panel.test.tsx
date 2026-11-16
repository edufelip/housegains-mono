import { render, screen, userEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { StatePanel, type StatePanelKind } from '@/components/housegains/ui';
import { ThemeProvider } from '@/features/appearance';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null, MaterialIcons: () => null }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

const KINDS: StatePanelKind[] = ['loading', 'empty', 'error', 'demo', 'unavailable'];

describe('StatePanel', () => {
  test.each(KINDS)('%s shows its title as text, not color alone', async (kind) => {
    await render(
      <ThemeProvider>
        <StatePanel kind={kind} title={`Title ${kind}`} description="Why this happened" />
      </ThemeProvider>,
    );
    expect(screen.getByText(`Title ${kind}`)).toBeTruthy();
    expect(screen.getByText('Why this happened')).toBeTruthy();
  });

  test('announces an error as an alert', async () => {
    await render(
      <ThemeProvider>
        <StatePanel kind="error" testID="panel" title="Could not load" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('panel').props.accessibilityRole).toBe('alert');
  });

  test('only the error kind is an alert, and only loading is a live region', async () => {
    await render(
      <ThemeProvider>
        <StatePanel kind="empty" testID="empty" title="Nothing here" />
        <StatePanel kind="loading" testID="loading" title="Loading" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('empty').props.accessibilityRole).toBeUndefined();
    expect(screen.getByTestId('loading').props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByTestId('empty').props.accessibilityLiveRegion).toBeUndefined();
  });

  test('the title is a heading for screen readers', async () => {
    await render(
      <ThemeProvider>
        <StatePanel kind="empty" title="Nothing here" />
      </ThemeProvider>,
    );
    expect(screen.getByRole('header', { name: 'Nothing here' })).toBeTruthy();
  });

  test('the action is primary for an error and secondary otherwise', async () => {
    await render(
      <ThemeProvider>
        <StatePanel
          kind="error"
          testID="e"
          title="Offline"
          actionTitle="Retry"
          onAction={() => undefined}
        />
        <StatePanel
          kind="empty"
          testID="m"
          title="Empty"
          actionTitle="Create"
          onAction={() => undefined}
        />
      </ThemeProvider>,
    );
    const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
    expect(flat('e.action').backgroundColor).not.toBe(flat('m.action').backgroundColor);
  });

  test('renders the action only when both a title and a handler are provided', async () => {
    const onAction = jest.fn();
    await render(
      <ThemeProvider>
        <StatePanel
          kind="error"
          testID="with"
          title="Offline"
          actionTitle="Retry"
          onAction={onAction}
        />
        <StatePanel kind="empty" testID="title-only" title="Nothing here" actionTitle="Create" />
        <StatePanel kind="empty" testID="handler-only" title="Nothing here" onAction={onAction} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('with.action')).toBeTruthy();
    expect(screen.queryByTestId('title-only.action')).toBeNull();
    expect(screen.queryByTestId('handler-only.action')).toBeNull();

    await userEvent.setup().press(screen.getByTestId('with.action'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
