import firestore from '@react-native-firebase/firestore';
import { callFunction } from '@/features/firebase';
import {
  mapChore,
  mapFeedPost,
  mapInstance,
  mapInvite,
  mapLedgerEntry,
  splitMembers,
} from './household-mapping';
import type { Chore, FeedPost, Instance, Invite, Member, XpLedgerEntry } from './types';

// Firestore reads (live listeners) and callable writes. The shapes follow
// docs/implementation/firebase-contract.md and apps/firebase/functions/src/store.ts.

const DAY_MS = 24 * 60 * 60 * 1000;
const INSTANCE_PAST_DAYS = 35;
const INSTANCE_FUTURE_DAYS = 15;
const LEDGER_DAYS = 70;
const FEED_LIMIT = 50;

export interface ProfileSnapshot {
  householdId: string | null;
  displayName: string;
  initials: string;
  color: string;
}

/** Each key is set once its listener has delivered; `householdDoc: null` means the household is gone. */
export interface HouseholdSlices {
  householdDoc: { id: string; data: Record<string, any> } | null;
  members: Member[];
  formerMembers: Member[];
  invite: Invite;
  chores: Chore[];
  instances: Instance[];
  ledger: XpLedgerEntry[];
  feed: FeedPost[];
}

type Unsubscribe = () => void;

export function subscribeToProfile(
  uid: string,
  onNext: (profile: ProfileSnapshot) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return firestore()
    .collection('users')
    .doc(uid)
    .onSnapshot((snap) => {
      const data = snap.data() ?? {};
      onNext({
        householdId: typeof data.householdId === 'string' ? data.householdId : null,
        displayName: data.displayName ?? '',
        initials: data.initials ?? '',
        color: data.color ?? '#7c5cff',
      });
    }, onError);
}

export function subscribeToHousehold(
  householdId: string,
  onPatch: (patch: Partial<HouseholdSlices>) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  const db = firestore();
  const household = db.collection('households').doc(householdId);
  const now = Date.now();
  const at = (offsetDays: number) =>
    firestore.Timestamp.fromDate(new Date(now + offsetDays * DAY_MS));

  const unsubscribes: Unsubscribe[] = [
    household.onSnapshot((snap) => {
      onPatch({
        householdDoc: snap.exists() ? { id: householdId, data: snap.data() ?? {} } : null,
      });
    }, onError),
    household
      .collection('members')
      .orderBy('joinedAt')
      .onSnapshot((snap) => {
        const { roster, formerMembers } = splitMembers(
          snap.docs.map((doc) => ({ id: doc.id, data: doc.data() })),
        );
        onPatch({ members: roster, formerMembers });
      }, onError),
    household
      .collection('meta')
      .doc('invite')
      .onSnapshot((snap) => onPatch({ invite: mapInvite(snap.data()) }), onError),
    household.collection('chores').onSnapshot((snap) => {
      onPatch({ chores: snap.docs.map((doc) => mapChore(doc.id, doc.data())) });
    }, onError),
    household
      .collection('instances')
      .where('dueAt', '>=', at(-INSTANCE_PAST_DAYS))
      .where('dueAt', '<=', at(INSTANCE_FUTURE_DAYS))
      .orderBy('dueAt')
      .onSnapshot((snap) => {
        onPatch({ instances: snap.docs.map((doc) => mapInstance(doc.id, doc.data())) });
      }, onError),
    household
      .collection('ledger')
      .where('createdAt', '>=', at(-LEDGER_DAYS))
      .onSnapshot((snap) => {
        onPatch({ ledger: snap.docs.map((doc) => mapLedgerEntry(doc.id, doc.data())) });
      }, onError),
    household
      .collection('feed')
      .orderBy('createdAt', 'desc')
      .limit(FEED_LIMIT)
      .onSnapshot((snap) => {
        onPatch({ feed: snap.docs.map((doc) => mapFeedPost(doc.id, doc.data())) });
      }, onError),
  ];

  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

/** Callable writes. Each returns the callable's payload; failures throw CallableError. */
export const householdCalls = {
  ensureProfile: (input: { displayName: string; locale: string; themeId: string }) =>
    callFunction<ProfileSnapshot>('ensureProfile', input),
  createHousehold: (input: { name: string; icon: string; color: string; timeZone: string }) =>
    callFunction<{ householdId: string }>('createHousehold', input),
  updateHousehold: (input: { householdId: string; name: string; icon: string; color: string }) =>
    callFunction<{ ok: true }>('updateHousehold', input),
  joinHousehold: (input: { code: string }) =>
    callFunction<{ householdId: string }>('joinHousehold', input),
  rotateInvite: (input: { householdId: string }) =>
    callFunction<{ code: string; expiresAt: string }>('rotateInvite', input),
  saveChore: (input: { householdId: string; chore: Record<string, unknown> }) =>
    callFunction<{ choreId: string }>('saveChore', input),
  setAssignments: (input: { householdId: string; choreId: string; assigneeIds: string[] }) =>
    callFunction<unknown>('setAssignments', input),
  setChoreActive: (input: { householdId: string; choreId: string; isActive: boolean }) =>
    callFunction<unknown>('setChoreActive', input),
  deleteChore: (input: { householdId: string; choreId: string }) =>
    callFunction<unknown>('deleteChore', input),
  completeSubtask: (input: { householdId: string; instanceId: string; subtaskId: string }) =>
    callFunction<unknown>('completeSubtask', input),
  undoSubtask: (input: { householdId: string; instanceId: string; subtaskId: string }) =>
    callFunction<unknown>('undoSubtask', input),
  finishSetup: (input: { householdId: string }) => callFunction<unknown>('finishSetup', input),
  postCompletion: (input: { householdId: string; instanceId: string }) =>
    callFunction<unknown>('postCompletion', input),
};
