import type * as ReactModule from 'react';
import type * as ReactNativeModule from 'react-native';

jest.mock('@expo/vector-icons', () => {
  const React = jest.requireActual<typeof ReactModule>('react');
  const { Text } = jest.requireActual<typeof ReactNativeModule>('react-native');
  return {
    MaterialIcons: (props: {
      name: string;
      color: string;
      style?: ReactNativeModule.StyleProp<ReactNativeModule.TextStyle>;
      'aria-hidden'?: boolean;
    }) =>
      React.createElement(
        Text,
        {
          testID: `material-icon.${props.name}`,
          style: [props.style, { color: props.color }],
          'aria-hidden': props['aria-hidden'],
        },
        props.name,
      ),
  };
});
// Native Firebase, Google and Apple modules: components under test never call them, they only need to import.
// Native Firebase modules are faked below (mockFirebase); Google and Apple only need to import.
jest.mock('@react-native-google-signin/google-signin', () => {
  const React = jest.requireActual<typeof ReactModule>('react');
  const { Pressable } = jest.requireActual<typeof ReactNativeModule>('react-native');
  return {
    GoogleSignin: {
      configure: () => undefined,
      signIn: async () => ({}),
      signOut: async () => undefined,
    },
    GoogleSigninButton: (props: { testID?: string; onPress?(): void }) =>
      React.createElement(Pressable, { testID: props.testID, onPress: props.onPress }),
  };
});
jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationButton: (props: { testID?: string; onPress?(): void }) => {
    const React = jest.requireActual<typeof ReactModule>('react');
    const { Pressable } = jest.requireActual<typeof ReactNativeModule>('react-native');
    return React.createElement(Pressable, { testID: props.testID, onPress: props.onPress });
  },
  AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 1 },
  AppleAuthenticationButtonType: { SIGN_IN: 0 },
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  signInAsync: async () => ({}),
}));

afterEach(() => {
  jest.useRealTimers();
});

// Firebase native modules: an in-memory fake shared by the account and reminder tests.
// Tests set `mockFirebase` fields in beforeEach; nothing here talks to a backend.
const mockFirebase = {
  currentUser: null as null | { uid: string; email: string | null; displayName: string | null },
  docs: {} as Record<string, Record<string, unknown>>,
  updates: [] as { path: string; data: Record<string, unknown> }[],
  reads: [] as string[],
  queries: [] as { path: string; op: string; args: unknown[] }[],
  calls: [] as { name: string; data: unknown }[],
  failures: {} as Record<string, { code: string; message?: string }>,
  signOuts: 0,
  permission: 1,
  deletedTokens: 0,
  hangUpdates: false,
  authStateListener: undefined as
    | ((user: { uid: string; email: string | null; displayName: string | null } | null) => void)
    | undefined,
};
(globalThis as { mockFirebase?: typeof mockFirebase }).mockFirebase = mockFirebase;

jest.mock('@react-native-firebase/auth', () => {
  const auth = () => ({
    get currentUser() {
      return mockFirebase.currentUser;
    },
    signOut: async () => {
      mockFirebase.signOuts += 1;
      mockFirebase.currentUser = null;
    },
    onAuthStateChanged: (listener: (user: typeof mockFirebase.currentUser) => void) => {
      mockFirebase.authStateListener = listener;
      return () => {
        mockFirebase.authStateListener = undefined;
      };
    },
    signInWithEmailAndPassword: async () => ({ user: mockFirebase.currentUser }),
    createUserWithEmailAndPassword: async () => ({ user: mockFirebase.currentUser }),
    useEmulator: () => undefined,
  });
  return {
    __esModule: true,
    default: Object.assign(auth, {
      AppleAuthProvider: { credential: () => ({}) },
      GoogleAuthProvider: { credential: () => ({}) },
    }),
  };
});

jest.mock('@react-native-firebase/firestore', () => {
  const query = (path: string) => ({
    collection: (name: string) => query(`${path}/${name}`),
    doc: (id: string) => query(`${path}/${id}`),
    where: (...args: unknown[]) => {
      mockFirebase.queries.push({ path, op: 'where', args });
      return query(path);
    },
    orderBy: (...args: unknown[]) => {
      mockFirebase.queries.push({ path, op: 'orderBy', args });
      return query(path);
    },
    limit: (...args: unknown[]) => {
      mockFirebase.queries.push({ path, op: 'limit', args });
      return query(path);
    },
    onSnapshot: () => () => undefined,
    get: async () => ({
      exists: Boolean(mockFirebase.docs[path]),
      data: () => mockFirebase.docs[path],
    }),
    update: async (data: Record<string, unknown>) => {
      mockFirebase.updates.push({ path, data });
    },
  });
  const firestore = () => ({
    doc: (path: string) => ({
      get: async () => {
        mockFirebase.reads.push(path);
        return { exists: Boolean(mockFirebase.docs[path]), data: () => mockFirebase.docs[path] };
      },
      update: async (data: Record<string, unknown>) => {
        if (mockFirebase.hangUpdates) return new Promise(() => undefined);
        mockFirebase.updates.push({ path, data });
      },
      onSnapshot: (onNext: (snapshot: { data(): unknown }) => void) => {
        onNext({ data: () => mockFirebase.docs[path] });
        return () => undefined;
      },
      collection: (name: string) => query(`${path}/${name}`),
    }),
    collection: (name: string) => query(name),
  });
  firestore.Timestamp = { fromDate: (date: Date) => date };
  firestore.FieldValue = {
    arrayRemove: (value: unknown) => ({ op: 'arrayRemove', value }),
    arrayUnion: (value: unknown) => ({ op: 'arrayUnion', value }),
  };
  return { __esModule: true, default: firestore };
});

jest.mock('@react-native-firebase/messaging', () => {
  const messaging = () => ({
    requestPermission: async () => mockFirebase.permission,
    getToken: async () => 'device-token',
    deleteToken: async () => {
      mockFirebase.deletedTokens += 1;
    },
    onTokenRefresh: () => () => undefined,
  });
  messaging.AuthorizationStatus = {
    NOT_DETERMINED: -1,
    DENIED: 0,
    AUTHORIZED: 1,
    PROVISIONAL: 2,
    EPHEMERAL: 3,
  };
  return { __esModule: true, default: messaging };
});

jest.mock('@react-native-firebase/functions', () => ({
  firebase: {
    app: () => ({
      functions: () => ({
        useEmulator: () => undefined,
        httpsCallable: (name: string) => async (data: unknown) => {
          mockFirebase.calls.push({ name, data });
          const failure = mockFirebase.failures[name];
          if (failure)
            throw Object.assign(new Error(failure.message ?? name), { code: failure.code });
          return { data: {} };
        },
      }),
    }),
  },
}));
