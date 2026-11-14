import auth, { type FirebaseAuthTypes } from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useAppearance } from '@/features/appearance';
import { callFunction } from '@/features/firebase';
import { useLocale } from '@/localization/locale-context';
import { SIGN_IN_CANCELLED_CODE } from './auth-errors';
import { createRawNonce, hashNonce } from './nonce';
import { googleWebClientId } from './providers';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface AuthValue {
  status: AuthStatus;
  user: FirebaseAuthTypes.User | null;
  signInWithApple(): Promise<void>;
  signInWithGoogle(): Promise<void>;
  signInWithEmail(email: string, password: string): Promise<void>;
  createAccountWithEmail(name: string, email: string, password: string): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
}

export const AuthContext = createContext<AuthValue | undefined>(undefined);

const FALLBACK_NAME = 'Member';
const sha256Hex = (value: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);

/** Firebase auth state, plus the sign-in methods. Every sign-in ensures the user's profile. */
export function AuthProvider({ children }: PropsWithChildren): React.JSX.Element {
  const { activeLocale } = useLocale();
  const { themeId } = useAppearance();
  const [state, setState] = useState<{ status: AuthStatus; user: FirebaseAuthTypes.User | null }>({
    status: 'loading',
    user: null,
  });
  const latest = useRef({ locale: activeLocale, themeId });
  latest.current = { locale: activeLocale, themeId };
  // Apple and Google send the name only on the first sign-in; it is read before the auth state changes.
  const pendingName = useRef<string | undefined>(undefined);

  const ensureProfile = useCallback(async (user: FirebaseAuthTypes.User, name?: string) => {
    const displayName = (name ?? user.displayName ?? user.email?.split('@')[0] ?? '')
      .trim()
      .slice(0, 40);
    await callFunction('ensureProfile', {
      displayName: displayName || FALLBACK_NAME,
      locale: latest.current.locale,
      themeId: latest.current.themeId,
    });
  }, []);

  useEffect(() => {
    const googleId = googleWebClientId();
    if (googleId) GoogleSignin.configure({ webClientId: googleId });
  }, []);

  useEffect(
    () =>
      auth().onAuthStateChanged(async (user) => {
        if (!user) {
          setState({ status: 'signedOut', user: null });
          return;
        }
        try {
          await ensureProfile(user, pendingName.current);
          setState({ status: 'signedIn', user });
        } catch {
          // The sign-in screen stays up; signing in again retries the profile.
          setState({ status: 'signedOut', user: null });
        }
      }),
    [ensureProfile],
  );

  const withName = async (name: string | undefined, operation: () => Promise<void>) => {
    pendingName.current = name;
    try {
      await operation();
    } finally {
      pendingName.current = undefined;
    }
  };

  const signInWithApple = async () => {
    const rawNonce = createRawNonce(Crypto.randomUUID());
    const apple = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: await hashNonce(rawNonce, sha256Hex),
    });
    if (!apple.identityToken) throw new Error('Apple sign-in returned no identity token.');
    const name =
      [apple.fullName?.givenName, apple.fullName?.familyName].filter(Boolean).join(' ') ||
      undefined;
    await withName(name, async () => {
      const result = await auth().signInWithCredential(
        auth.AppleAuthProvider.credential(apple.identityToken, rawNonce),
      );
      await ensureProfile(result.user, name);
    });
  };

  const signInWithGoogle = async () => {
    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') {
      throw Object.assign(new Error('Google sign-in was cancelled.'), {
        code: SIGN_IN_CANCELLED_CODE,
      });
    }
    const name = response.data.user.name ?? undefined;
    await withName(name, async () => {
      const result = await auth().signInWithCredential(
        auth.GoogleAuthProvider.credential(response.data.idToken),
      );
      await ensureProfile(result.user, name);
    });
  };

  const value: AuthValue = {
    status: state.status,
    user: state.user,
    signInWithApple,
    signInWithGoogle,
    signInWithEmail: async (email, password) => {
      const result = await auth().signInWithEmailAndPassword(email.trim(), password);
      await ensureProfile(result.user);
    },
    createAccountWithEmail: async (name, email, password) => {
      const result = await auth().createUserWithEmailAndPassword(email.trim(), password);
      await withName(name.trim(), () => ensureProfile(result.user, name.trim()));
    },
    sendPasswordReset: async (email) => {
      await auth().sendPasswordResetEmail(email.trim());
    },
    signOut: async () => {
      if (googleWebClientId()) await GoogleSignin.signOut().catch(() => undefined);
      await auth().signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
