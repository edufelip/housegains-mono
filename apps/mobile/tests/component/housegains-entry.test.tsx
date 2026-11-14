import { render, screen } from '@testing-library/react-native';
import HouseGainsEntry from '@/app/index';
let mockLocaleReady = true;
jest.mock('@/localization/locale-context', () => ({
  useLocale: () => ({ diagnostic: { hydration: mockLocaleReady ? 'hydrated' : 'pending' } }),
}));
jest.mock('expo-router', () => ({ useGlobalSearchParams: () => ({}) }));
let mockSelected: string | null = null;
let mockHydrated = true;
jest.mock(
  '@/features/appearance',
  () => ({
    useAppearance: () => ({
      hydrated: mockHydrated,
      selected: mockSelected,
      tokens: { canvas: '#fff', primary: '#00f' },
    }),
  }),
  { virtual: true },
);
jest.mock('@/features/household', () => ({ useHousehold: () => ({ hydrated: true }) }), {
  virtual: true,
});
let mockAuthStatus: 'loading' | 'signedOut' | 'signedIn' = 'signedIn';
jest.mock('@/features/auth', () => ({
  useAuth: () => ({ status: mockAuthStatus }),
  SignInScreen: () => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, 'sign-in');
  },
}));
jest.mock(
  '@/features/onboarding/theme-picker-screen',
  () => ({
    __esModule: true,
    default: () => {
      const React = require('react');
      const { Text } = require('react-native');
      return React.createElement(Text, null, 'appearance-picker');
    },
  }),
  { virtual: true },
);
jest.mock(
  '@/features/housegains-screens',
  () => ({
    HouseGainsApp: () => {
      const React = require('react');
      const { Text } = require('react-native');
      return React.createElement(Text, null, 'household-app');
    },
  }),
  { virtual: true },
);
beforeEach(() => {
  mockLocaleReady = true;
  mockSelected = null;
  mockHydrated = true;
  mockAuthStatus = 'signedIn';
});

test('shows sign-in once a theme is chosen and no user is signed in', async () => {
  mockSelected = 'soft';
  mockAuthStatus = 'signedOut';
  await render(<HouseGainsEntry />);
  expect(screen.getByText('sign-in')).toBeTruthy();
  expect(screen.queryByText('household-app')).toBeNull();
});

test('waits for the auth state before choosing sign-in or the app', async () => {
  mockSelected = 'soft';
  mockAuthStatus = 'loading';
  await render(<HouseGainsEntry />);
  expect(screen.queryByText('sign-in')).toBeNull();
  expect(screen.queryByText('household-app')).toBeNull();
});
test('requires a saved appearance before entering the household flow', async () => {
  await render(<HouseGainsEntry />);
  expect(screen.getByText('appearance-picker')).toBeTruthy();
  expect(screen.queryByText('household-app')).toBeNull();
});
test('resumes the household flow for an existing selection', async () => {
  mockSelected = 'soft';
  await render(<HouseGainsEntry />);
  expect(screen.getByText('household-app')).toBeTruthy();
  expect(screen.queryByText('appearance-picker')).toBeNull();
});
test('waits for hydration before deciding where to resume', async () => {
  mockHydrated = false;
  await render(<HouseGainsEntry />);
  expect(screen.queryByText('appearance-picker')).toBeNull();
  expect(screen.queryByText('household-app')).toBeNull();
});

test('waits for the saved language before showing onboarding', async () => {
  mockLocaleReady = false;
  await render(<HouseGainsEntry />);
  expect(screen.queryByText('appearance-picker')).toBeNull();
  expect(screen.queryByText('household-app')).toBeNull();
});
