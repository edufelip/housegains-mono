// Firebase bootstrap for the admin app: web app config from VITE_FIREBASE_* env
// vars, Auth + Functions handles, and emulator wiring for local development.
// Real keys never live in the repo; see .env.example and README.md.

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  type Auth,
} from 'firebase/auth';
import {
  connectFunctionsEmulator,
  getFunctions,
  type Functions,
} from 'firebase/functions';

// Must match REGION in apps/firebase/functions/src/index.ts.
export const REGION = 'us-central1';

export interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  functions: Functions;
}

let handles: FirebaseHandles | null = null;

function createFirebase(): FirebaseHandles {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  };
  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  const functions = getFunctions(app, REGION);
  if (import.meta.env.VITE_USE_EMULATORS === '1') {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFunctionsEmulator(functions, 'localhost', 5001);
  }
  return { app, auth, functions };
}

export function getFirebase(): FirebaseHandles {
  if (!handles) handles = createFirebase();
  return handles;
}
