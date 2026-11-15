// Chore reminder permission, device token storage and the reminder preference.
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import messaging from '@react-native-firebase/messaging';
import { useEffect, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { nextFcmTokens } from './reminder-rules';

async function requestPermission(): Promise<boolean> {
  // Android 13+ needs a runtime grant for notifications; earlier versions grant it at install.
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (result !== PermissionsAndroid.RESULTS.GRANTED) return false;
  }
  const status = await messaging().requestPermission();
  return (
    status === messaging.AuthorizationStatus.AUTHORIZED ||
    status === messaging.AuthorizationStatus.PROVISIONAL
  );
}

/** Saves a device token (dropping the oldest past the limit) and the preference, in one write. */
async function writeToken(uid: string, token: string, remindersEnabled: boolean): Promise<void> {
  const ref = firestore().doc(`users/${uid}`);
  const snapshot = await ref.get();
  const tokens = snapshot.data()?.fcmTokens;
  const existing = Array.isArray(tokens)
    ? tokens.filter((value): value is string => typeof value === 'string')
    : [];
  const update =
    existing.length > 10 || (existing.length === 10 && !existing.includes(token))
      ? { fcmTokens: nextFcmTokens(existing, token) }
      : { fcmTokens: firestore.FieldValue.arrayUnion(token) };
  await ref.update({ ...update, remindersEnabled });
}

function isReminderOn(data: Record<string, unknown> | undefined): boolean {
  const tokens = data?.fcmTokens;
  return data?.remindersEnabled === true && Array.isArray(tokens) && tokens.length > 0;
}

/** Asks for permission, then stores this device's token. Resolves false when permission is denied. */
export async function enableReminders(): Promise<boolean> {
  const uid = auth().currentUser?.uid;
  if (!uid) return false;
  if (!(await requestPermission())) return false;
  await writeToken(uid, await messaging().getToken(), true);
  return true;
}

export async function disableReminders(): Promise<void> {
  const uid = auth().currentUser?.uid;
  if (!uid) return;
  const ref = firestore().doc(`users/${uid}`);
  await ref.update({ remindersEnabled: false });
}

/**
 * Live `users/{uid}`. New profiles start with `remindersEnabled: true` and no tokens, so
 * the toggle counts as on only when the flag is true and a device token is stored.
 */
export function useReminderPreference(): { enabled: boolean; ready: boolean } {
  const [state, setState] = useState({ enabled: false, ready: false });
  useEffect(() => {
    const uid = auth().currentUser?.uid;
    if (!uid) return undefined;
    return firestore()
      .doc(`users/${uid}`)
      .onSnapshot(
        (snapshot) => setState({ enabled: isReminderOn(snapshot.data()), ready: true }),
        () => setState((current) => ({ ...current, ready: true })),
      );
  }, []);
  return state;
}

/** While signed in with reminders on, keeps the stored device token current. */
export function useReminderTokenSync(): void {
  useEffect(() => {
    let unsubscribeRefresh: (() => void) | undefined;
    const unsubscribeAuth = auth().onAuthStateChanged((user) => {
      unsubscribeRefresh?.();
      unsubscribeRefresh = undefined;
      if (!user) return;
      void firestore()
        .doc(`users/${user.uid}`)
        .get()
        .then((snapshot) => {
          if (snapshot.data()?.remindersEnabled !== true) return;
          unsubscribeRefresh = messaging().onTokenRefresh((token) => {
            void writeToken(user.uid, token, true).catch(() => undefined);
          });
        })
        .catch(() => undefined);
    });
    return () => {
      unsubscribeRefresh?.();
      unsubscribeAuth();
    };
  }, []);
}
