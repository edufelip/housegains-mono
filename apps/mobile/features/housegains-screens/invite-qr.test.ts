import assert from 'node:assert/strict';
import test from 'node:test';
import { createInviteQr } from './invite-qr';

test('creates a version 2 QR matrix for an invite deep link', () => {
  const { matrix, payload } = createInviteQr('HG7K2P');

  assert.equal(payload, 'https://housegains.app/j/HG7K2P');
  assert.equal(matrix.length, 25);
  assert.ok(matrix.every((row) => row.length === 25));
  assert.deepEqual(matrix[0].slice(0, 7), [true, true, true, true, true, true, true]);
  assert.equal(matrix[3][3], true);
  assert.equal(matrix[1][1], false);
  assert.equal(matrix[17][8], true);
});

test('rejects invite codes outside the contract alphabet', () => {
  assert.throws(() => createInviteQr('HGI02P'), /invalid invite code/i);
});
