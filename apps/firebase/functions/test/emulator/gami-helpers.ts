import { Timestamp } from 'firebase-admin/firestore';
import {
  adminDb,
  choreInput,
  createHousehold,
  must,
  nextOpenInstance,
  withProfile,
  type TestUser,
} from './helpers';

// Shared setup for the gamification emulator suites (contract Part C). Every suite
// resets gamification/config in afterAll so the other suites run with the engine off.

export interface GamiConfigInput {
  mode: 'off' | 'shadow' | 'live';
  livePercent?: number;
  controlPercent?: number;
  cohortSalt?: string;
  activeVersion?: number | null;
}

/** `off` removes the config doc (missing doc = off); the other modes write it. */
export async function setGamiConfig(config: GamiConfigInput): Promise<void> {
  const ref = adminDb().doc('gamification/config');
  if (config.mode === 'off') {
    await ref.delete();
    return;
  }
  await ref.set({
    mode: config.mode,
    activeVersion: config.activeVersion ?? null,
    previousVersion: null,
    cohortSalt: config.cohortSalt ?? 'test-salt',
    livePercent: config.livePercent ?? 0,
    controlPercent: config.controlPercent ?? 0,
  });
}

/** Everyone in the live cohort: livePercent 100 makes every household 'live'. */
export const LIVE = { mode: 'live', livePercent: 100, controlPercent: 0 } as const;

export async function resetGamiConfig(): Promise<void> {
  await adminDb().doc('gamification/config').delete();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Chores edited less than 24 h ago mint no Ganhos (C4): age the chore so earns apply. */
export async function ageChore(householdId: string, choreId: string): Promise<void> {
  await adminDb()
    .doc(`households/${householdId}/chores/${choreId}`)
    .update({ updatedAt: Timestamp.fromMillis(Date.now() - 3 * DAY_MS), createdAt: Timestamp.fromMillis(Date.now() - 3 * DAY_MS) });
}

/** Marks the member's welcome bonus as already paid, so amounts below are not shifted by +50. */
export async function burnWelcome(uid: string): Promise<void> {
  await adminDb().doc(`wallets/${uid}`).set({ stats: { welcomePaid: true } }, { merge: true });
}

export interface GamiHousehold {
  creator: TestUser;
  member: TestUser;
  householdId: string;
  code: string;
  choreId: string;
}

/** A creator, one joined member and an aged kitchen chore (10 + 15 + 5 XP, bonus 5). */
export async function gamiHousehold(
  label: string,
  chore: Record<string, unknown> = {},
  options: { assign?: 'creator' | 'member' } = {},
): Promise<GamiHousehold> {
  const creator = await withProfile(`${label}-c`, 'Alex');
  const { householdId, code } = await createHousehold(creator);
  const member = await withProfile(`${label}-m`, 'Sam');
  await must('joinHousehold', member.token, { code });
  const { choreId } = await must('saveChore', creator.token, {
    householdId,
    chore: choreInput({
      ...(options.assign === 'creator' ? { assigneeIds: [creator.uid] } : {}),
      ...(options.assign === 'member' ? { assigneeIds: [member.uid] } : {}),
      ...chore,
    }),
  });
  await ageChore(householdId, choreId);
  return { creator, member, householdId, code, choreId };
}

export async function walletOf(uid: string) {
  const snap = await adminDb().doc(`wallets/${uid}`).get();
  return snap.exists ? (snap.data() as Record<string, any>) : null;
}

/** Wallet ledger rows keyed by their deterministic key. */
export async function walletLedger(uid: string): Promise<Record<string, Record<string, any>>> {
  const snap = await adminDb().collection(`wallets/${uid}/ledger`).get();
  return Object.fromEntries(snap.docs.map((doc) => [doc.id, doc.data()]));
}

export async function organizerLedger(householdId: string): Promise<Record<string, Record<string, any>>> {
  const snap = await adminDb().collection(`households/${householdId}/organizerLedger`).get();
  return Object.fromEntries(snap.docs.map((doc) => [doc.id, doc.data()]));
}

export async function inboxOf(uid: string) {
  const snap = await adminDb().collection(`users/${uid}/inbox`).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Record<string, any> & { id: string });
}

export async function serverEvents(householdId: string, name?: string) {
  const snap = await adminDb().collection(`households/${householdId}/events`).get();
  const all = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Record<string, any> & { id: string });
  return name === undefined ? all : all.filter((event) => event.name === name);
}

/** The XP ledger rows of one instance, newest last. */
export async function xpRows(householdId: string, instanceId: string) {
  const snap = await adminDb().collection(`households/${householdId}/ledger`).where('instanceId', '==', instanceId).get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as Record<string, any> & { id: string })
    .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
}

/** The first `count` open instances of a chore, in due order (future ones can be completed too). */
export async function openInstances(householdId: string, choreId: string, count: number) {
  const snap = await adminDb()
    .collection(`households/${householdId}/instances`)
    .where('choreId', '==', choreId)
    .where('status', '==', 'open')
    .orderBy('dueAt')
    .get();
  const now = Date.now();
  return snap.docs.filter((doc) => doc.get('dueAt').toMillis() > now).slice(0, count);
}

export { nextOpenInstance };

/** Polls until `read` returns a defined value (the safety-net trigger runs asynchronously). */
export async function waitFor<T>(read: () => Promise<T | undefined | null | false>, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value !== undefined && value !== null && value !== false) return value;
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}
