import auth, { type FirebaseAuthTypes } from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
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
        if (auth().currentUser?.uid !== user?.uid) return;
        if (!user) {
          setState({ status: 'signedOut', user: null });
          return;
        }
        const pendingDisplayName = pendingName.current;
        pendingName.current = undefined;
        let creatingProfile = false;
        try {
          const profile = await firestore().collection('users').doc(user.uid).get();
          creatingProfile = !profile.exists;
          if (creatingProfile) await ensureProfile(user, pendingDisplayName);
          if (auth().currentUser?.uid !== user.uid) return;
          setState({ status: 'signedIn', user });
        } catch {
          if (auth().currentUser?.uid !== user.uid) return;
          setState({ status: 'signedOut', user: null });
          // A failed first sign-in must be undone, or signing in again fires no auth event.
          // A failed read (offline) keeps the session so the next launch can retry.
          if (creatingProfile)
            void auth()
              .signOut()
              .catch(() => undefined);
        }
      }),
    [ensureProfile],
  );

  const withName = async (name: string | undefined, operation: () => Promise<void>) => {
    pendingName.current = name;
    try {
      await operation();
    } catch (error) {
      pendingName.current = undefined;
      throw error;
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
      await auth().signInWithCredential(
        auth.AppleAuthProvider.credential(apple.identityToken, rawNonce),
      );
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
      await auth().signInWithCredential(auth.GoogleAuthProvider.credential(response.data.idToken));
    });
  };

  const value: AuthValue = {
    status: state.status,
    user: state.user,
    signInWithApple,
    signInWithGoogle,
    signInWithEmail: async (email, password) => {
      await auth().signInWithEmailAndPassword(email.trim(), password);
    },
    createAccountWithEmail: async (name, email, password) => {
      await withName(name.trim(), async () => {
        await auth().createUserWithEmailAndPassword(email.trim(), password);
      });
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
