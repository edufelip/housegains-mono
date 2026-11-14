import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SoftDashboard } from '@/components/housegains/variants/soft-dashboard';
import type { DashboardProps } from '@/features/housegains-screens/screen-types';
jest.mock('@/features/appearance', () => {
  const { getThemeTokens } = jest.requireActual('@/features/appearance/tokens');
  return {
    getThemeTokens,
    useAppearance: () => ({ themeId: 'soft', tokens: getThemeTokens('soft') }),
  };
});
jest.mock('@/localization/housegains', () => {
  const { translateHouseGains } = jest.requireActual('@/localization/housegains/catalog');
  return {
    useHouseGainsTranslation: () => ({
      locale: 'en-US',
      t: (key: string, params?: Record<string, string | number>) =>
        translateHouseGains('en-US', key, params),
    }),
  };
});
jest.mock('@expo/vector-icons', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return { Ionicons: ({ name }: { name: string }) => React.createElement(Text, null, name) };
});
const member = {
  id: 'me',
  name: 'Edu',
  initials: 'ED',
  color: '#FFD33D',
  role: 'creator' as const,
};
const props: DashboardProps = {
  themeId: 'soft',
  household: {
    id: 'home',
    name: 'House',
    icon: '🏠',
    color: '#FFD33D',
    timeZone: 'UTC',
    members: [member],
    invite: { code: 'HG7K2P', expiresAt: '2027-01-01', uses: 0, maxUses: 8, revoked: false },
  },
  members: [member],
  currentMember: member,
  chores: [],
  instances: [],
  weeklyTotals: { me: 320 },
  weeklyGoalXp: 400,
  totalXp: 320,
  streak: 0,
  onOpenInstance: jest.fn(),
  onNavigate: jest.fn(),
};
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
test('Soft Home renders weekly XP goal even with zero daily sets', async () => {
  const view = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <SoftDashboard {...props} />
    </SafeAreaProvider>,
  );
  expect(view.getByText('of 400 pts')).toBeTruthy();
  expect(view.getByText('80% there')).toBeTruthy();
});
test('missing weekly target displays unavailable progress instead of a percentage', async () => {
  const view = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <SoftDashboard {...props} weeklyGoalXp={null} />
    </SafeAreaProvider>,
  );
  expect(view.getAllByText('Weekly goal not set').length).toBeGreaterThan(0);
  expect(view.queryByText('80% there')).toBeNull();
});
