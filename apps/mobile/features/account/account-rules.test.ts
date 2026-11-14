import assert from 'node:assert/strict';
import test from 'node:test';
import { accountErrorKey, legalUrl, reportReasonText, REPORT_NOTE_MAX } from './account-rules';
import { nextFcmTokens } from '../notifications/reminder-rules';

test('legal links resolve to housegains.app with a locale prefix outside English', () => {
  assert.equal(legalUrl('privacy', 'en-US', null), 'https://housegains.app/privacy');
  assert.equal(legalUrl('terms', 'pt-BR', null), 'https://housegains.app/pt-BR/terms');
  assert.equal(legalUrl('support', 'de-DE', '  '), 'https://housegains.app/de-DE/support');
  assert.equal(
    legalUrl('privacy', 'fr-FR', 'https://housegains.app/privacy'),
    'https://housegains.app/fr-FR/privacy',
  );
});

test('legal links keep a configured URL on another host unchanged', () => {
  assert.equal(
    legalUrl('terms', 'es-ES', 'https://example.org/terms'),
    'https://example.org/terms',
  );
});

test('FCM token list keeps the newest device token and drops the oldest past ten', () => {
  const existing = Array.from({ length: 10 }, (_, index) => `token-${index}`);
  const next = nextFcmTokens(existing, 'token-new');
  assert.equal(next.length, 10);
  assert.equal(next[9], 'token-new');
  assert.equal(next[0], 'token-1');
  assert.ok(!next.includes('token-0'));
});

test('FCM token list does not duplicate a token and ignores bad stored values', () => {
  assert.deepEqual(nextFcmTokens(['a', 7, 'b', 'a'], 'a'), ['b', 'a']);
  assert.deepEqual(nextFcmTokens(undefined, 'a'), ['a']);
  assert.deepEqual(nextFcmTokens('not-a-list', 'a'), ['a']);
});

test('callable and auth errors map to a localized message key', () => {
  assert.equal(
    accountErrorKey({ code: 'functions/permission-denied' }),
    'housegains.account.error.permissionDenied',
  );
  assert.equal(
    accountErrorKey({ code: 'functions/resource-exhausted' }),
    'housegains.account.error.resourceExhausted',
  );
  assert.equal(
    accountErrorKey({ code: 'auth/requires-recent-login' }),
    'housegains.account.error.unauthenticated',
  );
  assert.equal(
    accountErrorKey({ code: 'functions/unavailable' }),
    'housegains.account.error.network',
  );
  assert.equal(accountErrorKey({ code: 'functions/internal' }), 'housegains.account.error.generic');
  assert.equal(accountErrorKey(new Error('boom')), 'housegains.account.error.generic');
  assert.equal(accountErrorKey(null), 'housegains.account.error.generic');
});

test('report text keeps the reason and fits the 500 character limit with a note', () => {
  assert.equal(reportReasonText('spam', ''), 'spam');
  assert.equal(reportReasonText('spam', '  bad  '), 'spam: bad');
  const long = reportReasonText('offensive_name', 'x'.repeat(REPORT_NOTE_MAX));
  assert.ok(long.length <= REPORT_NOTE_MAX);
  assert.ok(long.startsWith('offensive_name: '));
});
