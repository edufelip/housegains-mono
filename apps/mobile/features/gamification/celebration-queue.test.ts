import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INBOX_STALE_MS,
  initialQueueState,
  queueReducer,
  type QueueAction,
  type QueueState,
} from './celebration-queue';
import type { Celebration } from './types';

const NOW = Date.parse('2026-11-24T12:00:00.000Z');

const toast = (id: string, amount = 10): Celebration => ({
  id,
  moment: 'toast',
  track: 'ganhos',
  amount,
  copyKey: 'gami.earn.chore',
});
const badge = (
  id: string,
  tier: 'bronze' | 'silver' | 'gold',
  fullScreen: boolean,
): Celebration => ({
  id,
  moment: 'badge',
  track: 'ganhos',
  achievementId: 'helper',
  tier,
  amount: 50,
  copyKey: 'gami.achievement.unlocked',
  fullScreen,
});
const level = (id: string, value: number): Celebration => ({
  id,
  moment: 'level',
  track: 'ganhos',
  level: value,
  copyKey: 'gami.level.up',
});

function run(actions: QueueAction[], from: QueueState = initialQueueState): QueueState {
  return actions.reduce(queueReducer, from);
}
const receive = (
  celebrations: Celebration[],
  extra: Partial<Extract<QueueAction, { type: 'receive' }>> = {},
): QueueAction => ({ type: 'receive', celebrations, source: 'callable', now: NOW, ...extra });

test('shows the first celebration and queues the rest in order', () => {
  const state = run([receive([toast('a'), toast('b'), toast('c')])]);
  assert.equal(state.active?.celebration.id, 'a');
  assert.deepEqual(
    state.pending.map((item) => item.celebration.id),
    ['b', 'c'],
  );
});

test('dedupes by id, including ids already shown', () => {
  let state = run([receive([toast('a'), toast('a')])]);
  assert.equal(state.pending.length, 0);
  state = run([{ type: 'dismiss', id: 'a' }, receive([toast('a')])], state);
  assert.equal(state.active, null);
  assert.equal(state.pending.length, 0);
});

test('toasts are shown one after another as each is dismissed', () => {
  let state = run([receive([toast('a'), toast('b')])]);
  state = queueReducer(state, { type: 'dismiss', id: 'a' });
  assert.equal(state.active?.celebration.id, 'b');
  state = queueReducer(state, { type: 'dismiss', id: 'b' });
  assert.equal(state.active, null);
});

test('dismissing an id that is not active is ignored', () => {
  const state = run([receive([toast('a')]), { type: 'dismiss', id: 'zzz' }]);
  assert.equal(state.active?.celebration.id, 'a');
});

test('a silver/gold badge is a full-screen unlock, once per session', () => {
  let state = run([receive([badge('cel:badge:helper:silver:u', 'silver', true)])]);
  assert.equal(state.active?.kind, 'unlock');
  assert.equal(state.fullScreenUsed, true);
  state = queueReducer(state, { type: 'dismiss', id: 'cel:badge:helper:silver:u' });
  // a later full-screen badge becomes a toast
  state = queueReducer(state, receive([badge('cel:badge:closer:gold:u', 'gold', true)]));
  assert.equal(state.active?.kind, 'toast');
  assert.equal(state.active?.celebration.id, 'cel:badge:closer:gold:u');
});

test('a bronze badge (fullScreen false) is always a toast and keeps the session slot free', () => {
  let state = run([receive([badge('b1', 'bronze', false)])]);
  assert.equal(state.active?.kind, 'toast');
  assert.equal(state.fullScreenUsed, false);
  state = run([{ type: 'dismiss', id: 'b1' }, receive([badge('g1', 'gold', true)])], state);
  assert.equal(state.active?.kind, 'unlock');
});

test('two full-screen badges arriving together: first is full-screen, second is a toast after it', () => {
  let state = run([receive([badge('g1', 'gold', true), badge('g2', 'silver', true)])]);
  assert.equal(state.active?.kind, 'unlock');
  assert.equal(state.active?.celebration.id, 'g1');
  state = queueReducer(state, { type: 'dismiss', id: 'g1' });
  assert.equal(state.active?.kind, 'toast');
  assert.equal(state.active?.celebration.id, 'g2');
});

test('level and streak moments get their own presentation and never take the full-screen slot', () => {
  const streak: Celebration = {
    id: 's1',
    moment: 'streak',
    track: 'ganhos',
    amount: 50,
    copyKey: 'gami.streak.milestone',
    data: { milestone: 4 },
  };
  let state = run([receive([level('l1', 7), streak])]);
  assert.equal(state.active?.kind, 'level');
  state = queueReducer(state, { type: 'dismiss', id: 'l1' });
  assert.equal(state.active?.kind, 'streak');
  assert.equal(state.fullScreenUsed, false);
});

test('a standings moment is shown as a toast', () => {
  const standings: Celebration = {
    id: 'st',
    moment: 'standings',
    track: 'ganhos',
    copyKey: 'gami.standings',
  };
  assert.equal(run([receive([standings])]).active?.kind, 'toast');
});

test('a badge earned by the action that completed the instance folds into S3', () => {
  const folded = badge('cel:badge:closer:silver:u', 'silver', true);
  const state = run([
    receive([toast('t1', 30), folded], {
      completion: { instanceId: 'inst-1', completesInstance: true },
    }),
  ]);
  // the toast still shows; the badge is held for the celebration screen
  assert.equal(state.active?.celebration.id, 't1');
  assert.deepEqual(state.pending, []);
  assert.deepEqual(
    state.completionBadges['inst-1'].map((c) => c.id),
    ['cel:badge:closer:silver:u'],
  );
  // folding does not consume the session's full-screen slot
  assert.equal(state.fullScreenUsed, false);
});

test('a badge folds regardless of tier, but toasts, level and streak do not', () => {
  const state = run([
    receive([badge('b1', 'bronze', false), level('l1', 3), toast('t1')], {
      completion: { instanceId: 'inst-1', completesInstance: true },
    }),
  ]);
  assert.deepEqual(
    state.completionBadges['inst-1'].map((c) => c.id),
    ['b1'],
  );
  assert.equal(state.active?.celebration.id, 'l1');
  assert.deepEqual(
    state.pending.map((item) => item.celebration.id),
    ['t1'],
  );
});

test('without completesInstance a badge is a normal full-screen unlock', () => {
  const state = run([
    receive([badge('g1', 'gold', true)], {
      completion: { instanceId: 'inst-1', completesInstance: false },
    }),
  ]);
  assert.equal(state.active?.kind, 'unlock');
  assert.deepEqual(state.completionBadges, {});
});

test('inbox badges are never folded', () => {
  const state = run([
    receive([badge('g1', 'gold', true)], {
      source: 'inbox',
      completion: { instanceId: 'inst-1', completesInstance: true },
    }),
  ]);
  assert.equal(state.active?.kind, 'unlock');
});

test('consumeCompletionBadges drops the folded badges of an instance', () => {
  let state = run([
    receive([badge('b1', 'silver', true)], {
      completion: { instanceId: 'inst-1', completesInstance: true },
    }),
  ]);
  state = queueReducer(state, { type: 'consumeCompletionBadges', instanceId: 'inst-1' });
  assert.deepEqual(state.completionBadges, {});
});

test('inbox rows are acknowledged only after they were shown', () => {
  let state = run([receive([toast('i1'), toast('i2')], { source: 'inbox' })]);
  assert.deepEqual(state.toAck, []);
  state = queueReducer(state, { type: 'dismiss', id: 'i1' });
  assert.deepEqual(state.toAck, ['i1']);
  state = queueReducer(state, { type: 'acked', ids: ['i1'] });
  assert.deepEqual(state.toAck, []);
  state = queueReducer(state, { type: 'dismiss', id: 'i2' });
  assert.deepEqual(state.toAck, ['i2']);
});

test('callable celebrations are not acknowledged', () => {
  const state = run([receive([toast('c1')]), { type: 'dismiss', id: 'c1' }]);
  assert.deepEqual(state.toAck, []);
});

test('an inbox row for a celebration already shown from a callable response is acknowledged at once', () => {
  let state = run([receive([toast('x')]), { type: 'dismiss', id: 'x' }]);
  state = queueReducer(state, receive([toast('x')], { source: 'inbox' }));
  assert.deepEqual(state.toAck, ['x']);
  assert.equal(state.active, null);
});

test('an inbox row for a celebration still waiting from a callable response is acknowledged once shown', () => {
  let state = run([receive([toast('a'), toast('x')])]);
  state = queueReducer(state, receive([toast('x')], { source: 'inbox' }));
  assert.deepEqual(state.toAck, []);
  state = run(
    [
      { type: 'dismiss', id: 'a' },
      { type: 'dismiss', id: 'x' },
    ],
    state,
  );
  assert.deepEqual(state.toAck, ['x']);
});

test('stale inbox rows are acknowledged without being shown', () => {
  const old = new Date(NOW - INBOX_STALE_MS - 1000).toISOString();
  const state = run([receive([toast('old')], { source: 'inbox', createdAt: { old } })]);
  assert.equal(state.active, null);
  assert.deepEqual(state.toAck, ['old']);
});

test('an acknowledged inbox id that comes back (listener lag) is not shown again', () => {
  let state = run([receive([toast('i1')], { source: 'inbox' }), { type: 'dismiss', id: 'i1' }]);
  state = run([{ type: 'acked', ids: ['i1'] }, receive([toast('i1')], { source: 'inbox' })], state);
  assert.equal(state.active, null);
  assert.deepEqual(state.toAck, ['i1']);
});

test('reset clears the queue but keeps the session full-screen slot', () => {
  let state = run([receive([badge('g1', 'gold', true), toast('t1')])]);
  state = queueReducer(state, { type: 'reset' });
  assert.equal(state.active, null);
  assert.deepEqual(state.pending, []);
  assert.equal(state.fullScreenUsed, true);
  assert.deepEqual(state.known, []);
});
