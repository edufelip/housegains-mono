// Pure mapping from sign-in failures to translation keys. Shown inline on the sign-in screen.

/** Our own code for a Google sign-in the user dismissed. Apple uses ERR_REQUEST_CANCELED. */
export const SIGN_IN_CANCELLED_CODE = 'cancelled';
const CANCEL_CODES = new Set([SIGN_IN_CANCELLED_CODE, 'ERR_REQUEST_CANCELED']);

const KEY_BY_CODE: Record<string, string> = {
  'auth/invalid-credential': 'housegains.auth.error.invalidCredential',
  'auth/wrong-password': 'housegains.auth.error.invalidCredential',
  'auth/user-not-found': 'housegains.auth.error.invalidCredential',
  'auth/email-already-in-use': 'housegains.auth.error.emailInUse',
  'auth/weak-password': 'housegains.auth.error.weakPassword',
  'auth/invalid-email': 'housegains.auth.validation.email',
  'auth/network-request-failed': 'housegains.auth.error.network',
  'functions/unavailable': 'housegains.auth.error.network',
  'auth/too-many-requests': 'housegains.auth.error.tooManyRequests',
};

/** Returns the message key, or null when the user simply cancelled (show nothing). */
export function authErrorKey(error: unknown): string | null {
  const code = String((error as { code?: unknown } | null | undefined)?.code ?? '');
  if (CANCEL_CODES.has(code)) return null;
  return KEY_BY_CODE[code] ?? 'housegains.auth.error.generic';
}
