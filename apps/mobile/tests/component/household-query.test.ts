import { subscribeToHousehold } from '@/features/household/firebase-household-client';

const fake = (globalThis as unknown as { mockFirebase: any }).mockFirebase;

beforeEach(() => {
  fake.queries = [];
});

it('orders the ledger descending and uses midnight-rounded bounded date filters', () => {
  subscribeToHousehold(
    'home-1',
    () => undefined,
    () => undefined,
  );

  const ledgerFilters = fake.queries.filter(
    ({ path, op }: { path: string; op: string }) =>
      path === 'households/home-1/ledger' && op === 'where',
  );
  const ledgerOrder = fake.queries.find(
    ({ path, op }: { path: string; op: string }) =>
      path === 'households/home-1/ledger' && op === 'orderBy',
  );
  const instanceFilters = fake.queries.filter(
    ({ path, op }: { path: string; op: string }) =>
      path === 'households/home-1/instances' && op === 'where',
  );

  expect(ledgerOrder?.args).toEqual(['createdAt', 'desc']);
  const ledgerFrom = ledgerFilters[0]?.args[2] as Date;
  expect(ledgerFrom.toISOString()).toMatch(/T00:00:00\.000Z$/);
  expect(instanceFilters.map(({ args }: { args: unknown[] }) => args[0])).toEqual([
    'dueAt',
    'dueAt',
  ]);
  const from = instanceFilters[0]?.args[2] as Date;
  const until = instanceFilters[1]?.args[2] as Date;
  const today = new Date();
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  expect(from.getTime()).toBe(midnight - 7 * 24 * 60 * 60 * 1000);
  expect(until.getTime()).toBe(midnight + 14 * 24 * 60 * 60 * 1000);
});
