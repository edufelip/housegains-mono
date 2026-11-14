import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { firebase } from '@react-native-firebase/functions';
import { Platform } from 'react-native';

export const FUNCTIONS_REGION = 'us-central1';

const functionsForRegion = () => firebase.app().functions(FUNCTIONS_REGION);

/** A failed callable. `code` has no "functions/" prefix, e.g. "failed-precondition". */
export class CallableError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CallableError';
  }
}

export async function callFunction<T>(name: string, payload: Record<string, unknown>): Promise<T> {
  try {
    const result = await functionsForRegion().httpsCallable<typeof payload, T>(name)(payload);
    return result.data;
  } catch (error) {
    const { code = 'unknown', message = '' } = (error ?? {}) as { code?: string; message?: string };
    throw new CallableError(code.replace(/^functions\//, ''), message);
  }
}

// Dev-only: point the SDKs at the local emulators (npm run firebase:emulators in the repo root).
if (__DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === '1') {
  const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  auth().useEmulator(`http://${host}:9099`);
  firestore().useEmulator(host, 8080);
  functionsForRegion().useEmulator(host, 5001);
}
