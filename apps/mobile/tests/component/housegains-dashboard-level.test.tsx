import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ArcadeDashboard } from '@/components/housegains/variants/arcade-dashboard';
import type { DashboardProps } from '@/features/housegains-screens/screen-types';
import type { Member } from '@/features/household';

jest.mock('@/features/appearance', () => {
  const { getThemeTokens } = jest.requireActual('@/features/appearance/tokens');
  return {
    getThemeTokens,
    useAppearance: () => ({ themeId: 'arcade', tokens: getThemeTokens('arcade') }),
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
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return { ...actual, SafeAreaView: jest.requireActual('react-native').View };
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function dashboardFor(member: Member, totalXp: number): DashboardProps {
  return {
    themeId: 'arcade',
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
    weeklyTotals: { me: 0 },
    weeklyGoalXp: 400,
    totalXp,
    streak: 0,
    onOpenInstance: jest.fn(),
    onNavigate: jest.fn(),
  };
}

const base: Member = { id: 'me', name: 'Edu', initials: 'ED', color: '#FFD33D', role: 'creator' };

async function levelLine(member: Member, totalXp: number) {
  const view = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ArcadeDashboard {...dashboardFor(member, totalXp)} />
    </SafeAreaProvider>,
  );
  return view;
}

describe('dashboard level line (new level curve, gamification on or off)', () => {
  test('1840 XP and no levelFloor keeps the old level 19 so nobody drops', async () => {
    const view = await levelLine({ ...base, xp: 1840 }, 1840);
    expect(view.getByText('Level 19 · House Guardian')).toBeTruthy();
  });

  test('1840 XP with levelFloor 1 shows level 6 on the new curve', async () => {
    const view = await levelLine({ ...base, xp: 1840, xpPeak: 1840, levelFloor: 1 }, 1840);
    expect(view.getByText('Level 6 · Tidy Titan')).toBeTruthy();
  });

  test('an undo that lowered XP keeps the level from xpPeak', async () => {
    const view = await levelLine({ ...base, xp: 1200, xpPeak: 1840, levelFloor: 1 }, 1200);
    expect(view.getByText('Level 6 · Tidy Titan')).toBeTruthy();
  });

  test('new members start at level 1 Rookie', async () => {
    const view = await levelLine({ ...base, xp: 0, xpPeak: 0, levelFloor: 1 }, 0);
    expect(view.getByText('Level 1 · Rookie')).toBeTruthy();
  });

  test('the new title bands are localized names', async () => {
    const view = await levelLine({ ...base, xp: 12000, xpPeak: 12000, levelFloor: 1 }, 12000);
    // 12000 XP = level 16 on the new curve
    expect(view.getByText('Level 16 · House Guardian')).toBeTruthy();
  });
});
