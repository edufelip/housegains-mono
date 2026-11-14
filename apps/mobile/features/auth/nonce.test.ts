import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createRawNonce, hashNonce } from './nonce';

const sha256Hex = async (value: string) => createHash('sha256').update(value).digest('hex');

test('the raw nonce is the UUID without dashes', () => {
  assert.equal(
    createRawNonce('3f2b8c1e-9a4d-4e7b-8f6a-1c2d3e4f5a6b'),
    '3f2b8c1e9a4d4e7b8f6a1c2d3e4f5a6b',
  );
});

test('Apple receives the SHA-256 hex of the raw nonce', async () => {
  // SHA-256("abc") is a published test vector.
  assert.equal(
    await hashNonce('abc', sha256Hex),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});
