import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/features/appearance';
import { AuthContext, type AuthValue } from '@/features/auth';
import { SignInScreen } from '@/features/auth/sign-in-screen';
import { translateHouseGains } from '@/localization/housegains/catalog';
import { LocaleProvider } from '@/localization/locale-context';

let mockThemeId = 'arcade';
let mockGoogleId = '';

jest.mock('@/features/auth/providers', () => ({
  googleWebClientId: () => mockGoogleId,
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) =>
      key === 'housegains.appearance.v1'
        ? JSON.stringify({ version: 1, themeId: mockThemeId })
        : key === 'app.language.override'
          ? 'en-US'
          : null,
    ),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

jest.mock('@expo/vector-icons', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MaterialIcons: (props: { name: string }) => React.createElement(Text, null, props.name),
  };
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const en = (key: string) => translateHouseGains('en-US', key);

function authWith(overrides: Partial<AuthValue> = {}): AuthValue {
  const noop = async () => undefined;
  return {
    status: 'signedOut',
    user: null,
    signInWithApple: noop,
    signInWithGoogle: noop,
    signInWithEmail: noop,
    createAccountWithEmail: noop,
    sendPasswordReset: noop,
    signOut: noop,
    ...overrides,
  };
}

async function renderSignIn(auth: AuthValue) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <LocaleProvider>
        <ThemeProvider>
          <AuthContext.Provider value={auth}>
            <SignInScreen />
          </AuthContext.Provider>
        </ThemeProvider>
      </LocaleProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockThemeId = 'arcade';
  mockGoogleId = '';
});

describe.each(['arcade', 'sticker', 'soft'])('sign-in screen in the %s theme', (themeId) => {
  test('shows the title, email and password fields and the submit button', async () => {
    mockThemeId = themeId;
    const view = await renderSignIn(authWith());

    await waitFor(() => expect(view.getByTestId('housegains.auth.title')).toBeTruthy());
    expect(view.getByText(en('housegains.auth.signIn.title'))).toBeTruthy();
    expect(view.getByTestId('housegains.auth.email')).toBeTruthy();
    expect(view.getByTestId('housegains.auth.password')).toBeTruthy();
    expect(view.getByTestId('housegains.auth.submit')).toBeTruthy();
  });
});

describe('provider buttons', () => {
  test('Apple is shown on iOS and hidden on Android', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    const ios = await renderSignIn(authWith());
    expect(ios.queryByTestId('housegains.auth.apple')).toBeTruthy();
    os.restore();

    jest.replaceProperty(Platform, 'OS', 'android');
    const android = await renderSignIn(authWith());
    expect(android.queryByTestId('housegains.auth.apple')).toBeNull();
  });

  test('Google is hidden until a web client id is provisioned', async () => {
    const hidden = await renderSignIn(authWith());
    expect(hidden.queryByTestId('housegains.auth.google')).toBeNull();

    mockGoogleId = 'web-client-id.apps.googleusercontent.com';
    const shown = await renderSignIn(authWith());
    expect(shown.queryByTestId('housegains.auth.google')).toBeTruthy();
  });
});

describe('email sign-in', () => {
  test('an invalid email shows the validation message and does not call sign-in', async () => {
    const signInWithEmail = jest.fn(async () => undefined);
    const view = await renderSignIn(authWith({ signInWithEmail }));

    await fireEvent.changeText(view.getByTestId('housegains.auth.email'), 'not-an-email');
    await fireEvent.changeText(view.getByTestId('housegains.auth.password'), 'secret123');
    await fireEvent.press(view.getByTestId('housegains.auth.submit'));

    await waitFor(() =>
      expect(view.getByTestId('housegains.auth.message').props.children).toBe(
        en('housegains.auth.validation.email'),
      ),
    );
    expect(signInWithEmail).not.toHaveBeenCalled();
  });

  test('a valid email and password call signInWithEmail', async () => {
    const signInWithEmail = jest.fn(async () => undefined);
    const view = await renderSignIn(authWith({ signInWithEmail }));

    await fireEvent.changeText(view.getByTestId('housegains.auth.email'), 'edu@example.com');
    await fireEvent.changeText(view.getByTestId('housegains.auth.password'), 'secret123');
    await fireEvent.press(view.getByTestId('housegains.auth.submit'));

    await waitFor(() =>
      expect(signInWithEmail).toHaveBeenCalledWith('edu@example.com', 'secret123'),
    );
  });

  test('a cancelled Apple sign-in shows no message', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    const signInWithApple = jest.fn(async () => {
      throw Object.assign(new Error('cancelled'), { code: 'ERR_REQUEST_CANCELED' });
    });
    const view = await renderSignIn(authWith({ signInWithApple }));

    await fireEvent.press(view.getByTestId('housegains.auth.apple'));

    await waitFor(() => expect(signInWithApple).toHaveBeenCalled());
    expect(view.queryByTestId('housegains.auth.message')).toBeNull();
    os.restore();
  });
});
