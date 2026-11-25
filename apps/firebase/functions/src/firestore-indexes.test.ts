import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Firestore emulator does not enforce indexes, so a query that works in every emulator
// test can still fail in production with FAILED_PRECONDITION. This file pins each
// production query's index requirement against firestore.indexes.json.
//
// A fieldOverrides entry REPLACES the automatic single-field indexes of that field, so a
// field with an override only supports the orders and scopes the override lists.

type Order = 'ASCENDING' | 'DESCENDING';
type Scope = 'COLLECTION' | 'COLLECTION_GROUP';

interface CompositeIndex {
  collectionGroup: string;
  queryScope: Scope;
  fields: { fieldPath: string; order: Order }[];
}

interface FieldOverride {
  collectionGroup: string;
  fieldPath: string;
  indexes: { queryScope: Scope; order: Order }[];
}

const config = JSON.parse(readFileSync(join(__dirname, '../../firestore.indexes.json'), 'utf8')) as {
  indexes: CompositeIndex[];
  fieldOverrides: FieldOverride[];
};

/** Whether a single-field query on `collectionGroup.fieldPath` is served in this order and scope. */
function singleFieldServed(collectionGroup: string, fieldPath: string, scope: Scope, order: Order): boolean {
  const override = config.fieldOverrides.find(
    (entry) => entry.collectionGroup === collectionGroup && entry.fieldPath === fieldPath,
  );
  if (override === undefined) return scope === 'COLLECTION'; // automatic indexes: collection scope, both orders
  return override.indexes.some((index) => index.queryScope === scope && index.order === order);
}

function compositeServed(collectionGroup: string, scope: Scope, fields: [string, Order][]): boolean {
  return config.indexes.some(
    (index) =>
      index.collectionGroup === collectionGroup &&
      index.queryScope === scope &&
      index.fields.length === fields.length &&
      index.fields.every((field, position) => field.fieldPath === fields[position][0] && field.order === fields[position][1]),
  );
}

describe('firestore.indexes.json', () => {
  it('serves the ascending createdAt range queries on households/*/ledger', () => {
    // scheduled.ts closeHouseholdWeekDoc, gamification/week-close.ts, gamification/reminders.ts:
    // where('createdAt', '>=', a).where('createdAt', '<', b)
    expect(singleFieldServed('ledger', 'createdAt', 'COLLECTION', 'ASCENDING')).toBe(true);
  });

  it('keeps the descending createdAt order (adminLookupUser, newest first)', () => {
    expect(singleFieldServed('ledger', 'createdAt', 'COLLECTION', 'DESCENDING')).toBe(true);
    expect(singleFieldServed('feed', 'createdAt', 'COLLECTION', 'DESCENDING')).toBe(true);
  });

  it('serves the instance dueAt range queries (week close, reminders)', () => {
    expect(singleFieldServed('instances', 'dueAt', 'COLLECTION', 'ASCENDING')).toBe(true);
  });

  it('has the composite indexes the new queries need', () => {
    // gamification/facts.ts recentSubtaskTimes: memberId ==, source ==, createdAt range
    expect(
      compositeServed('ledger', 'COLLECTION', [
        ['memberId', 'ASCENDING'],
        ['source', 'ASCENDING'],
        ['createdAt', 'ASCENDING'],
      ]),
    ).toBe(true);
    // admin-gamification/simulate.ts: collectionGroup('ledger') source in [...], createdAt >=, orderBy createdAt
    expect(
      compositeServed('ledger', 'COLLECTION_GROUP', [
        ['source', 'ASCENDING'],
        ['createdAt', 'ASCENDING'],
      ]),
    ).toBe(true);
    // scheduled.ts expireDisputes: status ==, expiresAt <
    expect(
      compositeServed('disputes', 'COLLECTION', [
        ['status', 'ASCENDING'],
        ['expiresAt', 'ASCENDING'],
      ]),
    ).toBe(true);
    // scheduled.ts runReminders: collectionGroup('instances') status ==, dueAt range
    expect(
      compositeServed('instances', 'COLLECTION_GROUP', [
        ['status', 'ASCENDING'],
        ['dueAt', 'ASCENDING'],
      ]),
    ).toBe(true);
  });

  it('declares no override that leaves a field without a usable single-field index', () => {
    for (const override of config.fieldOverrides) {
      expect(override.indexes.length, `${override.collectionGroup}.${override.fieldPath}`).toBeGreaterThan(0);
    }
  });
});
