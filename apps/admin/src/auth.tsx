// Firebase Auth gate for the admin app: Google sign-in, then the ID token
// claims decide access. Only claims.admin === true may use the callables
// (contract C10); anyone else sees "Not authorized" and a sign-out button.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { getFirebase } from './firebase';

export type AuthState = 'loading' | 'signed-out' | 'unauthorized' | 'authorized';

export interface AuthContextValue {
  state: AuthState;
  /** The signed-in admin's uid (used to disable approving your own adjustment). */
  uid: string | null;
  error: string | null;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return String(e);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { auth } = useMemo(() => getFirebase(), []);
  const [state, setState] = useState<AuthState>('loading');
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUid(null);
        setState('signed-out');
        return;
      }
      setUid(user.uid);
      const token = await user.getIdTokenResult();
      setState(token.claims.admin === true ? 'authorized' : 'unauthorized');
    });
    return unsubscribe;
  }, [auth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      uid,
      error,
      async signIn() {
        try {
          setError(null);
          await signInWithPopup(auth, new GoogleAuthProvider());
        } catch (e) {
          setError(errorMessage(e));
        }
      },
      async signOut() {
        try {
          await signOut(auth);
        } catch (e) {
          setError(errorMessage(e));
        }
      },
    }),
    [state, uid, error, auth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth requires <AuthProvider>');
  return value;
}
