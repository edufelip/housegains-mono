// Account callables and sign-out. Inputs match apps/firebase/functions/src/store.ts.
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import messaging from '@react-native-firebase/messaging';
import { callFunction } from '@/features/firebase';
import { reportReasonText } from './account-rules';
import type { ReportKind, ReportReason } from './account-rules';

export function leaveHousehold(householdId: string): Promise<unknown> {
  return callFunction('leaveHousehold', { householdId });
}

export function removeMember(householdId: string, uid: string): Promise<unknown> {
  return callFunction('removeMember', { householdId, uid });
}

export function reportContent(input: {
  householdId: string;
  kind: ReportKind;
  targetId: string;
  reason: ReportReason;
  note: string;
}): Promise<unknown> {
  return callFunction('reportContent', {
    householdId: input.householdId,
    kind: input.kind,
    targetId: input.targetId,
    reason: reportReasonText(input.reason, input.note),
  });
}

/** Server deletes the profile and Auth user; the local session is then cleared. */
export async function deleteAccount(): Promise<void> {
  await callFunction('deleteAccount', {});
  await auth().signOut();
}

/** Drops this device's push token first (best effort), then signs out. */
export async function signOut(): Promise<void> {
  const uid = auth().currentUser?.uid;
  if (uid) {
    try {
      const token = await messaging().getToken();
      await firestore()
        .doc(`users/${uid}`)
        .update({ fcmTokens: firestore.FieldValue.arrayRemove(token) });
    } catch {
      // Sign-out must still succeed when the token cannot be removed.
    }
  }
  await auth().signOut();
}
