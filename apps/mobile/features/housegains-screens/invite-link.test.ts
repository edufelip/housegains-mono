import assert from 'node:assert/strict';
import test from 'node:test';
import { extractInviteCode } from './invite-link';

test('extracts a valid code from raw values and HouseGains invite links', () => {
  assert.equal(extractInviteCode('HG7K2P'), 'HG7K2P');
  assert.equal(extractInviteCode('https://housegains.app/j/HG7K2P?source=qr'), 'HG7K2P');
  assert.equal(extractInviteCode('https://housegains.app/join/HG7K2P'), 'HG7K2P');
});

test('rejects malformed invite codes and unrelated QR payloads', () => {
  assert.equal(extractInviteCode('HGI02P'), null);
  assert.equal(extractInviteCode('https://example.com/j/HG7K2P'), null);
  assert.equal(extractInviteCode(''), null);
});
