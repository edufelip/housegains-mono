import { FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { db } from './admin';

// Shared FCM path (same approach as scheduled.ts): localized copy per user,
// remindersEnabled !== false, dead tokens dropped. A failure is logged and never
// fails the callable that triggered the push.

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export async function pushToMembers(input: {
  uids: string[];
  title: string;
  bodyFor: (locale: unknown) => string;
}): Promise<void> {
  await Promise.all(
    input.uids.map(async (uid) => {
      const userRef = db().collection('users').doc(uid);
      try {
        const profile = (await userRef.get()).data();
        if (!profile || profile.remindersEnabled === false) return;
        const tokens = ((profile.fcmTokens as unknown[] | undefined) ?? []).filter(
          (token): token is string => typeof token === 'string',
        );
        if (tokens.length === 0) return;
        const response = await getMessaging().sendEachForMulticast({
          tokens,
          notification: { title: input.title, body: input.bodyFor(profile.locale) },
        });
        const dead = response.responses.flatMap((result, index) =>
          !result.success && DEAD_TOKEN_CODES.has(result.error?.code ?? '') ? [tokens[index]] : [],
        );
        if (dead.length > 0) await userRef.update({ fcmTokens: FieldValue.arrayRemove(...dead) });
      } catch (error) {
        console.error('pushToMembers failed', uid, error);
      }
    }),
  );
}
