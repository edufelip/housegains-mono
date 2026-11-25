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
    // Every auth change gets a ticket; a slower claims read of an older user must not overwrite
    // what a newer change (sign-out, another account) already decided.
    let latest = 0;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const ticket = ++latest;
      if (!user) {
        setUid(null);
        setState('signed-out');
        return;
      }
      // A different user must not inherit the previous one's access while the claims read is
      // pending: from this moment the gate shows B's uid as not (yet) authorized.
      setUid(user.uid);
      setState('loading');
      void (async () => {
        try {
          const token = await user.getIdTokenResult();
          if (ticket !== latest) return;
          setUid(user.uid);
          setState(token.claims.admin === true ? 'authorized' : 'unauthorized');
        } catch (e) {
          if (ticket !== latest) return;
          // Access could not be verified: never fall through to the admin shell. Back to the
          // sign-in gate with the reason, and drop the session so signing in again re-checks.
          setUid(null);
          setError(`Could not verify admin access: ${errorMessage(e)}`);
          setState('signed-out');
          try {
            await signOut(auth);
          } catch (signOutError) {
            if (ticket === latest) {
              setError(
                `Could not verify admin access: ${errorMessage(e)} (sign-out also failed: ${errorMessage(signOutError)})`,
              );
            }
          }
        }
      })();
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
