import firestore from '@react-native-firebase/firestore';
import { callFunction } from '@/features/firebase';
import { mapInboxCelebration, mapLedgerRow, mapOrganizer, mapWallet } from './gamification-mapping';
import type { InboxCelebration, Organizer, Wallet, WalletLedgerRow } from './types';

// Firestore reads (live listeners) and callables for the Ganhos & Zelo program.
// Paths and shapes: gamification-moderation-contract.md Part C3 / C8.
// Clients never write these documents; the owner reads the wallet and the inbox directly.

type Unsubscribe = () => void;

const LEDGER_LIMIT = 30;
const INBOX_LIMIT = 20;

/** wallets/{uid}. `null` when the wallet does not exist yet (nothing earned). */
export function subscribeToWallet(
  uid: string,
  onNext: (wallet: Wallet | null) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return firestore()
    .collection('wallets')
    .doc(uid)
    .onSnapshot((snap) => onNext(snap.exists() ? mapWallet(snap.data() ?? {}) : null), onError);
}

/** wallets/{uid}/ledger: the latest rows, newest first. */
export function subscribeToWalletLedger(
  uid: string,
  onNext: (rows: WalletLedgerRow[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return firestore()
    .collection('wallets')
    .doc(uid)
    .collection('ledger')
    .orderBy('createdAt', 'desc')
    .limit(LEDGER_LIMIT)
    .onSnapshot(
      (snap) => onNext(snap.docs.map((doc) => mapLedgerRow(doc.id, doc.data()))),
      onError,
    );
}

/** users/{uid}/inbox rows that were not acknowledged yet, oldest first. */
export function subscribeToInbox(
  uid: string,
  onNext: (rows: InboxCelebration[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return firestore()
    .collection('users')
    .doc(uid)
    .collection('inbox')
    .where('seen', '==', false)
    .limit(INBOX_LIMIT)
    .onSnapshot((snap) => {
      const rows = snap.docs.flatMap((doc) => {
        const row = mapInboxCelebration(doc.id, doc.data());
        return row ? [row] : [];
      });
      onNext(rows.sort((left, right) => left.createdAt.localeCompare(right.createdAt)));
    }, onError);
}

/** households/{hid}/organizer/{creatorUid}: members read it. `null` before the creator earned anything. */
export function subscribeToOrganizer(
  householdId: string,
  creatorUid: string,
  onNext: (organizer: Organizer | null) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return firestore()
    .collection('households')
    .doc(householdId)
    .collection('organizer')
    .doc(creatorUid)
    .onSnapshot(
      (snap) => onNext(snap.exists() ? mapOrganizer(creatorUid, snap.data() ?? {}) : null),
      onError,
    );
}

export const gamificationCalls = {
  /** Marks inbox rows seen (1..50 ids). */
  ackCelebrations: (input: { ids: string[] }) =>
    callFunction<{ ok: true; acknowledged: number }>('ackCelebrations', input),
  /** Replaces the future away weeks (Mondays); resolves with the stored list. */
  setAwayWeeks: (input: { householdId?: string; weekStarts: string[] }) =>
    callFunction<{ weekStarts: string[] }>('setAwayWeeks', input),
};
