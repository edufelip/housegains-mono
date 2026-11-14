import assert from 'node:assert/strict';
import test from 'node:test';
import { authErrorKey } from './auth-errors';

test('a dismissed Apple or Google sign-in shows no message', () => {
  assert.equal(authErrorKey({ code: 'ERR_REQUEST_CANCELED' }), null);
  assert.equal(authErrorKey({ code: 'cancelled' }), null);
});

test('known Firebase auth codes map to their message keys', () => {
  assert.equal(
    authErrorKey({ code: 'auth/invalid-credential' }),
    'housegains.auth.error.invalidCredential',
  );
  assert.equal(
    authErrorKey({ code: 'auth/email-already-in-use' }),
    'housegains.auth.error.emailInUse',
  );
  assert.equal(authErrorKey({ code: 'auth/weak-password' }), 'housegains.auth.error.weakPassword');
  assert.equal(
    authErrorKey({ code: 'auth/network-request-failed' }),
    'housegains.auth.error.network',
  );
  assert.equal(
    authErrorKey({ code: 'auth/too-many-requests' }),
    'housegains.auth.error.tooManyRequests',
  );
  assert.equal(authErrorKey({ code: 'auth/invalid-email' }), 'housegains.auth.validation.email');
});

test('unknown, missing or code-less errors fall back to the generic message', () => {
  assert.equal(authErrorKey({ code: 'auth/something-new' }), 'housegains.auth.error.generic');
  assert.equal(authErrorKey(new Error('boom')), 'housegains.auth.error.generic');
  assert.equal(authErrorKey(undefined), 'housegains.auth.error.generic');
});
