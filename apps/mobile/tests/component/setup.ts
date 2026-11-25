import type * as ReactModule from 'react';
import type * as ReactNativeModule from 'react-native';

jest.mock('@expo/vector-icons', () => {
  const React = jest.requireActual<typeof ReactModule>('react');
  const { Text } = jest.requireActual<typeof ReactNativeModule>('react-native');
  const icon = (prefix: string) => {
    function MockIcon(props: {
      name: string;
      color: string;
      style?: ReactNativeModule.StyleProp<ReactNativeModule.TextStyle>;
      'aria-hidden'?: boolean;
    }) {
      return React.createElement(
        Text,
        {
          testID: `${prefix}.${props.name}`,
          style: [props.style, { color: props.color }],
          'aria-hidden': props['aria-hidden'],
        },
        props.name,
      );
    }
    return MockIcon;
  };
  return { MaterialIcons: icon('material-icon'), Ionicons: icon('ionicon') };
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

// Native store review: the OS dialog is never shown in tests. restoreMocks resets these
// implementations between tests, so a test that cares sets them again in beforeEach.
jest.mock('expo-store-review', () => ({
  hasAction: jest.fn(async () => true),
  isAvailableAsync: jest.fn(async () => true),
  requestReview: jest.fn(async () => undefined),
  storeUrl: jest.fn(() => 'https://example.test/store'),
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
  failProfileRead: false,
  remoteConfigValue: '' as string,
  /** Remote Config `gamification_enabled`; the bundled default is false. */
  gamificationEnabled: false as boolean,
  /** Makes Remote Config unavailable: ensureInitialized rejects. */
  remoteConfigFails: false as boolean,
  remoteConfigFetches: 0,
  remoteConfigFetchedValue: null as string | null,
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
    get: async () => {
      if (mockFirebase.failProfileRead)
        throw Object.assign(new Error('offline'), { code: 'unavailable' });
      return {
        exists: Boolean(mockFirebase.docs[path]),
        data: () => mockFirebase.docs[path],
      };
    },
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

// Like the native SDK, activated values are only readable after ensureInitialized() loads them
// from disk; before that getValue returns the (empty) default.
let mockRemoteConfigInitialized = false;
beforeEach(() => {
  mockRemoteConfigInitialized = false;
});
jest.mock('@react-native-firebase/remote-config', () => {
  const remoteConfig = () => ({
    // Loading activated values from disk takes a tick, like the native SDK.
    ensureInitialized: () =>
      new Promise<void>((resolve, reject) =>
        setTimeout(() => {
          if (mockFirebase.remoteConfigFails) {
            reject(new Error('remote config unavailable'));
            return;
          }
          mockRemoteConfigInitialized = true;
          resolve();
        }, 0),
      ),
    getValue: (key: string) => ({
      asString: () => (mockRemoteConfigInitialized ? mockFirebase.remoteConfigValue : ''),
      asBoolean: () =>
        key === 'gamification_enabled' &&
        mockRemoteConfigInitialized &&
        mockFirebase.gamificationEnabled,
    }),
    setConfigSettings: async () => undefined,
    fetchAndActivate: async () => {
      mockFirebase.remoteConfigFetches += 1;
      // A newer server value becomes the activated value (read on the next cold start).
      if (mockFirebase.remoteConfigFetchedValue !== null) {
        mockFirebase.remoteConfigValue = mockFirebase.remoteConfigFetchedValue;
      }
      return true;
    },
  });
  return { __esModule: true, default: remoteConfig };
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
