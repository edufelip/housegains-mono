import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapInboxCelebration,
  mapLedgerRow,
  mapOrganizer,
  mapWallet,
  parseCelebration,
  parseCelebrations,
} from './gamification-mapping';

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

test('parseCelebration keeps every contract field and drops unknown ones', () => {
  const parsed = parseCelebration({
    id: 'cel:toast:row1:uidA',
    moment: 'toast',
    track: 'ganhos',
    amount: 25,
    parts: [
      { ruleId: 'earn.subtask', amount: 20 },
      { ruleId: 'earn.assist', amount: 5 },
    ],
    copyKey: 'gami.earn.chore',
    extra: 'ignored',
  });
  assert.deepEqual(parsed, {
    id: 'cel:toast:row1:uidA',
    moment: 'toast',
    track: 'ganhos',
    amount: 25,
    parts: [
      { ruleId: 'earn.subtask', amount: 20 },
      { ruleId: 'earn.assist', amount: 5 },
    ],
    copyKey: 'gami.earn.chore',
  });
});

test('parseCelebration reads badge, level and streak fields', () => {
  assert.deepEqual(
    parseCelebration({
      id: 'cel:badge:helper:silver:uidA',
      moment: 'badge',
      track: 'ganhos',
      amount: 50,
      copyKey: 'gami.achievement.unlocked',
      achievementId: 'helper',
      tier: 'silver',
      fullScreen: true,
    }),
    {
      id: 'cel:badge:helper:silver:uidA',
      moment: 'badge',
      track: 'ganhos',
      amount: 50,
      copyKey: 'gami.achievement.unlocked',
      achievementId: 'helper',
      tier: 'silver',
      fullScreen: true,
    },
  );
  assert.deepEqual(
    parseCelebration({
      id: 'cel:level:7:uidA',
      moment: 'level',
      track: 'ganhos',
      level: 7,
      copyKey: 'gami.level.up',
    })?.level,
    7,
  );
  assert.deepEqual(
    parseCelebration({
      id: 'cel:streak:2026-11-16:4:uidA',
      moment: 'streak',
      track: 'ganhos',
      amount: 50,
      copyKey: 'gami.streak.milestone',
      data: { milestone: 4, bad: { nested: true } },
    })?.data,
    { milestone: 4 },
  );
});

test('parseCelebration rejects malformed celebrations', () => {
  assert.equal(parseCelebration(null), null);
  assert.equal(parseCelebration('x'), null);
  assert.equal(parseCelebration({ moment: 'toast', track: 'ganhos', copyKey: 'k' }), null);
  assert.equal(parseCelebration({ id: 'a', moment: 'party', track: 'ganhos', copyKey: 'k' }), null);
  assert.equal(parseCelebration({ id: 'a', moment: 'toast', track: 'xp', copyKey: 'k' }), null);
  assert.equal(parseCelebration({ id: 'a', moment: 'toast', track: 'ganhos' }), null);
  // an unknown tier is dropped, the celebration stays
  assert.equal(
    parseCelebration({
      id: 'a',
      moment: 'badge',
      track: 'ganhos',
      copyKey: 'k',
      achievementId: 'helper',
      tier: 'platinum',
    })?.tier,
    undefined,
  );
});

test('parseCelebrations tolerates a missing field and filters invalid entries', () => {
  assert.deepEqual(parseCelebrations(undefined), []);
  assert.deepEqual(parseCelebrations({}), []);
  assert.deepEqual(
    parseCelebrations({
      celebrations: [
        { id: 'a', moment: 'toast', track: 'ganhos', copyKey: 'k', amount: 3 },
        { nope: true },
      ],
    }).map((c) => c.id),
    ['a'],
  );
  assert.deepEqual(parseCelebrations({ celebrations: 'x' }), []);
});

test('mapInboxCelebration adds seen and createdAt', () => {
  const row = mapInboxCelebration('cel:level:3:uidA', {
    id: 'cel:level:3:uidA',
    moment: 'level',
    track: 'ganhos',
    level: 3,
    copyKey: 'gami.level.up',
    seen: false,
    createdAt: ts('2026-11-24T10:00:00.000Z'),
  });
  assert.equal(row?.seen, false);
  assert.equal(row?.createdAt, '2026-11-24T10:00:00.000Z');
  // the document id is authoritative when the body has none
  const noBody = mapInboxCelebration('cel:toast:x', {
    moment: 'toast',
    track: 'zelo',
    copyKey: 'gami.zelo.earned',
    amount: 5,
    seen: true,
  });
  assert.equal(noBody?.id, 'cel:toast:x');
  assert.equal(noBody?.seen, true);
  assert.equal(mapInboxCelebration('x', { garbage: 1 }), null);
});

test('mapWallet tolerates a wallet written only by setAwayWeeks', () => {
  const wallet = mapWallet({ streak: { awayWeeks: ['2026-12-07'] } });
  assert.equal(wallet.balance, 0);
  assert.equal(wallet.level, 1);
  assert.deepEqual(wallet.streak.awayWeeks, ['2026-12-07']);
  assert.deepEqual(wallet.achievements, {});
  assert.deepEqual(wallet.recentWeeks, []);
  assert.equal(wallet.nextSpendableAt, null);
});

test('mapWallet maps the full projection', () => {
  const wallet = mapWallet({
    householdId: 'h1',
    memberId: 'uidA',
    balance: 120,
    lifetimeEarned: 340,
    pendingBalance: 30,
    nextSpendableAt: ts('2026-11-25T08:00:00.000Z'),
    level: 4,
    xpPeak: 1000,
    streak: {
      current: 5,
      record: 9,
      lastCountedWeek: '2026-11-16',
      lastActionWeek: '2026-11-16',
      folgas: 1,
      folgaProgress: 2,
      awayWeeks: ['2026-12-07'],
    },
    achievements: {
      helper: { tier: 'silver', unlockedAt: ts('2026-11-01T10:00:00.000Z') },
      fit: { tier: 'bronze', unlockedAt: ts('2026-11-02T10:00:00.000Z'), active: false },
      broken: { tier: 'platinum', unlockedAt: ts('2026-11-02T10:00:00.000Z') },
      noDate: { tier: 'gold' },
    },
    stats: {
      recentWeeks: [
        { weekStart: '2026-11-09', counted: true, xp: 80 },
        { weekStart: '2026-11-16', counted: false, xp: 10 },
        'bad',
      ],
    },
    updatedAt: ts('2026-11-24T10:00:00.000Z'),
  });
  assert.equal(wallet.householdId, 'h1');
  assert.equal(wallet.pendingBalance, 30);
  assert.equal(wallet.nextSpendableAt, '2026-11-25T08:00:00.000Z');
  assert.equal(wallet.streak.record, 9);
  assert.deepEqual(Object.keys(wallet.achievements).sort(), ['fit', 'helper']);
  assert.equal(wallet.achievements.helper.tier, 'silver');
  assert.equal(wallet.achievements.fit.active, false);
  assert.equal(wallet.recentWeeks.length, 2);
  assert.equal(wallet.recentWeeks[0].weekStart, '2026-11-09');
});

test('mapLedgerRow maps rows with optional reversal fields', () => {
  assert.deepEqual(
    mapLedgerRow('earn.subtask:inst|row:uidA', {
      key: 'earn.subtask:inst|row:uidA',
      ruleId: 'earn.subtask',
      track: 'ganhos',
      amount: 20,
      sourceRef: 'inst|row',
      createdAt: ts('2026-11-24T10:00:00.000Z'),
      spendableAt: ts('2026-11-25T10:00:00.000Z'),
    }),
    {
      key: 'earn.subtask:inst|row:uidA',
      ruleId: 'earn.subtask',
      track: 'ganhos',
      amount: 20,
      sourceRef: 'inst|row',
      createdAt: '2026-11-24T10:00:00.000Z',
      spendableAt: '2026-11-25T10:00:00.000Z',
    },
  );
  const reversal = mapLedgerRow('rev:earn.subtask:x', {
    ruleId: 'earn.subtask',
    amount: -20,
    sourceRef: 'x',
    reversesEntryId: 'earn.subtask:x',
    reason: 'undo',
    createdAt: ts('2026-11-24T11:00:00.000Z'),
  });
  assert.equal(reversal.amount, -20);
  assert.equal(reversal.reversesEntryId, 'earn.subtask:x');
  assert.equal(reversal.reason, 'undo');
  assert.equal(reversal.track, 'ganhos');
});

test('mapOrganizer maps zelo, streak and achievements', () => {
  const organizer = mapOrganizer('creatorUid', {
    zelo: 230,
    lifetimeZelo: 300,
    level: 2,
    streak: { current: 3, record: 4, folgas: 1, folgaProgress: 0 },
    achievements: { host: { tier: 'bronze', unlockedAt: ts('2026-11-01T00:00:00.000Z') } },
    stats: {
      orderWeeks: [
        { weekStart: '2026-11-16', due: 10, onTime: 8 },
        { weekStart: '2026-11-09', due: 5, onTime: 5 },
        { nope: true },
      ],
    },
  });
  assert.deepEqual(organizer.orderWeeks, [
    { weekStart: '2026-11-09', due: 5, onTime: 5 },
    { weekStart: '2026-11-16', due: 10, onTime: 8 },
  ]);
  assert.equal(organizer.memberId, 'creatorUid');
  assert.equal(organizer.zelo, 230);
  assert.equal(organizer.streak.current, 3);
  assert.equal(organizer.achievements.host.tier, 'bronze');
  assert.equal(mapOrganizer('c', {}).zelo, 0);
  assert.deepEqual(mapOrganizer('c', {}).orderWeeks, []);
});
