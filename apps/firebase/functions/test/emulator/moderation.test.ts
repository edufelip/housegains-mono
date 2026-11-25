import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import {
  adminDb,
  choreInput,
  createHousehold,
  expectError,
  must,
  nextOpenInstance,
  withProfile,
  type TestUser,
} from './helpers';

// Moderation (contract Part A) against the emulators: roles, disputes, revocation.

async function ledgerFor(householdId: string, instanceId: string) {
  const snap = await adminDb().collection(`households/${householdId}/ledger`).where('instanceId', '==', instanceId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, any> & { id: string });
}

async function memberXp(householdId: string, uid: string) {
  return (await adminDb().doc(`households/${householdId}/members/${uid}`).get()).get('xp') as number;
}

interface Household {
  creator: TestUser;
  householdId: string;
  code: string;
  choreId: string;
}

/** A creator, two joined members and a three-subtask chore with future instances. */
async function moderatedHousehold(): Promise<Household & { memberA: TestUser; memberB: TestUser }> {
  const creator = await withProfile('mod-creator', 'Alex');
  const { householdId, code } = await createHousehold(creator);
  const { choreId } = await must('saveChore', creator.token, { householdId, chore: choreInput() });
  const memberA = await withProfile('mod-a', 'Sam');
  const memberB = await withProfile('mod-b', 'Bea');
  await must('joinHousehold', memberA.token, { code });
  await must('joinHousehold', memberB.token, { code });
  return { creator, householdId, code, choreId, memberA, memberB };
}

function disputeDoc(householdId: string, instanceId: string) {
  return adminDb().doc(`households/${householdId}/disputes/${instanceId}`);
}

function instanceDoc(householdId: string, instanceId: string) {
  return adminDb().doc(`households/${householdId}/instances/${instanceId}`);
}

/** Backdates every completion of an instance, to test time windows without waiting. */
async function backdateCompletions(householdId: string, instanceId: string, ageMs: number) {
  const ref = instanceDoc(householdId, instanceId);
  const completions = ((await ref.get()).get('completions') as Array<Record<string, unknown>>).map((c) => ({
    ...c,
    completedAt: Timestamp.fromMillis(Date.now() - ageMs),
  }));
  await ref.update({ completions });
}

describe('setMemberRole (A1)', () => {
  it('lets the creator assign and unassign the admin role, idempotently', async () => {
    const { creator, householdId, memberA } = await moderatedHousehold();
    const first = await must('setMemberRole', creator.token, { householdId, memberId: memberA.uid, role: 'admin' });
    expect(first).toEqual({ memberId: memberA.uid, role: 'admin' });
    const again = await must('setMemberRole', creator.token, { householdId, memberId: memberA.uid, role: 'admin' });
    expect(again.role).toBe('admin');
    await must('setMemberRole', creator.token, { householdId, memberId: memberA.uid, role: 'member' });
    expect((await adminDb().doc(`households/${householdId}/members/${memberA.uid}`).get()).get('role')).toBe('member');
  });

  it('rejects non-creators, the caller themselves, and unknown members', async () => {
    const { creator, householdId, memberA, memberB } = await moderatedHousehold();
    await must('setMemberRole', creator.token, { householdId, memberId: memberA.uid, role: 'admin' });
    await expectError('setMemberRole', memberA.token, { householdId, memberId: memberB.uid, role: 'admin' }, 'permission-denied');
    await expectError('setMemberRole', memberB.token, { householdId, memberId: memberA.uid, role: 'admin' }, 'permission-denied');
    await expectError('setMemberRole', creator.token, { householdId, memberId: creator.uid, role: 'admin' }, 'invalid-argument');
    await expectError('setMemberRole', creator.token, { householdId, memberId: 'stranger', role: 'admin' }, 'not-found');
    await expectError('setMemberRole', creator.token, { householdId, memberId: memberA.uid, role: 'creator' }, 'invalid-argument');
  });

  it('keeps creator-only callables creator-only for admins', async () => {
    const { creator, householdId, memberA } = await moderatedHousehold();
    await must('setMemberRole', creator.token, { householdId, memberId: memberA.uid, role: 'admin' });
    await expectError('saveChore', memberA.token, { householdId, chore: choreInput() }, 'permission-denied');
    await expectError('updateHousehold', memberA.token, { householdId, name: 'Hacked', icon: 'house', color: '#76ff03' }, 'permission-denied');
    await expectError('removeMember', memberA.token, { householdId, uid: creator.uid }, 'permission-denied');
  });

  it('creator succession picks the longest-standing admin over the longest-standing member', async () => {
    const { creator, householdId, memberA, memberB } = await moderatedHousehold();
    // memberA joined before memberB; the creator promotes only memberB.
    await must('setMemberRole', creator.token, { householdId, memberId: memberB.uid, role: 'admin' });
    await must('leaveHousehold', creator.token, { householdId });
    expect((await adminDb().doc(`households/${householdId}`).get()).get('creatorUid')).toBe(memberB.uid);
    expect((await adminDb().doc(`households/${householdId}/members/${memberB.uid}`).get()).get('role')).toBe('creator');
    expect((await adminDb().doc(`households/${householdId}/members/${memberA.uid}`).get()).get('role')).toBe('member');
  });
});

describe('reportCompletion (A2)', () => {
  it("a member reports another member's completion, creating an open dispute", async () => {
    const { householdId, choreId, memberA, memberB } = await moderatedHousehold();
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });

    const report = await must('reportCompletion', memberB.token, {
      householdId,
      instanceId: instance.id,
      reason: 'Sink was still dirty',
    });
    expect(report.disputeId).toBe(instance.id);

    const dispute = await disputeDoc(householdId, instance.id).get();
    expect(dispute.get('status')).toBe('open');
    expect(dispute.get('choreName')).toBe('Kitchen reset');
    expect(dispute.get('subtaskIds')).toEqual(['wash']);
    expect(dispute.get('completerIds')).toEqual([memberA.uid]);
    expect((dispute.get('reports') as unknown[]).length).toBe(1);
    expect((await instanceDoc(householdId, instance.id).get()).get('disputeStatus')).toBe('open');
  });

  it('members with admin rights report nothing: they moderate directly', async () => {
    const { creator, householdId, choreId, memberA } = await moderatedHousehold();
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await expectError('reportCompletion', creator.token, { householdId, instanceId: instance.id }, 'permission-denied');
    await expectError('reportCompletion', memberA.token, { householdId, instanceId: instance.id }, 'failed-precondition');
  });

  it('an admin-promoted member is also refused', async () => {
    const { creator, householdId, choreId, memberA, memberB } = await moderatedHousehold();
    await must('setMemberRole', creator.token, { householdId, memberId: memberA.uid, role: 'admin' });
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberB.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await expectError('reportCompletion', memberA.token, { householdId, instanceId: instance.id }, 'permission-denied');
  });

  it('the reporter cannot report their own completion, in list or by default', async () => {
    const { householdId, choreId, memberA } = await moderatedHousehold();
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await expectError(
      'reportCompletion',
      memberA.token,
      { householdId, instanceId: instance.id, subtaskIds: ['wash'] },
      'invalid-argument',
    );
    // Default selection has nothing left: the only completion is the caller's own.
    await expectError('reportCompletion', memberA.token, { householdId, instanceId: instance.id }, 'failed-precondition');
  });

  it('a report naming an uncompleted subtask, an empty instance, or a missing instance fails', async () => {
    const { householdId, choreId, memberA, memberB } = await moderatedHousehold();
    const instance = await nextOpenInstance(householdId, choreId);
    await expectError('reportCompletion', memberB.token, { householdId, instanceId: instance.id }, 'failed-precondition');
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await expectError(
      'reportCompletion',
      memberB.token,
      { householdId, instanceId: instance.id, subtaskIds: ['wipe'] },
      'failed-precondition',
    );
    await expectError('reportCompletion', memberB.token, { householdId, instanceId: 'missing' }, 'not-found');
  });

  it('a duplicate report is already-exists and a second reporter appends with unions', async () => {
    const { householdId, code, choreId, memberA, memberB } = await moderatedHousehold();
    const third = await withProfile('mod-c', 'Cleo');
    await must('joinHousehold', third.token, { code });
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('completeSubtask', memberB.token, { householdId, instanceId: instance.id, subtaskId: 'wipe' });

    await must('reportCompletion', third.token, { householdId, instanceId: instance.id, subtaskIds: ['wash'] });
    await expectError(
      'reportCompletion',
      third.token,
      { householdId, instanceId: instance.id, subtaskIds: ['wipe'] },
      'already-exists',
    );
    // A second reporter: memberA completed wash, so they report memberB's wipe.
    await must('reportCompletion', memberA.token, { householdId, instanceId: instance.id, subtaskIds: ['wipe'] });

    const dispute = await disputeDoc(householdId, instance.id).get();
    const reports = dispute.get('reports') as { uid: string; subtaskIds: string[] }[];
    expect(reports.map((report) => report.uid)).toEqual([third.uid, memberA.uid]);
    expect(dispute.get('subtaskIds')).toEqual(['wash', 'wipe']);
    expect(dispute.get('completerIds')).toEqual([memberA.uid, memberB.uid]);
  });

  it('rejects reports on completions older than 72 hours', async () => {
    const { householdId, choreId, memberA, memberB } = await moderatedHousehold();
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await backdateCompletions(householdId, instance.id, 73 * 60 * 60 * 1000);
    await expectError('reportCompletion', memberB.token, { householdId, instanceId: instance.id }, 'failed-precondition');
  });

  it('rejects a report on a resolved dispute', async () => {
    const { creator, householdId, choreId, memberA, memberB } = await moderatedHousehold();
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('reportCompletion', memberB.token, { householdId, instanceId: instance.id });
    await must('resolveDispute', creator.token, { householdId, disputeId: instance.id, verdict: 'done' });
    await expectError('reportCompletion', memberB.token, { householdId, instanceId: instance.id }, 'failed-precondition');
  });
});

describe('resolveDispute (A2/A3)', () => {
  it('verdict done keeps every completion and every XP point', async () => {
    const { creator, householdId, choreId, memberA, memberB } = await moderatedHousehold();
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('reportCompletion', memberB.token, { householdId, instanceId: instance.id });

    const resolved = await must('resolveDispute', creator.token, {
      householdId,
      disputeId: instance.id,
      verdict: 'done',
    });
    expect(resolved.revokedSubtaskIds).toEqual([]);
    expect(await memberXp(householdId, memberA.uid)).toBe(10);
    const after = await instanceDoc(householdId, instance.id).get();
    expect((after.get('completions') as unknown[]).length).toBe(1);
    expect(after.get('disputeStatus')).toBe('resolved');
    const dispute = await disputeDoc(householdId, instance.id).get();
    expect(dispute.get('status')).toBe('resolved');
    expect(dispute.get('verdict')).toBe('done');
    expect(dispute.get('resolverUid')).toBe(creator.uid);
    expect(dispute.get('revokedSubtaskIds')).toEqual([]);
  });

  it('verdict not_done reverses subtask XP and reopens the instance', async () => {
    const { creator, householdId, choreId, memberA, memberB } = await moderatedHousehold();
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wipe' });
    await must('reportCompletion', memberB.token, { householdId, instanceId: instance.id });

    const resolved = await must('resolveDispute', creator.token, {
      householdId,
      disputeId: instance.id,
      verdict: 'not_done',
    });
    expect(resolved.revokedSubtaskIds.sort()).toEqual(['wash', 'wipe'].sort());
    expect(await memberXp(householdId, memberA.uid)).toBe(0);

    const rows = await ledgerFor(householdId, instance.id);
    const credit = rows.find((row) => row.source === 'subtask' && row.subtaskId === 'wash')!;
    const revoke = rows.find((row) => row.source === 'revoke-subtask' && row.subtaskId === 'wash')!;
    expect(revoke.amount).toBe(-10);
    expect(revoke.reversesEntryId).toBe(credit.id);
    expect(revoke.moderation).toEqual({ actorUid: creator.uid, disputeId: instance.id, verdict: 'not_done' });

    const after = await instanceDoc(householdId, instance.id).get();
    expect(after.get('completions')).toEqual([]);
    expect(after.get('status')).toBe('open');
    expect(after.get('disputeStatus')).toBe('resolved');
    const revocations = after.get('revocations') as { subtaskId: string; memberId: string; xp: number; actorUid: string; verdict: string }[];
    expect(revocations.map((r) => r.subtaskId).sort()).toEqual(['wash', 'wipe'].sort());
    expect(revocations[0]!.memberId).toBe(memberA.uid);
    expect(revocations[0]!.verdict).toBe('not_done');
  });

  it('not_done on a done instance also reverses the bonus', async () => {
    const { creator, householdId, choreId, memberA, memberB } = await moderatedHousehold();
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wipe' });
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'trash' });
    expect(await memberXp(householdId, memberA.uid)).toBe(35); // 30 subtasks + 5 bonus
    await must('reportCompletion', memberB.token, { householdId, instanceId: instance.id });

    await must('resolveDispute', creator.token, { householdId, disputeId: instance.id, verdict: 'not_done' });
    expect(await memberXp(householdId, memberA.uid)).toBe(0);
    const rows = await ledgerFor(householdId, instance.id);
    const bonus = rows.find((row) => row.source === 'bonus')!;
    const revokeBonus = rows.find((row) => row.source === 'revoke-bonus')!;
    expect(revokeBonus.amount).toBe(-5);
    expect(revokeBonus.reversesEntryId).toBe(bonus.id);
    const after = await instanceDoc(householdId, instance.id).get();
    expect(after.get('bonusAwards')).toEqual({});
    expect(after.get('status')).toBe('open');
  });

  it('partial revokes only the listed subset and keeps the rest standing', async () => {
    const { creator, householdId, choreId, memberA, memberB } = await moderatedHousehold();
    const instance = await nextOpenInstance(householdId, choreId);
    for (const subtaskId of ['wash', 'wipe', 'trash']) {
      await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId });
    }
    await must('reportCompletion', memberB.token, { householdId, instanceId: instance.id, subtaskIds: ['wash', 'wipe'] });

    const resolved = await must('resolveDispute', creator.token, {
      householdId,
      disputeId: instance.id,
      verdict: 'partial',
      subtaskIds: ['wash'],
    });
    expect(resolved.revokedSubtaskIds).toEqual(['wash']);
    // wash (10) and the 5 bonus are reversed; wipe (15) and trash (5) stand.
    expect(await memberXp(householdId, memberA.uid)).toBe(20);
    const after = await instanceDoc(householdId, instance.id).get();
    expect((after.get('completions') as { subtaskId: string }[]).map((c) => c.subtaskId).sort()).toEqual(['trash', 'wipe']);
    expect(after.get('status')).toBe('partial');
    expect(after.get('bonusAwards')).toEqual({});
    const rows = await ledgerFor(householdId, instance.id);
    expect(rows.filter((row) => row.source === 'revoke-subtask').map((row) => row.subtaskId)).toEqual(['wash']);
  });

  it('partial validates the subset rules', async () => {
    const { creator, householdId, choreId, memberA, memberB } = await moderatedHousehold();
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wipe' });
    await must('reportCompletion', memberB.token, { householdId, instanceId: instance.id });
    // revoking everything is not_done's job
    await expectError(
      'resolveDispute',
      creator.token,
      { householdId, disputeId: instance.id, verdict: 'partial', subtaskIds: ['wash', 'wipe'] },
      'invalid-argument',
    );
    // only disputed subtasks can be revoked
    await expectError(
      'resolveDispute',
      creator.token,
      { householdId, disputeId: instance.id, verdict: 'partial', subtaskIds: ['trash'] },
      'invalid-argument',
    );
    // partial needs a list
    await expectError(
      'resolveDispute',
      creator.token,
      { householdId, disputeId: instance.id, verdict: 'partial' },
      'invalid-argument',
    );
    // a single disputed subtask is done or not_done, never partial
    const other = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: other.id, subtaskId: 'wash' });
    await must('reportCompletion', memberB.token, { householdId, instanceId: other.id, subtaskIds: ['wash'] });
    await expectError(
      'resolveDispute',
      creator.token,
      { householdId, disputeId: other.id, verdict: 'partial', subtaskIds: ['wash'] },
      'invalid-argument',
    );
  });

  it('requires admin rights, an existing open dispute, and freshness', async () => {
    const { creator, householdId, choreId, memberA, memberB } = await moderatedHousehold();
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('reportCompletion', memberB.token, { householdId, instanceId: instance.id });

    await expectError('resolveDispute', memberB.token, { householdId, disputeId: instance.id, verdict: 'done' }, 'permission-denied');
    await expectError('resolveDispute', creator.token, { householdId, disputeId: 'missing', verdict: 'done' }, 'not-found');
    await must('resolveDispute', creator.token, { householdId, disputeId: instance.id, verdict: 'done' });
    await expectError(
      'resolveDispute',
      creator.token,
      { householdId, disputeId: instance.id, verdict: 'not_done' },
      'failed-precondition',
    );

    // A dispute whose 72-hour window has passed cannot be resolved (closeWeeks owns expiry).
    const other = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: other.id, subtaskId: 'wash' });
    await must('reportCompletion', memberB.token, { householdId, instanceId: other.id });
    await disputeDoc(householdId, other.id).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
    await expectError(
      'resolveDispute',
      creator.token,
      { householdId, disputeId: other.id, verdict: 'not_done' },
      'failed-precondition',
    );
  });

  it('an admin cannot resolve their own completion unless they are the only admin', async () => {
    const { creator, householdId, choreId, memberA, memberB } = await moderatedHousehold();
    await must('setMemberRole', creator.token, { householdId, memberId: memberA.uid, role: 'admin' });
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('reportCompletion', memberB.token, { householdId, instanceId: instance.id });
    // memberA is an admin, but the creator is another admin and memberA completed wash.
    await expectError(
      'resolveDispute',
      memberA.token,
      { householdId, disputeId: instance.id, verdict: 'not_done' },
      'permission-denied',
    );
    await must('resolveDispute', creator.token, { householdId, disputeId: instance.id, verdict: 'not_done' });
    expect(await memberXp(householdId, memberA.uid)).toBe(0);
  });

  it('the sole admin may resolve their own completion', async () => {
    const creator = await withProfile('sole-admin', 'Alex');
    const { householdId, code } = await createHousehold(creator);
    const { choreId } = await must('saveChore', creator.token, { householdId, chore: choreInput() });
    const member = await withProfile('sole-member', 'Sam');
    await must('joinHousehold', member.token, { code });
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', creator.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('reportCompletion', member.token, { householdId, instanceId: instance.id });
    await must('resolveDispute', creator.token, { householdId, disputeId: instance.id, verdict: 'not_done' });
    expect(await memberXp(householdId, creator.uid)).toBe(0);
  });
});

describe('moderateInstance (A2/A3)', () => {
  it('revokes a completion directly, without any report', async () => {
    const { creator, householdId, choreId, memberA, memberB } = await moderatedHousehold();
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('completeSubtask', memberB.token, { householdId, instanceId: instance.id, subtaskId: 'wipe' });

    const result = await must('moderateInstance', creator.token, {
      householdId,
      instanceId: instance.id,
      verdict: 'not_done',
      subtaskIds: ['wash'],
    });
    expect(result.revokedSubtaskIds).toEqual(['wash']);
    expect(await memberXp(householdId, memberA.uid)).toBe(0);
    expect(await memberXp(householdId, memberB.uid)).toBe(15);
    expect((await disputeDoc(householdId, instance.id).get()).exists).toBe(false);
    const after = await instanceDoc(householdId, instance.id).get();
    expect((after.get('completions') as { subtaskId: string }[]).map((c) => c.subtaskId)).toEqual(['wipe']);
    expect(after.get('disputeStatus')).toBeUndefined();
    const rows = await ledgerFor(householdId, instance.id);
    const revoke = rows.find((row) => row.source === 'revoke-subtask')!;
    expect(revoke.moderation).toEqual({ actorUid: creator.uid, disputeId: null, verdict: 'not_done' });
  });

  it('resolves an open dispute with the same verdict', async () => {
    const { creator, householdId, choreId, memberA, memberB } = await moderatedHousehold();
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('reportCompletion', memberB.token, { householdId, instanceId: instance.id });

    await must('moderateInstance', creator.token, { householdId, instanceId: instance.id, verdict: 'not_done' });
    const dispute = await disputeDoc(householdId, instance.id).get();
    expect(dispute.get('status')).toBe('resolved');
    expect(dispute.get('verdict')).toBe('not_done');
    expect(dispute.get('revokedSubtaskIds')).toEqual(['wash']);
    expect((await instanceDoc(householdId, instance.id).get()).get('disputeStatus')).toBe('resolved');
    expect(await memberXp(householdId, memberA.uid)).toBe(0);
  });

  it('partial needs a strict subset of the completed subtasks', async () => {
    const { creator, householdId, choreId, memberA } = await moderatedHousehold();
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wipe' });
    await expectError('moderateInstance', creator.token, { householdId, instanceId: instance.id, verdict: 'partial' }, 'invalid-argument');
    await expectError(
      'moderateInstance',
      creator.token,
      { householdId, instanceId: instance.id, verdict: 'partial', subtaskIds: ['wash', 'wipe'] },
      'invalid-argument',
    );
    await expectError(
      'moderateInstance',
      creator.token,
      { householdId, instanceId: instance.id, verdict: 'partial', subtaskIds: ['trash'] },
      'invalid-argument',
    );
    const result = await must('moderateInstance', creator.token, {
      householdId,
      instanceId: instance.id,
      verdict: 'partial',
      subtaskIds: ['wash'],
    });
    expect(result.revokedSubtaskIds).toEqual(['wash']);
    expect(await memberXp(householdId, memberA.uid)).toBe(15);
  });

  it('requires admin rights and the 72-hour window; own completions conflict', async () => {
    const { creator, householdId, choreId, memberA, memberB } = await moderatedHousehold();
    await must('setMemberRole', creator.token, { householdId, memberId: memberA.uid, role: 'admin' });
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await expectError(
      'moderateInstance',
      memberB.token,
      { householdId, instanceId: instance.id, verdict: 'not_done' },
      'permission-denied',
    );
    // The creator is another admin, so memberA cannot moderate their own completion.
    await expectError(
      'moderateInstance',
      memberA.token,
      { householdId, instanceId: instance.id, verdict: 'not_done' },
      'permission-denied',
    );
    // Past the window, nobody can.
    await backdateCompletions(householdId, instance.id, 73 * 60 * 60 * 1000);
    await expectError(
      'moderateInstance',
      creator.token,
      { householdId, instanceId: instance.id, verdict: 'not_done' },
      'failed-precondition',
    );
  });

  it('a revoked subtask can be completed again', async () => {
    const { creator, householdId, choreId, memberA } = await moderatedHousehold();
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('moderateInstance', creator.token, { householdId, instanceId: instance.id, verdict: 'not_done' });
    expect(await memberXp(householdId, memberA.uid)).toBe(0);
    const redone = await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    expect(redone.status).toBe('partial');
    expect(await memberXp(householdId, memberA.uid)).toBe(10);
  });
});

describe('undo after revocation (A3)', () => {
  it('a revoked completion cannot be undone, and a redo-undo never reverses the revoked rows twice', async () => {
    const creator = await withProfile('undo-mod', 'Alex');
    const { householdId, code } = await createHousehold(creator);
    const { choreId } = await must('saveChore', creator.token, {
      householdId,
      chore: choreInput({ subtasks: [{ id: 'one', name: 'One', xp: 10, position: 0 }], bonusXp: 5 }),
    });
    const member = await withProfile('undo-member', 'Sam');
    const reporter = await withProfile('undo-reporter', 'Bea');
    await must('joinHousehold', member.token, { code });
    await must('joinHousehold', reporter.token, { code });
    const instance = await nextOpenInstance(householdId, choreId);

    await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'one' });
    expect(await memberXp(householdId, member.uid)).toBe(15);
    await must('reportCompletion', reporter.token, { householdId, instanceId: instance.id });
    await must('resolveDispute', creator.token, { householdId, disputeId: instance.id, verdict: 'not_done' });
    expect(await memberXp(householdId, member.uid)).toBe(0);

    // The revoked completion is gone: nothing left to undo.
    await expectError('undoSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'one' }, 'not-found');

    // Completing again pays a new subtask row and a new bonus row.
    await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'one' });
    expect(await memberXp(householdId, member.uid)).toBe(15);
    await must('undoSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'one' });

    const rows = await ledgerFor(householdId, instance.id);
    const bonuses = rows.filter((row) => row.source === 'bonus');
    const revokeBonuses = rows.filter((row) => row.source === 'revoke-bonus');
    const undoBonuses = rows.filter((row) => row.source === 'undo-bonus');
    expect(bonuses.length).toBe(2);
    // Ledger queries have no guaranteed order, so match by target: each bonus row is
    // reversed exactly once — the first by the revocation, the redo's by the undo.
    const reversedByRevoke = revokeBonuses.map((row) => row.reversesEntryId);
    const reversedByUndo = undoBonuses.map((row) => row.reversesEntryId);
    expect(reversedByRevoke.length).toBe(1);
    expect(reversedByUndo.length).toBe(1);
    expect(reversedByRevoke[0]).not.toBe(reversedByUndo[0]);
    expect([...reversedByRevoke, ...reversedByUndo].sort()).toEqual(bonuses.map((row) => row.id).sort());
    expect(rows.reduce((sum, row) => sum + (row.amount as number), 0)).toBe(0);
    expect(await memberXp(householdId, member.uid)).toBe(0);
    const after = await instanceDoc(householdId, instance.id).get();
    expect(after.get('status')).toBe('open');
    expect(after.get('completions')).toEqual([]);
    expect((after.get('revocations') as unknown[]).length).toBe(1);
  });
});
