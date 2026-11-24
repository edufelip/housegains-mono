import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canModerateInstance,
  canReportCompletion,
  hasAdminRights,
  hasModerationConflict,
  isPartialSelection,
  isWithinReviewWindow,
  moderatableSubtasks,
  partialAvailable,
  partialModerationAvailable,
  reportableSubtasks,
  selectableForModeration,
  soleAdminOf,
} from './moderation-rules';
import type { Dispute, Instance, Member } from './types';

const NOW = Date.parse('2026-11-24T12:00:00.000Z');
const IN_WINDOW = '2026-11-23T12:00:00.000Z'; // 24 h before NOW
const OUT_OF_WINDOW = '2026-11-20T12:00:00.000Z'; // 96 h before NOW

const member = (id: string, role: Member['role'] = 'member'): Member => ({
  id,
  name: id,
  initials: id.slice(0, 2).toUpperCase(),
  color: '#7c5cff',
  role,
});

const members = [
  member('edu', 'creator'),
  member('bia'),
  member('rafa', 'admin'),
  member('ana', 'admin'),
];

function completion(
  subtaskId: string,
  memberId: string,
  completedAt: string,
): Instance['completions'][number] {
  return {
    id: `c-${subtaskId}`,
    instanceId: 'inst-1',
    subtaskId,
    memberId,
    xp: 10,
    completedAt,
    isAssist: false,
  };
}

function instance(completions: Instance['completions']): Instance {
  return {
    id: 'inst-1',
    choreId: 'chore-1',
    dueAt: '2026-11-24T21:00:00.000Z',
    subtasks: [
      { id: 'feed', name: 'Feed', xp: 10, position: 0 },
      { id: 'walk', name: 'Walk', xp: 20, position: 1 },
      { id: 'paws', name: 'Wash paws', xp: 15, position: 2 },
    ],
    bonusXp: 0,
    assigneeIds: [],
    status: 'partial',
    completions,
    bonusAwards: {},
  };
}

test('hasAdminRights covers creator and admin only', () => {
  assert.equal(hasAdminRights('creator'), true);
  assert.equal(hasAdminRights('admin'), true);
  assert.equal(hasAdminRights('member'), false);
});

test('isWithinReviewWindow holds for 72 hours and closes after', () => {
  assert.equal(isWithinReviewWindow(completion('feed', 'bia', IN_WINDOW), NOW), true);
  const edge = new Date(NOW - 72 * 60 * 60 * 1000).toISOString();
  assert.equal(isWithinReviewWindow(completion('feed', 'bia', edge), NOW), true);
  assert.equal(isWithinReviewWindow(completion('feed', 'bia', OUT_OF_WINDOW), NOW), false);
  assert.equal(isWithinReviewWindow(completion('feed', 'bia', ''), NOW), false);
});

test('reportableSubtasks keeps only others’ in-window completions', () => {
  const instanceOne = instance([
    completion('feed', 'bia', IN_WINDOW),
    completion('walk', 'rafa', IN_WINDOW),
    completion('paws', 'ana', OUT_OF_WINDOW),
  ]);
  assert.deepEqual(reportableSubtasks(instanceOne, 'rafa', NOW), ['feed']);
  assert.deepEqual(reportableSubtasks(instanceOne, 'edu', NOW), ['feed', 'walk']);
  assert.deepEqual(reportableSubtasks(instance([]), 'edu', NOW), []);
});

test('canReportCompletion follows the contract guards', () => {
  const base = instance([completion('feed', 'bia', IN_WINDOW)]);
  const openDispute: Dispute = {
    id: 'inst-1',
    instanceId: 'inst-1',
    choreName: 'Dog care',
    status: 'open',
    subtaskIds: ['feed'],
    completerIds: ['bia'],
    reports: [{ uid: 'rafa', subtaskIds: ['feed'], reason: '', createdAt: IN_WINDOW }],
    createdAt: IN_WINDOW,
    expiresAt: '2026-11-26T12:00:00.000Z',
  };

  assert.equal(canReportCompletion(member('rafa'), base, openDispute, NOW), false);
  assert.equal(canReportCompletion(member('rafa'), base, undefined, NOW), true);
  // Admins and the creator mark completions directly instead of reporting.
  assert.equal(canReportCompletion(member('edu', 'creator'), base, undefined, NOW), false);
  assert.equal(canReportCompletion(member('bia', 'admin'), base, undefined, NOW), false);
  // A resolved or expired dispute can no longer be reported.
  assert.equal(
    canReportCompletion(member('rafa'), { ...base, disputeStatus: 'resolved' }, openDispute, NOW),
    false,
  );
  assert.equal(
    canReportCompletion(member('rafa'), { ...base, disputeStatus: 'expired' }, openDispute, NOW),
    false,
  );
  // Another member may still add their own report to the open dispute.
  assert.equal(canReportCompletion(member('ana'), base, openDispute, NOW), true);
  // The instance's own completions by the caller are not reportable.
  const own = instance([completion('feed', 'rafa', IN_WINDOW)]);
  assert.equal(canReportCompletion(member('rafa'), own, undefined, NOW), false);
  // Out-of-window completions are not reportable.
  const stale = instance([completion('feed', 'bia', OUT_OF_WINDOW)]);
  assert.equal(canReportCompletion(member('rafa'), stale, undefined, NOW), false);
});

test('moderatableSubtasks and canModerateInstance use the window and admin rights', () => {
  const instanceOne = instance([
    completion('feed', 'bia', IN_WINDOW),
    completion('walk', 'rafa', OUT_OF_WINDOW),
  ]);
  assert.deepEqual(moderatableSubtasks(instanceOne, NOW), ['feed']);
  assert.equal(canModerateInstance(member('edu', 'creator'), instanceOne, NOW), true);
  assert.equal(canModerateInstance(member('rafa', 'admin'), instanceOne, NOW), true);
  assert.equal(canModerateInstance(member('bia'), instanceOne, NOW), false);
  assert.equal(canModerateInstance(member('edu', 'creator'), instance([]), NOW), false);
});

test('hasModerationConflict only blocks non-sole admins who completed a target', () => {
  const instanceOne = instance([
    completion('feed', 'edu', IN_WINDOW),
    completion('walk', 'bia', IN_WINDOW),
  ]);
  // Creator completed 'feed' but is not the sole admin (rafa and ana are admins too).
  assert.equal(hasModerationConflict(instanceOne, ['feed'], 'edu', members), true);
  assert.equal(hasModerationConflict(instanceOne, ['walk'], 'edu', members), false);
  // A sole admin may review their own completion.
  const soleAdminHousehold = [member('edu', 'creator'), member('bia')];
  assert.equal(hasModerationConflict(instanceOne, ['feed'], 'edu', soleAdminHousehold), false);
});

test('soleAdminOf counts creator and admins', () => {
  assert.equal(soleAdminOf(members), false);
  assert.equal(soleAdminOf([member('edu', 'creator'), member('bia')]), true);
  assert.equal(soleAdminOf([member('edu', 'creator'), member('bia', 'admin')]), false);
});

test('partialAvailable hides partial verdicts for a single subtask', () => {
  assert.equal(partialAvailable(1), false);
  assert.equal(partialAvailable(2), true);
  assert.equal(partialAvailable(3), true);
});

test('isPartialSelection requires a non-empty strict subset of the pool', () => {
  const pool = ['feed', 'walk', 'paws'];
  assert.equal(isPartialSelection([], pool), false);
  assert.equal(isPartialSelection(['feed'], pool), true);
  assert.equal(isPartialSelection(['feed', 'walk'], pool), true);
  assert.equal(isPartialSelection(pool, pool), false);
  assert.equal(isPartialSelection(['feed', 'walk', 'paws'], pool), false);
  assert.equal(isPartialSelection(['feed', 'unknown'], pool), false);
});

test('selectableForModeration drops the caller’s own completions unless they are the sole admin', () => {
  const instanceOne = instance([
    completion('feed', 'edu', IN_WINDOW),
    completion('walk', 'bia', IN_WINDOW),
  ]);
  assert.deepEqual(selectableForModeration(instanceOne, ['feed', 'walk'], 'edu', members), [
    'walk',
  ]);
  const soleAdminHousehold = [member('edu', 'creator'), member('bia')];
  assert.deepEqual(
    selectableForModeration(instanceOne, ['feed', 'walk'], 'edu', soleAdminHousehold),
    ['feed', 'walk'],
  );
});

test('partialModerationAvailable counts only selectable steps and keeps one step done', () => {
  assert.equal(partialModerationAvailable([], ['feed', 'walk']), false);
  // Everything selectable: a single step cannot be split, two can.
  assert.equal(partialModerationAvailable(['feed'], ['feed']), false);
  assert.equal(partialModerationAvailable(['feed', 'walk'], ['feed', 'walk']), true);
  // One step is the caller's own and stays done, so the other one is a valid partial.
  assert.equal(partialModerationAvailable(['walk'], ['feed', 'walk']), true);
});
