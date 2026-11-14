import { randomUUID } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { expect } from 'vitest';

// Runs only under `firebase emulators:exec`. Refusing to run without the emulator hosts
// means these tests can never reach a real project.
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Emulator tests must run under `firebase emulators:exec --only auth,firestore,functions`.');
}

export const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'housegains-dev';
const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;

if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
export const adminDb = () => getFirestore();
export const adminAuth = () => getAuth();

export interface CallResult {
  ok: boolean;
  result?: any;
  code?: string;
  message?: string;
}

/** Calls an emulated onCall function over HTTP, the same protocol the mobile app uses. */
export async function callFn(name: string, token: string | null, data: unknown): Promise<CallResult> {
  const response = await fetch(`http://${FUNCTIONS_HOST}/${PROJECT_ID}/us-central1/${name}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  const body = (await response.json()) as { result?: unknown; error?: { status?: string; message?: string } };
  if (response.ok) return { ok: true, result: body.result };
  return {
    ok: false,
    code: (body.error?.status ?? 'UNKNOWN').toLowerCase().replace(/_/g, '-'),
    message: body.error?.message,
  };
}

/** Calls and returns the result, failing the test if the call errors. */
export async function must(name: string, token: string | null, data: unknown): Promise<any> {
  const response = await callFn(name, token, data);
  if (!response.ok) throw new Error(`${name} failed: ${response.code} ${response.message}`);
  return response.result;
}

export async function expectError(name: string, token: string | null, data: unknown, code: string) {
  const response = await callFn(name, token, data);
  expect(response.ok, `${name} should fail with ${code}`).toBe(false);
  expect(response.code).toBe(code);
}

export interface TestUser {
  uid: string;
  token: string;
}

/** Creates an Auth emulator user and returns its id token. */
export async function newUser(label: string): Promise<TestUser> {
  const response = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `${label}-${randomUUID()}@example.test`,
        password: 'correct-horse-battery',
        returnSecureToken: true,
      }),
    },
  );
  const body = (await response.json()) as { localId: string; idToken: string };
  return { uid: body.localId, token: body.idToken };
}

export async function withProfile(label: string, displayName: string): Promise<TestUser> {
  const user = await newUser(label);
  await must('ensureProfile', user.token, { displayName, locale: 'en-US', themeId: 'arcade' });
  return user;
}

export async function createHousehold(creator: TestUser): Promise<{ householdId: string; code: string }> {
  const { householdId } = await must('createHousehold', creator.token, {
    name: 'Apto 302',
    icon: 'house',
    color: '#76ff03',
    timeZone: 'UTC',
  });
  const invite = await adminDb().doc(`households/${householdId}/meta/invite`).get();
  return { householdId, code: invite.get('code') as string };
}

export function choreInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Kitchen reset',
    icon: 'sparkle',
    category: 'kitchen',
    subtasks: [
      { id: 'wash', name: 'Wash', xp: 10, position: 0 },
      { id: 'wipe', name: 'Wipe', xp: 15, position: 1 },
      { id: 'trash', name: 'Trash', xp: 5, position: 2 },
    ],
    bonusXp: 5,
    assigneeIds: [],
    recurrence: 'daily',
    dueTime: '23:59',
    isActive: true,
    ...overrides,
  };
}

/** The earliest open instance of a chore that is still in the future. */
export async function nextOpenInstance(householdId: string, choreId: string) {
  const snap = await adminDb()
    .collection(`households/${householdId}/instances`)
    .where('choreId', '==', choreId)
    .where('status', '==', 'open')
    .orderBy('dueAt')
    .get();
  const now = Date.now();
  const doc = snap.docs.find((d) => d.get('dueAt').toMillis() > now);
  if (!doc) throw new Error('no future open instance');
  return doc;
}
