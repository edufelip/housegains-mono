import assert from 'node:assert/strict';
import test from 'node:test';
import { householdQueryWindow } from './household-query-window';

test('uses stable UTC day boundaries for the seven day instance window and seventy day ledger', () => {
  const window = householdQueryWindow(new Date('2026-11-15T23:59:59.999Z'));

  assert.equal(window.instanceFrom.toISOString(), '2026-11-08T00:00:00.000Z');
  assert.equal(window.instanceUntil.toISOString(), '2026-11-29T00:00:00.000Z');
  assert.equal(window.ledgerFrom.toISOString(), '2026-09-06T00:00:00.000Z');
});

test('keeps query bounds identical throughout a UTC day', () => {
  const before = householdQueryWindow(new Date('2026-11-15T00:00:00.001Z'));
  const after = householdQueryWindow(new Date('2026-11-15T23:59:59.999Z'));

  assert.deepEqual(after, before);
});
