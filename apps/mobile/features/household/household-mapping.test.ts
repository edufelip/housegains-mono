import assert from 'node:assert/strict';
import test from 'node:test';
import {
  callableErrorKey,
  isoOf,
  mapHousehold,
  mapDispute,
  mapInstance,
  mapInvite,
  mapLedgerEntry,
  mapMember,
  mapWeekStandings,
  placeholderMember,
  splitMembers,
} from './household-mapping';

test('deleted members leave the roster but stay in former members for history', () => {
  const { roster, formerMembers } = splitMembers([
    { id: 'a', data: { name: 'Ana', initials: 'AN', role: 'creator' } },
    { id: 'b', data: { name: 'Bo', initials: 'BO', deleted: true } },
  ]);
  assert.deepEqual(
    roster.map((member) => member.id),
    ['a'],
  );
  assert.deepEqual(
    formerMembers.map((member) => member.name),
    ['Bo'],
  );
  assert.equal(roster[0].role, 'creator');
  assert.equal(formerMembers[0].role, 'member');
});

test('maps persisted lifetime XP and leaves it absent for legacy member documents', () => {
  assert.equal(mapMember('a', { xp: 123 }).xp, 123);
  assert.equal(mapMember('b', {}).xp, undefined);
});

test('an invite without a use limit gets the default of 8, and a revoked flag is kept', () => {
  assert.equal(mapInvite({ code: 'HG7K2P', uses: 2 }).maxUses, 8);
  assert.equal(mapInvite({ code: 'HG7K2P', revoked: true }).revoked, true);
  assert.equal(mapInvite(undefined).code, '');
});

test('timestamps become ISO strings and a missing value becomes an empty string', () => {
  const date = new Date('2026-11-13T12:00:00.000Z');
  assert.equal(isoOf(date), '2026-11-13T12:00:00.000Z');
  assert.equal(isoOf({ toDate: () => date }), '2026-11-13T12:00:00.000Z');
  assert.equal(isoOf(undefined), '');
});

test('the signed-in member placeholder is a plain member until the snapshot arrives', () => {
  const member = placeholderMember('uid-1', {
    displayName: 'Edu',
    initials: 'ED',
    color: '#FFD33D',
  });
  assert.deepEqual(member, {
    id: 'uid-1',
    name: 'Edu',
    initials: 'ED',
    color: '#FFD33D',
    role: 'member',
  });
});

test('the admin role is kept and unknown roles fall back to member', () => {
  assert.equal(mapMember('a', { role: 'admin' }).role, 'admin');
  assert.equal(mapMember('b', { role: 'creator' }).role, 'creator');
  assert.equal(mapMember('c', { role: 'former' }).role, 'member');
});

test('instances map dispute status and moderation revocations', () => {
  const at = new Date('2026-11-20T10:00:00.000Z');
  const base = {
    choreId: 'c1',
    dueAt: at,
    subtasks: [],
    bonusXp: 0,
    assigneeIds: [],
    status: 'partial',
    completions: [],
    bonusAwards: {},
  };
  const instance = mapInstance('i1', {
    ...base,
    disputeStatus: 'resolved',
    revocations: [
      { subtaskId: 'wash', memberId: 'm1', xp: 10, actorUid: 'creator', verdict: 'not_done', at },
    ],
  });
  assert.equal(instance.disputeStatus, 'resolved');
  assert.deepEqual(instance.revocations, [
    {
      subtaskId: 'wash',
      memberId: 'm1',
      xp: 10,
      actorUid: 'creator',
      verdict: 'not_done',
      at: '2026-11-20T10:00:00.000Z',
    },
  ]);
});

test('an instance that was never disputed omits the moderation fields', () => {
  const instance = mapInstance('i1', {
    choreId: 'c1',
    dueAt: new Date(),
    subtasks: [],
    bonusXp: 0,
    assigneeIds: [],
    status: 'open',
    completions: [],
    bonusAwards: {},
  });
  assert.equal(instance.disputeStatus, undefined);
  assert.equal(instance.revocations, undefined);
});

test('revoke ledger rows keep their source and reversal pointer', () => {
  const at = new Date('2026-11-20T10:00:00.000Z');
  assert.equal(
    mapLedgerEntry('e1', {
      instanceId: 'i',
      subtaskId: 'wash',
      memberId: 'm',
      amount: -10,
      source: 'revoke-subtask',
      createdAt: at,
    }).source,
    'revoke-subtask',
  );
  assert.deepEqual(
    mapLedgerEntry('e2', {
      instanceId: 'i',
      memberId: 'm',
      amount: -5,
      source: 'revoke-bonus',
      createdAt: at,
      reversesEntryId: 'e0',
    }),
    {
      id: 'e2',
      instanceId: 'i',
      memberId: 'm',
      amount: -5,
      source: 'revoke-bonus',
      createdAt: '2026-11-20T10:00:00.000Z',
      reversesEntryId: 'e0',
    },
  );
});

test('invite codes map to the invite-specific messages', () => {
  assert.equal(
    callableErrorKey('not-found', 'Invite code not found.'),
    'housegains.auth.sync.inviteNotFound',
  );
  assert.equal(
    callableErrorKey('functions/failed-precondition', 'This invite has expired.'),
    'housegains.auth.sync.inviteExpired',
  );
  assert.equal(
    callableErrorKey('failed-precondition', 'This invite was revoked.'),
    'housegains.auth.sync.inviteRevoked',
  );
  assert.equal(
    callableErrorKey('failed-precondition', 'This invite has reached its use limit.'),
    'housegains.auth.sync.inviteFull',
  );
  assert.equal(
    callableErrorKey('resource-exhausted', 'This household is full.'),
    'housegains.auth.sync.householdFull',
  );
});

test('state conflicts map to the step-specific messages', () => {
  assert.equal(
    callableErrorKey('failed-precondition', 'You already belong to a household.'),
    'housegains.auth.sync.alreadyInHousehold',
  );
  assert.equal(
    callableErrorKey('failed-precondition', 'This chore is already completed.'),
    'housegains.auth.sync.alreadyCompleted',
  );
  assert.equal(
    callableErrorKey('failed-precondition', 'The deadline has passed.'),
    'housegains.auth.sync.deadlinePassed',
  );
  assert.equal(
    callableErrorKey(
      'failed-precondition',
      'Undo is available for 5 minutes after your completion.',
    ),
    'housegains.auth.sync.undoExpired',
  );
  assert.equal(
    callableErrorKey('failed-precondition', 'Create your profile first.'),
    'housegains.auth.sync.profileMissing',
  );
  assert.equal(
    callableErrorKey('already-exists', 'This subtask was already completed.'),
    'housegains.auth.sync.stepDone',
  );
  assert.equal(callableErrorKey('not-found', 'Chore not found.'), 'housegains.auth.sync.notFound');
});

test('permission, connection and unknown failures map to their messages', () => {
  assert.equal(
    callableErrorKey('permission-denied', 'Only the household creator can do that.'),
    'housegains.auth.sync.notAllowed',
  );
  assert.equal(
    callableErrorKey('unauthenticated', 'Sign in first.'),
    'housegains.auth.sync.notAllowed',
  );
  assert.equal(callableErrorKey('unavailable'), 'housegains.auth.sync.offline');
  assert.equal(callableErrorKey('deadline-exceeded'), 'housegains.auth.sync.offline');
  assert.equal(
    callableErrorKey('failed-precondition', 'Could not allocate an invite code. Try again.'),
    'housegains.auth.error.generic',
  );
  assert.equal(callableErrorKey('internal', 'boom'), 'housegains.auth.error.generic');
});

test('disputes map reports, verdict fields and ISO timestamps', () => {
  const at = new Date('2026-11-22T08:00:00.000Z');
  const dispute = mapDispute('inst-1', {
    instanceId: 'inst-1',
    choreName: 'Dog care',
    status: 'open',
    subtaskIds: ['feed', 'walk'],
    completerIds: ['bia'],
    reports: [{ uid: 'rafa', subtaskIds: ['feed'], reason: 'not done', createdAt: at }],
    createdAt: at,
    expiresAt: at,
  });
  assert.equal(dispute.id, 'inst-1');
  assert.equal(dispute.status, 'open');
  assert.deepEqual(dispute.reports, [
    {
      uid: 'rafa',
      subtaskIds: ['feed'],
      reason: 'not done',
      createdAt: '2026-11-22T08:00:00.000Z',
    },
  ]);
  assert.equal(dispute.verdict, undefined);
  assert.equal(dispute.resolverUid, undefined);

  const resolved = mapDispute('inst-2', {
    choreName: 'Dishes',
    status: 'resolved',
    verdict: 'partial',
    revokedSubtaskIds: ['wash'],
    resolverUid: 'edu',
    createdAt: at,
    resolvedAt: at,
    expiresAt: at,
  });
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.verdict, 'partial');
  assert.deepEqual(resolved.revokedSubtaskIds, ['wash']);
  assert.equal(resolved.resolverUid, 'edu');
  assert.equal(mapDispute('inst-3', { status: 'weird' }).status, 'open');
});

test('weeks map the closed snapshot, nullable titles, and member totals', () => {
  assert.equal(mapWeekStandings(undefined), null);
  assert.equal(mapWeekStandings({}), null);

  const week = mapWeekStandings({
    weekStart: '2026-11-16',
    weekEnd: '2026-11-22',
    members: { bia: { xp: 40, subtasks: 8, assignedDue: 9, missed: 1 } },
    topMember: { memberId: 'bia', xp: 40, subtasks: 8 },
    wallOfShame: { memberId: 'rafa', missed: 3, assignedDue: 5 },
  });
  assert.deepEqual(week, {
    weekStart: '2026-11-16',
    weekEnd: '2026-11-22',
    topMember: { memberId: 'bia', xp: 40, subtasks: 8 },
    wallOfShame: { memberId: 'rafa', missed: 3, assignedDue: 5 },
    members: { bia: { xp: 40, subtasks: 8, assignedDue: 9, missed: 1 } },
  });

  const hidden = mapWeekStandings({
    weekStart: '2026-11-16',
    weekEnd: '2026-11-22',
    topMember: null,
    wallOfShame: null,
    members: {},
  });
  assert.ok(hidden);
  assert.equal(hidden.topMember, null);
  assert.equal(hidden.wallOfShame, null);
  assert.deepEqual(hidden.members, {});
});

test('moderation failures map to their own messages', () => {
  assert.equal(
    callableErrorKey('failed-precondition', 'An admin already reviewed this chore.'),
    'housegains.auth.sync.alreadyReviewed',
  );
  assert.equal(
    callableErrorKey('failed-precondition', 'The 72-hour dispute window has closed.'),
    'housegains.auth.sync.reviewWindowClosed',
  );
  assert.equal(
    callableErrorKey('failed-precondition', 'Completions can only be disputed within 72 hours.'),
    'housegains.auth.sync.reviewWindowClosed',
  );
  assert.equal(
    callableErrorKey(
      'failed-precondition',
      'There is nothing completed by another member to report.',
    ),
    'housegains.auth.sync.nothingToReport',
  );
  assert.equal(
    callableErrorKey('already-exists', 'You already reported this chore.'),
    'housegains.auth.sync.alreadyReported',
  );
  assert.equal(
    callableErrorKey(
      'permission-denied',
      'You completed part of this chore, so another admin must review it.',
    ),
    'housegains.auth.sync.conflictOfInterest',
  );
});

test('maps xpPeak, levelFloor and the gamification cohort when present, and omits them when missing', () => {
  const withLevel = mapMember('uid', { name: 'A', xp: 1840, xpPeak: 1900, levelFloor: 1 });
  assert.equal(withLevel.xpPeak, 1900);
  assert.equal(withLevel.levelFloor, 1);
  const legacy = mapMember('uid', { name: 'A', xp: 1840 });
  assert.equal('xpPeak' in legacy, false);
  assert.equal('levelFloor' in legacy, false);

  const live = mapHousehold(
    'h',
    { name: 'H', gamificationCohort: 'live' },
    [],
    [],
    mapInvite(undefined),
  );
  assert.equal(live.gamificationCohort, 'live');
  const unknown = mapHousehold(
    'h',
    { name: 'H', gamificationCohort: 'weird' },
    [],
    [],
    mapInvite(undefined),
  );
  assert.equal(unknown.gamificationCohort, undefined);
  const missing = mapHousehold('h', { name: 'H' }, [], [], mapInvite(undefined));
  assert.equal('gamificationCohort' in missing, false);
});
