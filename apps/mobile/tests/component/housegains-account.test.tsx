import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { signOut } from '@/features/account/account-api';
import { ThemeProvider } from '@/features/appearance';
import { DeleteAccountScreen } from '@/features/housegains-screens/account-screens';
import { HouseGainsSettingsScreen } from '@/features/housegains-screens/main-tab-screens';
import { disableReminders, enableReminders } from '@/features/notifications/reminders';
import { translateHouseGains } from '@/localization/housegains/catalog';
import { LocaleProvider } from '@/localization/locale-context';
import type { Household, Member } from '@/features/household';

jest.mock('@expo/vector-icons', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => React.createElement(Text, null, name);
  return { Ionicons: Icon, MaterialIcons: Icon };
});

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

type FirebaseFake = {
  currentUser: null | { uid: string; email: string | null; displayName: string | null };
  docs: Record<string, Record<string, unknown>>;
  updates: { path: string; data: Record<string, unknown> }[];
  reads: string[];
  calls: { name: string; data: unknown }[];
  failures: Record<string, { code: string; message?: string }>;
  signOuts: number;
  permission: number;
  deletedTokens: number;
  hangUpdates: boolean;
};
const fake = (globalThis as unknown as { mockFirebase: FirebaseFake }).mockFirebase;

const en = (key: string, params?: Record<string, string | number>) =>
  translateHouseGains('en-US', key, params);

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
};

const ANA: Member = {
  id: 'me-uid',
  name: 'Ana',
  initials: 'AN',
  color: '#FFD33D',
  role: 'creator',
};
const BEN: Member = {
  id: 'other-uid',
  name: 'Ben',
  initials: 'BE',
  color: '#4568FF',
  role: 'member',
};

function makeHousehold(members: Member[]): Household {
  return {
    id: 'hh-1',
    name: 'Apto 302',
    icon: '🏠',
    color: '#FFD33D',
    members,
    invite: {
      code: 'ABC234',
      expiresAt: '2030-01-01T00:00:00.000Z',
      uses: 0,
      maxUses: 8,
      revoked: false,
    },
  };
}

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <LocaleProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}

async function renderSettings({
  members = [ANA, BEN],
  currentMember = ANA,
}: {
  members?: Member[];
  currentMember?: Member;
} = {}) {
  const view = await render(
    <Providers>
      <HouseGainsSettingsScreen
        currentMember={currentMember}
        hasError={false}
        household={makeHousehold(members)}
        onDeleteAccount={jest.fn()}
        onEditHousehold={jest.fn()}
        onError={jest.fn()}
        onLeftHousehold={jest.fn()}
        onNavigate={jest.fn()}
        onOpenChores={jest.fn()}
        onOpenInvite={jest.fn()}
        onOpenReports={jest.fn()}
        onSelectTheme={jest.fn(async () => undefined)}
        onSetMemberRole={jest.fn(async () => undefined)}
        openDisputeCount={0}
      />
    </Providers>,
  );
  await waitFor(() => expect(view.getByTestId('housegains.tab.me')).toBeTruthy());
  return view;
}

/** The buttons of the most recent Alert.alert call, for pressing a confirmation button. */
function lastAlert(spy: jest.SpyInstance) {
  const [title, message, buttons] = spy.mock.calls.at(-1) as [
    string,
    string,
    { text: string; style?: string; onPress?(): void }[],
  ];
  return { title, message, buttons };
}

beforeEach(() => {
  for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  mockStorage['app.language.override'] = 'en-US';
  fake.currentUser = { uid: 'me-uid', email: 'ana@example.com', displayName: 'Ana' };
  fake.docs = { 'users/me-uid': { fcmTokens: [], remindersEnabled: true } };
  fake.updates = [];
  fake.reads = [];
  fake.calls = [];
  fake.failures = {};
  fake.signOuts = 0;
  fake.permission = 1;
  fake.deletedTokens = 0;
  fake.hangUpdates = false;
});

describe('account deletion', () => {
  it('confirm calls deleteAccount and then signs out', async () => {
    const onCancel = jest.fn();
    const view = await render(
      <Providers>
        <DeleteAccountScreen onCancel={onCancel} />
      </Providers>,
    );
    await fireEvent.press(view.getByTestId('housegains.deleteAccount.confirm'));
    await waitFor(() => expect(fake.signOuts).toBe(1));
    expect(fake.calls.map(({ name }) => name)).toEqual(['deleteAccount']);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('a failed deletion shows the mapped message and keeps the account', async () => {
    fake.failures.deleteAccount = { code: 'functions/unavailable' };
    const view = await render(
      <Providers>
        <DeleteAccountScreen onCancel={jest.fn()} />
      </Providers>,
    );
    await fireEvent.press(view.getByTestId('housegains.deleteAccount.confirm'));
    expect(await view.findByText(en('housegains.account.error.network'))).toBeTruthy();
    expect(fake.signOuts).toBe(0);
    expect(
      view.getByTestId('housegains.deleteAccount.confirm').props.accessibilityState.disabled,
    ).toBe(false);
  });

  it('keep my account returns without calling the backend', async () => {
    const onCancel = jest.fn();
    const view = await render(
      <Providers>
        <DeleteAccountScreen onCancel={onCancel} />
      </Providers>,
    );
    await fireEvent.press(view.getByTestId('housegains.deleteAccount.cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(fake.calls).toEqual([]);
  });
});

describe('household roles', () => {
  it('the creator sees Remove on other members; a member does not', async () => {
    const asCreator = await renderSettings({ currentMember: ANA });
    expect(asCreator.queryByTestId('housegains.members.remove.other-uid')).toBeTruthy();
    expect(asCreator.queryByTestId('housegains.members.remove.me-uid')).toBeNull();
    await asCreator.unmount();

    const asMember = await renderSettings({ currentMember: BEN });
    expect(asMember.queryByTestId('housegains.members.remove.me-uid')).toBeNull();
    expect(asMember.queryByTestId('housegains.members.remove.other-uid')).toBeNull();
    expect(asMember.queryByTestId('housegains.members.report.me-uid')).toBeTruthy();
    expect(asMember.queryByTestId('housegains.members.report.other-uid')).toBeNull();
  });

  it('remove asks first and then calls removeMember with the member uid', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const view = await renderSettings({ currentMember: ANA });
    await fireEvent.press(view.getByTestId('housegains.members.remove.other-uid'));
    const { title, buttons } = lastAlert(alert);
    expect(title).toBe(en('housegains.account.members.removeTitle', { name: 'Ben' }));
    expect(fake.calls).toEqual([]);
    await act(async () => {
      buttons.find(({ style }) => style === 'destructive')?.onPress?.();
    });
    await waitFor(() =>
      expect(fake.calls).toEqual([
        { name: 'removeMember', data: { householdId: 'hh-1', uid: 'other-uid' } },
      ]),
    );
  });

  it('leave copy differs for the creator, the last member and a plain member', async () => {
    const alert = jest.spyOn(Alert, 'alert');

    const creatorWithOthers = await renderSettings({ members: [ANA, BEN], currentMember: ANA });
    await fireEvent.press(creatorWithOthers.getByTestId('housegains.household.leave'));
    expect(lastAlert(alert).message).toContain(en('housegains.account.leave.bodyCreator'));
    await creatorWithOthers.unmount();

    const lastMember = await renderSettings({ members: [ANA], currentMember: ANA });
    await fireEvent.press(lastMember.getByTestId('housegains.household.leave'));
    const lastCopy = lastAlert(alert).message;
    expect(lastCopy).toBe(en('housegains.account.leave.bodyLast'));
    expect(lastCopy).not.toContain(en('housegains.account.leave.bodyCreator'));
    await lastMember.unmount();

    const plainMember = await renderSettings({ members: [ANA, BEN], currentMember: BEN });
    await fireEvent.press(plainMember.getByTestId('housegains.household.leave'));
    const plainCopy = lastAlert(alert).message;
    expect(plainCopy).toBe(en('housegains.account.leave.body'));
  });
});

describe('report sheet', () => {
  it('sends the chosen reason and note for a member', async () => {
    const view = await renderSettings({ currentMember: ANA });
    await fireEvent.press(view.getByTestId('housegains.members.report.other-uid'));
    await fireEvent.press(view.getByTestId('housegains.report.reason.harassment'));
    await fireEvent.changeText(view.getByTestId('housegains.report.note'), 'Rude nickname');
    await fireEvent.press(view.getByTestId('housegains.report.submit'));
    await waitFor(() =>
      expect(fake.calls).toEqual([
        {
          name: 'reportContent',
          data: {
            householdId: 'hh-1',
            kind: 'member',
            targetId: 'other-uid',
            reason: 'harassment: Rude nickname',
          },
        },
      ]),
    );
    expect(await view.findByText(en('housegains.account.report.sent'))).toBeTruthy();
  });

  it('a household report needs a reason before it is sent', async () => {
    const view = await renderSettings();
    await fireEvent.press(view.getByTestId('housegains.household.report'));
    await fireEvent.press(view.getByTestId('housegains.report.submit'));
    expect(await view.findByText(en('housegains.account.report.reasonRequired'))).toBeTruthy();
    expect(fake.calls).toEqual([]);
  });
});

describe('settings', () => {
  it.each(['arcade', 'sticker', 'soft'] as const)('renders in the %s theme', async (themeId) => {
    mockStorage['housegains.appearance.v1'] = JSON.stringify({ version: 1, themeId });
    const view = await renderSettings();
    await waitFor(() =>
      expect(
        view.getByTestId(`housegains.settings.theme.${themeId}`).props.accessibilityState.selected,
      ).toBe(true),
    );
    expect(view.getByText('ana@example.com')).toBeTruthy();
    expect(view.getByTestId('housegains.settings.deleteAccount')).toBeTruthy();
    expect(view.getByTestId('housegains.settings.about')).toBeTruthy();
  });

  it('turning reminders on stores the device token and the preference', async () => {
    fake.docs['users/me-uid'] = { fcmTokens: ['old-token'], remindersEnabled: false };
    const view = await renderSettings();
    await fireEvent(view.getByTestId('housegains.settings.reminders'), 'valueChange', true);
    await waitFor(() =>
      expect(fake.updates).toEqual([
        {
          path: 'users/me-uid',
          data: {
            fcmTokens: { op: 'arrayUnion', value: 'device-token' },
            remindersEnabled: true,
          },
        },
      ]),
    );
  });

  it('trims an over-limit token list while keeping at most ten devices', async () => {
    fake.docs['users/me-uid'] = {
      fcmTokens: Array.from({ length: 10 }, (_, index) => `token-${index}`),
      remindersEnabled: false,
    };
    await enableReminders();
    const update = fake.updates[0]?.data as { fcmTokens: string[] };
    expect(update.fcmTokens).toHaveLength(10);
    expect(update.fcmTokens).not.toContain('token-0');
    expect(update.fcmTokens.at(-1)).toBe('device-token');
  });

  it('disables reminders without reading or rewriting the token list', async () => {
    await disableReminders();
    expect(fake.reads).toEqual([]);
    expect(fake.updates).toEqual([{ path: 'users/me-uid', data: { remindersEnabled: false } }]);
  });

  it('starts token removal in the background and deletes the messaging token before sign-out', async () => {
    fake.hangUpdates = true;
    await signOut();
    expect(fake.deletedTokens).toBe(1);
    expect(fake.signOuts).toBe(1);
  });

  it('privacy opens the localized HouseGains page', async () => {
    mockStorage['app.language.override'] = 'pt-BR';
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const view = await renderSettings();
    await fireEvent.press(view.getByTestId('housegains.settings.about.privacy'));
    expect(open).toHaveBeenCalledWith('https://housegains.app/pt-BR/privacy');
  });
});
