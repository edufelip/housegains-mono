import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/features/appearance';
import { HouseGainsSettingsScreen } from '@/features/housegains-screens/main-tab-screens';
import { LocaleProvider } from '@/localization/locale-context';
import type { Household, Member } from '@/features/household';

const mockStorage: Record<string, string> = {};

jest.mock('@expo/vector-icons', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name: string }) => React.createElement(Text, null, name);
  return { Ionicons: Icon, MaterialIcons: Icon };
});

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
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const creator: Member = {
  id: 'me-uid',
  name: 'Ana',
  initials: 'AN',
  color: '#FFD33D',
  role: 'creator',
};
const member: Member = {
  id: 'ben-uid',
  name: 'Ben',
  initials: 'BE',
  color: '#4568FF',
  role: 'member',
};
const admin: Member = {
  id: 'rafa-uid',
  name: 'Rafa',
  initials: 'RA',
  color: '#25DDA3',
  role: 'admin',
};

const members = [creator, member, admin];

function makeHousehold(): Household {
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

type SettingsProps = {
  currentMember?: Member;
  openDisputeCount?: number;
  onOpenReports?: () => void;
  onSetMemberRole?: (memberId: string, role: 'admin' | 'member') => Promise<void>;
};

async function renderSettings({
  currentMember = creator,
  openDisputeCount = 0,
  onOpenReports = jest.fn(),
  onSetMemberRole = jest.fn(async () => undefined),
}: SettingsProps = {}) {
  const props: Parameters<typeof HouseGainsSettingsScreen>[0] = {
    currentMember,
    household: makeHousehold(),
    openDisputeCount,
    hasError: false,
    onError: jest.fn(),
    onNavigate: jest.fn(),
    onOpenChores: jest.fn(),
    onOpenReports,
    onEditHousehold: jest.fn(),
    onOpenInvite: jest.fn(),
    onSelectTheme: jest.fn(async () => undefined),
    onDeleteAccount: jest.fn(),
    onSetMemberRole,
    onLeftHousehold: jest.fn(),
  };
  const view = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <LocaleProvider>
        <ThemeProvider>
          <HouseGainsSettingsScreen {...props} />
        </ThemeProvider>
      </LocaleProvider>
    </SafeAreaProvider>,
  );
  await waitFor(() => expect(view.getByTestId('housegains.tab.me')).toBeTruthy());
  return view;
}

beforeEach(() => {
  for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  mockStorage['app.language.override'] = 'en-US';
});

describe('HouseGains member role toggle (Settings people section)', () => {
  test('labels roles and lets the creator grant and remove the admin role', async () => {
    const onSetMemberRole = jest.fn(async () => undefined);
    const view = await renderSettings({ onSetMemberRole });

    // Rafa is an admin; the role label is visible next to the name.
    expect(view.getByTestId('housegains.members.rafa-uid')).toHaveTextContent(/Household admin/i);

    await act(async () => {
      fireEvent.press(view.getByTestId('housegains.members.setRole.rafa-uid'));
    });
    expect(view.getByTestId('housegains.members.roleSheet')).toHaveTextContent(
      /Remove Rafa as admin\?/i,
    );
    expect(view.getByTestId('housegains.members.roleSheet')).toHaveTextContent(
      /keeps their points and history/i,
    );
    await act(async () => {
      fireEvent.press(view.getByTestId('housegains.members.roleSheet.confirm'));
    });
    expect(onSetMemberRole).toHaveBeenCalledWith('rafa-uid', 'member');

    // Ben is a plain member; the creator can make him an admin.
    await act(async () => {
      fireEvent.press(view.getByTestId('housegains.members.setRole.ben-uid'));
    });
    expect(view.getByTestId('housegains.members.roleSheet')).toHaveTextContent(
      /Make Ben an admin\?/i,
    );
    expect(view.getByTestId('housegains.members.roleSheet')).toHaveTextContent(
      /Admins review reported completions/i,
    );
    await act(async () => {
      fireEvent.press(view.getByTestId('housegains.members.roleSheet.confirm'));
    });
    expect(onSetMemberRole).toHaveBeenCalledWith('ben-uid', 'admin');
  });

  test('shows the failure inside the sheet and keeps it open when the role change fails', async () => {
    const onSetMemberRole = jest.fn(async () => {
      throw new Error('Only the household creator can do that.');
    });
    const view = await renderSettings({ onSetMemberRole });

    await act(async () => {
      fireEvent.press(view.getByTestId('housegains.members.setRole.ben-uid'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('housegains.members.roleSheet.confirm'));
    });
    await waitFor(() =>
      expect(view.getByTestId('housegains.members.roleSheet.error')).toHaveTextContent(/creator/i),
    );
    expect(view.getByTestId('housegains.members.roleSheet.confirm')).toBeTruthy();
  });

  test('shows the reports entry with a pending count for admins only', async () => {
    const onOpenReports = jest.fn();
    const view = await renderSettings({ currentMember: admin, openDisputeCount: 2, onOpenReports });

    expect(view.getByTestId('housegains.settings.reports.count')).toHaveTextContent(/2 to review/i);
    fireEvent.press(view.getByTestId('housegains.settings.reports'));
    expect(onOpenReports).toHaveBeenCalledTimes(1);

    // A plain member neither sees the entry nor the badge.
    const memberView = await renderSettings({ currentMember: member, openDisputeCount: 2 });
    expect(memberView.queryByTestId('housegains.settings.reports')).toBeNull();
    expect(memberView.queryByTestId('housegains.settings.reports.count')).toBeNull();
  });
});
