import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import {
  adminAuth,
  adminDb,
  choreInput,
  createHousehold,
  expectError,
  must,
  nextOpenInstance,
  withProfile,
} from './helpers';

// Cloud Functions behaviour, called over HTTP against the emulators.

async function setupWithChore(input: Record<string, unknown> = {}) {
  const creator = await withProfile('creator', 'Alex');
  const { householdId, code } = await createHousehold(creator);
  const { choreId } = await must('saveChore', creator.token, { householdId, chore: choreInput(input) });
  return { creator, householdId, code, choreId };
}

async function ledgerFor(householdId: string, instanceId: string) {
  const snap = await adminDb().collection(`households/${householdId}/ledger`).where('instanceId', '==', instanceId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, any> & { id: string });
}

describe('profile and household creation', () => {
  it('ensureProfile is idempotent and derives initials', async () => {
    const user = await withProfile('profile', 'Eduardo Felipe');
    const again = await must('ensureProfile', user.token, { displayName: 'Other', locale: 'de-DE', themeId: 'sticker' });
    expect(again.uid).toBe(user.uid);
    expect(again.initials).toBe('EF');
    expect(again.displayName).toBe('Eduardo Felipe');
  });

  it('createHousehold makes the caller the creator and fails if they already have one', async () => {
    const creator = await withProfile('creator', 'Alex');
    const { householdId } = await must('createHousehold', creator.token, { name: 'Home', icon: 'house', color: '#76ff03', timeZone: 'America/Sao_Paulo' });
    const household = await adminDb().doc(`households/${householdId}`).get();
    expect(household.get('creatorUid')).toBe(creator.uid);
    expect(household.get('memberUids')).toEqual([creator.uid]);
    expect(household.get('timeZone')).toBe('America/Sao_Paulo');
    await expectError('createHousehold', creator.token, { name: 'Second', icon: 'house', color: '#76ff03', timeZone: 'UTC' }, 'failed-precondition');
  });

  it('rejects unauthenticated calls and bad input', async () => {
    await expectError('ensureProfile', null, { displayName: 'x', locale: 'en-US', themeId: 'arcade' }, 'unauthenticated');
    const user = await withProfile('bad', 'Bad Input');
    await expectError('createHousehold', user.token, { name: 'Home', icon: 'house', color: 'purple', timeZone: 'UTC' }, 'invalid-argument');
  });
});

describe('invites', () => {
  it('joins with a valid code, creating a member doc and counting the use', async () => {
    const { creator, householdId, code } = await setupWithChore();
    const member = await withProfile('member', 'Sam');
    const joined = await must('joinHousehold', member.token, { code: code.toLowerCase() });
    expect(joined.householdId).toBe(householdId);

    const household = await adminDb().doc(`households/${householdId}`).get();
    expect(household.get('memberUids')).toEqual([creator.uid, member.uid]);
    const memberDoc = await adminDb().doc(`households/${householdId}/members/${member.uid}`).get();
    expect(memberDoc.get('role')).toBe('member');
    const invite = await adminDb().doc(`inviteCodes/${code}`).get();
    expect(invite.get('uses')).toBe(1);
    await expectError('joinHousehold', member.token, { code }, 'failed-precondition');
  });

  it('a bad code is not-found', async () => {
    const user = await withProfile('stranger', 'Stranger');
    await expectError('joinHousehold', user.token, { code: 'ZZZZZZ' }, 'not-found');
    await expectError('joinHousehold', user.token, { code: 'bad!' }, 'not-found');
  });

  it('allows no more than 20 failed invite guesses per user per hour', async () => {
    const user = await withProfile('guess-limit', 'Guess Limit');
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await expectError('joinHousehold', user.token, { code: 'ZZZZZZ' }, 'not-found');
    }
    await expectError('joinHousehold', user.token, { code: 'ZZZZZZ' }, 'resource-exhausted');
    expect((await adminDb().doc(`users/${user.uid}`).get()).get('joinAttempts.count')).toBe(20);
  });

  it('starts a fresh failed-join window after one hour', async () => {
    const user = await withProfile('guess-window', 'Guess Window');
    await adminDb().doc(`users/${user.uid}`).update({
      joinAttempts: { count: 20, windowStart: Timestamp.fromMillis(Date.now() - 60 * 60 * 1000 - 1) },
    });
    await expectError('joinHousehold', user.token, { code: 'ZZZZZZ' }, 'not-found');
    const attempts = (await adminDb().doc(`users/${user.uid}`).get()).get('joinAttempts');
    expect(attempts.count).toBe(1);
    expect(attempts.windowStart.toMillis()).toBeGreaterThan(Date.now() - 60 * 60 * 1000);
  });

  it('does not count successful joins toward the failed invite limit', async () => {
    const { code } = await createHousehold(await withProfile('good-invite', 'Good Invite'));
    const user = await withProfile('good-joiner', 'Good Joiner');
    for (let attempt = 0; attempt < 19; attempt += 1) {
      await expectError('joinHousehold', user.token, { code: 'ZZZZZZ' }, 'not-found');
    }
    await must('joinHousehold', user.token, { code });
    expect((await adminDb().doc(`users/${user.uid}`).get()).get('joinAttempts.count')).toBe(19);
  });

  it('an expired code fails with failed-precondition', async () => {
    const { code } = await setupWithChore();
    await adminDb().doc(`inviteCodes/${code}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 60_000) });
    const user = await withProfile('late', 'Late');
    await expectError('joinHousehold', user.token, { code }, 'failed-precondition');
  });

  it('a full code (eight uses) fails with failed-precondition', async () => {
    const { householdId, code } = await setupWithChore();
    await adminDb().doc(`inviteCodes/${code}`).update({ uses: 8 });
    await adminDb().doc(`households/${householdId}/meta/invite`).update({ uses: 8 });
    const user = await withProfile('full', 'Full');
    await expectError('joinHousehold', user.token, { code }, 'failed-precondition');
  });

  it('a rotated code revokes the old one', async () => {
    const { creator, householdId, code } = await setupWithChore();
    const rotated = await must('rotateInvite', creator.token, { householdId });
    expect(rotated.code).not.toBe(code);
    const user = await withProfile('after-rotate', 'After');
    await expectError('joinHousehold', user.token, { code }, 'failed-precondition');
    await must('joinHousehold', user.token, { code: rotated.code });
  });
});

describe('chores and assignments', () => {
  it('only the creator may save chores', async () => {
    const { creator, householdId, code } = await setupWithChore();
    const member = await withProfile('member-chore', 'Sam');
    await must('joinHousehold', member.token, { code });
    await expectError('saveChore', member.token, { householdId, chore: choreInput() }, 'permission-denied');
    await expectError('saveChore', creator.token, { householdId, chore: choreInput({ subtasks: [] }) }, 'invalid-argument');
  });

  it('saveChore generates instances to the 14-day horizon', async () => {
    const { householdId, choreId } = await setupWithChore();
    const snap = await adminDb().collection(`households/${householdId}/instances`).where('choreId', '==', choreId).get();
    expect(snap.size).toBeGreaterThanOrEqual(14);
    expect(snap.size).toBeLessThanOrEqual(16);
  });

  it('setAssignments updates the chore and its editable future instances', async () => {
    const { creator, householdId, code, choreId } = await setupWithChore();
    const member = await withProfile('assignee', 'Sam');
    await must('joinHousehold', member.token, { code });
    await must('setAssignments', creator.token, { householdId, choreId, assigneeIds: [member.uid] });
    const instance = await nextOpenInstance(householdId, choreId);
    expect(instance.get('assigneeIds')).toEqual([member.uid]);
  });

  it('pausing removes editable future instances and reactivating regenerates them', async () => {
    const { creator, householdId, choreId } = await setupWithChore();
    const instances = () => adminDb().collection(`households/${householdId}/instances`).where('choreId', '==', choreId);
    await must('setChoreActive', creator.token, { householdId, choreId, isActive: false });
    expect((await instances().where('status', '==', 'open').get()).size).toBe(0);
    await must('setChoreActive', creator.token, { householdId, choreId, isActive: true });
    expect((await instances().where('status', '==', 'open').get()).size).toBeGreaterThanOrEqual(14);
  });

  it('deleteChore removes the chore and its editable future instances', async () => {
    const { creator, householdId, choreId } = await setupWithChore();
    await must('deleteChore', creator.token, { householdId, choreId });
    expect((await adminDb().doc(`households/${householdId}/chores/${choreId}`).get()).exists).toBe(false);
    const left = await adminDb().collection(`households/${householdId}/instances`).where('choreId', '==', choreId).where('status', '==', 'open').get();
    expect(left.size).toBe(0);
  });
});

describe('completion, bonus and undo', () => {
  it('two members complete all subtasks: bonus is split and ledger rows are written', async () => {
    const { creator, householdId, code, choreId } = await setupWithChore();
    const member = await withProfile('finisher', 'Sam');
    await must('joinHousehold', member.token, { code });
    const instance = await nextOpenInstance(householdId, choreId);
    const instanceId = instance.id;

    await must('completeSubtask', creator.token, { householdId, instanceId, subtaskId: 'wash' });
    await must('completeSubtask', member.token, { householdId, instanceId, subtaskId: 'wipe' });
    const done = await must('completeSubtask', member.token, { householdId, instanceId, subtaskId: 'trash' });
    expect(done.status).toBe('done');

    const after = await adminDb().doc(`households/${householdId}/instances/${instanceId}`).get();
    expect(after.get('status')).toBe('done');
    expect(after.get('bonusAwards')).toEqual({ [creator.uid]: 2, [member.uid]: 3 });

    const rows = await ledgerFor(householdId, instanceId);
    const subtaskRows = rows.filter((r) => r.source === 'subtask');
    const bonusRows = rows.filter((r) => r.source === 'bonus');
    expect(subtaskRows.reduce((sum, r) => sum + r.amount, 0)).toBe(30);
    expect(bonusRows.map((r) => [r.memberId, r.amount]).sort()).toEqual(
      [[creator.uid, 2], [member.uid, 3]].sort(),
    );
    expect((await adminDb().doc(`households/${householdId}/members/${creator.uid}`).get()).get('xp')).toBe(12);
    expect((await adminDb().doc(`households/${householdId}/members/${member.uid}`).get()).get('xp')).toBe(23);
  });

  it('completing the same subtask again is already-exists', async () => {
    const { creator, householdId, choreId } = await setupWithChore();
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', creator.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await expectError('completeSubtask', creator.token, { householdId, instanceId: instance.id, subtaskId: 'wash' }, 'already-exists');
  });

  it('a completion after the deadline is failed-precondition', async () => {
    const { creator, householdId, choreId } = await setupWithChore();
    const instance = await nextOpenInstance(householdId, choreId);
    await adminDb().doc(`households/${householdId}/instances/${instance.id}`).update({ dueAt: Timestamp.fromMillis(Date.now() - 60_000) });
    await expectError('completeSubtask', creator.token, { householdId, instanceId: instance.id, subtaskId: 'wipe' }, 'failed-precondition');
  });

  it('undo inside five minutes reverses the credit', async () => {
    const { creator, householdId, choreId } = await setupWithChore();
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', creator.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('undoSubtask', creator.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });

    const rows = await ledgerFor(householdId, instance.id);
    const undo = rows.find((r) => r.source === 'undo-subtask');
    expect(undo?.amount).toBe(-10);
    const credit = rows.find((r) => r.source === 'subtask');
    expect(undo?.reversesEntryId).toBe(credit?.id);
    const after = await adminDb().doc(`households/${householdId}/instances/${instance.id}`).get();
    expect(after.get('completions')).toEqual([]);
    expect(after.get('status')).toBe('open');
    expect((await adminDb().doc(`households/${householdId}/members/${creator.uid}`).get()).get('xp')).toBe(0);
  });

  it('undo reverses every bonus ledger row from member lifetime XP', async () => {
    const { creator, householdId, choreId } = await setupWithChore({
      subtasks: [{ id: 'one', name: 'One', xp: 10, position: 0 }],
      bonusXp: 5,
    });
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', creator.token, { householdId, instanceId: instance.id, subtaskId: 'one' });
    expect((await adminDb().doc(`households/${householdId}/members/${creator.uid}`).get()).get('xp')).toBe(15);
    await must('undoSubtask', creator.token, { householdId, instanceId: instance.id, subtaskId: 'one' });
    expect((await adminDb().doc(`households/${householdId}/members/${creator.uid}`).get()).get('xp')).toBe(0);
    expect((await ledgerFor(householdId, instance.id)).filter((row) => row.source.startsWith('undo-')).map((row) => row.amount).sort()).toEqual([-10, -5]);
  });

  it('undo after five minutes is refused', async () => {
    const { creator, householdId, choreId } = await setupWithChore();
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', creator.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    const ref = adminDb().doc(`households/${householdId}/instances/${instance.id}`);
    const completions = ((await ref.get()).get('completions') as Array<Record<string, unknown>>).map((c) => ({
      ...c,
      completedAt: Timestamp.fromMillis(Date.now() - 6 * 60_000),
    }));
    await ref.update({ completions });
    await expectError('undoSubtask', creator.token, { householdId, instanceId: instance.id, subtaskId: 'wash' }, 'failed-precondition');
  });

  it('only the completer can undo', async () => {
    const { creator, householdId, code, choreId } = await setupWithChore();
    const member = await withProfile('other', 'Sam');
    await must('joinHousehold', member.token, { code });
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', creator.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await expectError('undoSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' }, 'permission-denied');
  });

  it('postCompletion is idempotent for a contributor of a done instance', async () => {
    const { creator, householdId, choreId } = await setupWithChore({ subtasks: [{ id: 'only', name: 'Only', xp: 10, position: 0 }], bonusXp: 0 });
    const instance = await nextOpenInstance(householdId, choreId);
    await expectError('postCompletion', creator.token, { householdId, instanceId: instance.id }, 'failed-precondition');
    await must('completeSubtask', creator.token, { householdId, instanceId: instance.id, subtaskId: 'only' });
    const first = await must('postCompletion', creator.token, { householdId, instanceId: instance.id });
    const second = await must('postCompletion', creator.token, { householdId, instanceId: instance.id });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.postId).toBe(first.postId);
  });
});

describe('leaving, removing and deleting', () => {
  it('the creator leaving transfers ownership to the longest-standing member', async () => {
    const { creator, householdId, code } = await setupWithChore();
    const member = await withProfile('stays', 'Sam');
    await must('joinHousehold', member.token, { code });
    await must('leaveHousehold', creator.token, { householdId });

    const household = await adminDb().doc(`households/${householdId}`).get();
    expect(household.get('creatorUid')).toBe(member.uid);
    expect(household.get('memberUids')).toEqual([member.uid]);
    expect((await adminDb().doc(`households/${householdId}/members/${member.uid}`).get()).get('role')).toBe('creator');
    const tombstone = await adminDb().doc(`households/${householdId}/members/${creator.uid}`).get();
    expect(tombstone.get('deleted')).toBe(true);
    expect((await adminDb().doc(`users/${creator.uid}`).get()).get('householdId')).toBeNull();
  });

  it('the last member leaving deletes the household, its subcollections and its invite codes', async () => {
    const { creator, householdId, code } = await setupWithChore();
    const member = await withProfile('last', 'Sam');
    await must('joinHousehold', member.token, { code });
    await must('leaveHousehold', creator.token, { householdId });
    await must('leaveHousehold', member.token, { householdId });

    expect((await adminDb().doc(`households/${householdId}`).get()).exists).toBe(false);
    expect((await adminDb().collection(`households/${householdId}/members`).get()).size).toBe(0);
    expect((await adminDb().collection(`households/${householdId}/chores`).get()).size).toBe(0);
    expect((await adminDb().doc(`inviteCodes/${code}`).get()).exists).toBe(false);
  });

  it('removing a member revokes the old invite code and rotates the active code', async () => {
    const { creator, householdId, code } = await setupWithChore();
    const member = await withProfile('removed-invite', 'Removed');
    await must('joinHousehold', member.token, { code });
    await must('removeMember', creator.token, { householdId, uid: member.uid });

    expect((await adminDb().doc(`inviteCodes/${code}`).get()).get('revoked')).toBe(true);
    const active = await adminDb().doc(`households/${householdId}/meta/invite`).get();
    expect(active.get('code')).not.toBe(code);
    await expectError('joinHousehold', member.token, { code }, 'failed-precondition');
  });

  it('a transaction retry after a concurrent join does not delete a non-empty household', async () => {
    const creator = await withProfile('retry-leaver', 'Retry Leaver');
    const { householdId, code } = await createHousehold(creator);
    const joiners = await Promise.all([
      withProfile('retry-joiner-a', 'Joiner A'),
      withProfile('retry-joiner-b', 'Joiner B'),
      withProfile('retry-joiner-c', 'Joiner C'),
    ]);

    const results = await Promise.allSettled([
      must('leaveHousehold', creator.token, { householdId }),
      ...joiners.map((joiner) => must('joinHousehold', joiner.token, { code })),
    ]);
    const household = await adminDb().doc(`households/${householdId}`).get();
    const successfulJoins = results.slice(1).filter((result) => result.status === 'fulfilled');
    expect(household.exists || successfulJoins.length === 0).toBe(true);
  });

  it('removeMember by a non-creator is permission-denied', async () => {
    const { creator, householdId, code } = await setupWithChore();
    const a = await withProfile('a', 'A');
    const b = await withProfile('b', 'B');
    await must('joinHousehold', a.token, { code });
    await must('joinHousehold', b.token, { code });
    await expectError('removeMember', a.token, { householdId, uid: b.uid }, 'permission-denied');
    await must('removeMember', creator.token, { householdId, uid: b.uid });
    const household = await adminDb().doc(`households/${householdId}`).get();
    expect(household.get('memberUids')).not.toContain(b.uid);
  });

  it('deleteAccount removes the Auth user and tombstones the member', async () => {
    const { creator, householdId, code } = await setupWithChore();
    const leaver = await withProfile('leaver', 'Gone Soon');
    await must('joinHousehold', leaver.token, { code });
    await must('deleteAccount', leaver.token, {});

    await expect(adminAuth().getUser(leaver.uid)).rejects.toMatchObject({ code: 'auth/user-not-found' });
    expect((await adminDb().doc(`users/${leaver.uid}`).get()).exists).toBe(false);
    const tombstone = await adminDb().doc(`households/${householdId}/members/${leaver.uid}`).get();
    expect(tombstone.get('name')).toBe('Former member');
    expect(tombstone.get('initials')).toBe('?');
    expect(tombstone.get('deleted')).toBe(true);
    const household = await adminDb().doc(`households/${householdId}`).get();
    expect(household.get('memberUids')).toEqual([creator.uid]);
  });

  it('createHousehold and joinHousehold reject profiles marked as deleting', async () => {
    const { code } = await createHousehold(await withProfile('active-creator', 'Creator'));
    const deleting = await withProfile('deleting-user', 'Deleting');
    await adminDb().doc(`users/${deleting.uid}`).update({ deleting: true });
    await expectError('createHousehold', deleting.token, { name: 'Home', icon: 'house', color: '#76ff03', timeZone: 'UTC' }, 'failed-precondition');
    await expectError('joinHousehold', deleting.token, { code }, 'failed-precondition');
  });

  it('deleteAccount prevents a racing createHousehold from leaving an orphaned household', async () => {
    const user = await withProfile('deleting-race', 'Deleting Race');
    const results = await Promise.allSettled([
      must('deleteAccount', user.token, {}),
      ...Array.from({ length: 4 }, () =>
        must('createHousehold', user.token, { name: 'Race', icon: 'house', color: '#76ff03', timeZone: 'UTC' }),
      ),
    ]);
    expect(results[0]?.status).toBe('fulfilled');
    expect((await adminDb().doc(`users/${user.uid}`).get()).exists).toBe(false);
    expect((await adminDb().collection('households').where('memberUids', 'array-contains', user.uid).get()).size).toBe(0);
  });

  it('reportContent writes a report for a valid target', async () => {
    const { creator, householdId, choreId } = await setupWithChore();
    const report = await must('reportContent', creator.token, { householdId, kind: 'chore', targetId: choreId, reason: 'spam' });
    expect((await adminDb().doc(`reports/${report.reportId}`).get()).get('kind')).toBe('chore');
    const second = await must('reportContent', creator.token, { householdId, kind: 'chore', targetId: choreId, reason: 'repeated' });
    expect(second.reportId).toBe(`${creator.uid}_chore_${choreId}`);
    expect((await adminDb().collection('reports').where('reporterUid', '==', creator.uid).get()).size).toBe(1);
    expect((await adminDb().doc(`reports/${second.reportId}`).get()).get('reason')).toBe('repeated');
    await expectError('reportContent', creator.token, { householdId, kind: 'chore', targetId: 'missing', reason: '' }, 'not-found');
  });
});
