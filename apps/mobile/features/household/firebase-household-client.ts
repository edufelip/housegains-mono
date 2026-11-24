import firestore from '@react-native-firebase/firestore';
import { callFunction } from '@/features/firebase';
import {
  mapChore,
  mapDispute,
  mapFeedPost,
  mapInstance,
  mapInvite,
  mapLedgerEntry,
  mapWeekStandings,
  splitMembers,
} from './household-mapping';
import { householdQueryWindow } from './household-query-window';
import type {
  Chore,
  Dispute,
  FeedPost,
  Instance,
  Invite,
  Member,
  WeekStandings,
  XpLedgerEntry,
} from './types';

// Firestore reads (live listeners) and callable writes. The shapes follow
// docs/implementation/firebase-contract.md, its moderation addendum
// (gamification-moderation-contract.md Parts A and B), and
// apps/firebase/functions/src/store.ts.

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
  /** Open completion disputes (status == 'open'). */
  disputes: Dispute[];
  /** Latest closed week snapshot, or null before any week has closed. */
  lastWeek: WeekStandings | null;
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
  const window = householdQueryWindow(new Date());

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
      .where('dueAt', '>=', firestore.Timestamp.fromDate(window.instanceFrom))
      .where('dueAt', '<=', firestore.Timestamp.fromDate(window.instanceUntil))
      .orderBy('dueAt')
      .onSnapshot((snap) => {
        onPatch({ instances: snap.docs.map((doc) => mapInstance(doc.id, doc.data())) });
      }, onError),
    household
      .collection('ledger')
      .where('createdAt', '>=', firestore.Timestamp.fromDate(window.ledgerFrom))
      .orderBy('createdAt', 'desc')
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
    // Open completion disputes only; resolved and expired disputes stay out of the app's
    // working set (contract A2, doc id = instance id).
    household
      .collection('disputes')
      .where('status', '==', 'open')
      .onSnapshot((snap) => {
        onPatch({ disputes: snap.docs.map((doc) => mapDispute(doc.id, doc.data())) });
      }, onError),
    // The latest closed week snapshot (contract Part B: Ranks "Last week" card).
    household
      .collection('weeks')
      .orderBy('weekStart', 'desc')
      .limit(1)
      .onSnapshot((snap) => {
        const latest = snap.docs[0];
        onPatch({ lastWeek: latest ? mapWeekStandings(latest.data()) : null });
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
  // Moderation callables (gamification-moderation-contract.md Part A).
  setMemberRole: (input: { householdId: string; memberId: string; role: 'admin' | 'member' }) =>
    callFunction<{ memberId: string; role: 'admin' | 'member' }>('setMemberRole', input),
  reportCompletion: (input: {
    householdId: string;
    instanceId: string;
    subtaskIds?: string[];
    reason?: string;
  }) => callFunction<{ disputeId: string }>('reportCompletion', input),
  resolveDispute: (input: {
    householdId: string;
    disputeId: string;
    verdict: 'done' | 'partial' | 'not_done';
    subtaskIds?: string[];
  }) =>
    callFunction<{ disputeId: string; verdict: string; revokedSubtaskIds: string[] }>(
      'resolveDispute',
      input,
    ),
  moderateInstance: (input: {
    householdId: string;
    instanceId: string;
    verdict: 'partial' | 'not_done';
    subtaskIds?: string[];
  }) =>
    callFunction<{ instanceId: string; verdict: string; revokedSubtaskIds: string[] }>(
      'moderateInstance',
      input,
    ),
};
