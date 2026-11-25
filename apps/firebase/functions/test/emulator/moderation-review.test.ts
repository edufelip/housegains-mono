import { FieldValue, Query, Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import { closeAllWeeks } from '../../src/scheduled';
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

// Review fixes for moderation (B2-B5): disputed instances survive chore edits, conflict checks span the
// dispute a direct verdict resolves, a verdict only touches the completions that were reported, and
// expiry never overwrites a concurrent resolve or trips over a missing instance.

const MONDAY_0300 = new Date('2026-11-23T03:00:00Z');
/** Before the fixed clock the close passes use, whatever today's date is. */
const PAST = Timestamp.fromDate(new Date('2026-11-04T00:00:00Z'));

interface Setup {
  creator: TestUser;
  memberA: TestUser;
  memberB: TestUser;
  memberC: TestUser;
  householdId: string;
  choreId: string;
}

/** A creator and three joined members with a three-subtask daily chore. */
async function setup(label: string): Promise<Setup> {
  const creator = await withProfile(`${label}-c`, 'Alex');
  const { householdId, code } = await createHousehold(creator);
  const { choreId } = await must('saveChore', creator.token, { householdId, chore: choreInput() });
  // Joins run one at a time: concurrent joinHousehold transactions on the same invite contend, and
  // the emulator answers that with "Transaction is invalid or closed" instead of a retryable abort.
  const joined: TestUser[] = [];
  for (const suffix of ['a', 'b', 'c']) {
    const user = await withProfile(`${label}-${suffix}`, `Member ${suffix}`);
    await must('joinHousehold', user.token, { code });
    joined.push(user);
  }
  const [memberA, memberB, memberC] = joined;
  return { creator, memberA, memberB, memberC, householdId, choreId };
}

const instanceDoc = (householdId: string, id: string) => adminDb().doc(`households/${householdId}/instances/${id}`);
const disputeDoc = (householdId: string, id: string) => adminDb().doc(`households/${householdId}/disputes/${id}`);

async function memberXp(householdId: string, uid: string) {
  return (await adminDb().doc(`households/${householdId}/members/${uid}`).get()).get('xp') as number;
}

async function ledgerFor(householdId: string, instanceId: string) {
  const snap = await adminDb().collection(`households/${householdId}/ledger`).where('instanceId', '==', instanceId).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Record<string, unknown> & { id: string });
}

describe('disputed and revoked instances survive chore edits (B2)', () => {
  it('a structural edit, a pause and a delete leave an instance with an open dispute alone', async () => {
    const { creator, memberA, memberB, householdId, choreId } = await setup('b2-keep');
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('reportCompletion', memberB.token, { householdId, instanceId: instance.id });
    // Undo within the 5-minute window: the instance is open again with no completions, but the dispute stays.
    await must('undoSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    const before = await instanceDoc(householdId, instance.id).get();
    expect(before.get('status')).toBe('open');
    expect(before.get('completions')).toEqual([]);
    expect(before.get('disputeStatus')).toBe('open');

    // Structural edit: every untouched future instance is regenerated, this one must not be.
    await must('saveChore', creator.token, {
      householdId,
      chore: { id: choreId, ...choreInput({ recurrence: 'every:2' }) },
    });
    expect((await instanceDoc(householdId, instance.id).get()).get('disputeStatus')).toBe('open');

    await must('setChoreActive', creator.token, { householdId, choreId, isActive: false });
    expect((await instanceDoc(householdId, instance.id).get()).get('disputeStatus')).toBe('open');

    await must('deleteChore', creator.token, { householdId, choreId });
    const after = await instanceDoc(householdId, instance.id).get();
    expect(after.exists).toBe(true);
    expect(after.get('disputeStatus')).toBe('open');
    expect((await disputeDoc(householdId, instance.id).get()).get('status')).toBe('open');
  });

  it('a structural edit keeps the revocations of an instance an admin moderated', async () => {
    const { creator, memberA, householdId, choreId } = await setup('b2-revoked');
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('moderateInstance', creator.token, { householdId, instanceId: instance.id, verdict: 'not_done' });
    const revoked = await instanceDoc(householdId, instance.id).get();
    expect(revoked.get('status')).toBe('open'); // open again, no completions: it used to look editable
    expect((revoked.get('revocations') as unknown[]).length).toBe(1);

    await must('saveChore', creator.token, {
      householdId,
      chore: { id: choreId, ...choreInput({ recurrence: 'every:2' }) },
    });
    const after = await instanceDoc(householdId, instance.id).get();
    expect(after.exists).toBe(true);
    expect((after.get('revocations') as unknown[]).length).toBe(1);
  });

  it('an untouched future instance is still rewritten by a structural edit', async () => {
    const { creator, householdId, choreId } = await setup('b2-plain');
    const instance = await nextOpenInstance(householdId, choreId);
    await instanceDoc(householdId, instance.id).update({ marker: 'old' });
    await must('saveChore', creator.token, {
      householdId,
      chore: { id: choreId, ...choreInput({ recurrence: 'every:2' }) },
    });
    const after = await instanceDoc(householdId, instance.id).get();
    // Regenerated ids differ by recurrence, so the old untouched instance is gone or replaced without the marker.
    expect(after.exists ? after.get('marker') : undefined).toBeUndefined();
  });
});

describe('resolveDispute when the instance is gone (B2)', () => {
  it('resolves the dispute without revocations instead of failing forever', async () => {
    const { creator, memberA, memberB, householdId, choreId } = await setup('b2-gone');
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('reportCompletion', memberB.token, { householdId, instanceId: instance.id });
    await instanceDoc(householdId, instance.id).delete(); // a dispute from before disputed instances were protected

    const resolved = await must('resolveDispute', creator.token, {
      householdId,
      disputeId: instance.id,
      verdict: 'not_done',
    });
    expect(resolved).toEqual({ disputeId: instance.id, verdict: 'not_done', revokedSubtaskIds: [] });
    const dispute = await disputeDoc(householdId, instance.id).get();
    expect(dispute.get('status')).toBe('resolved');
    expect(dispute.get('verdict')).toBe('not_done');
    expect(dispute.get('revokedSubtaskIds')).toEqual([]);
    expect((await instanceDoc(householdId, instance.id).get()).exists).toBe(false);
  });
});

describe('moderateInstance resolving an open dispute (B3)', () => {
  it('refuses a conflicted admin who revokes someone else\'s subtask to close the dispute about their own', async () => {
    const { creator, memberA, memberB, memberC, householdId, choreId } = await setup('b3-conflict');
    await must('setMemberRole', creator.token, { householdId, memberId: memberA.uid, role: 'admin' });
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('completeSubtask', memberB.token, { householdId, instanceId: instance.id, subtaskId: 'wipe' });
    // C reports A's own wash.
    await must('reportCompletion', memberC.token, { householdId, instanceId: instance.id, subtaskIds: ['wash'] });

    // A is an admin and the creator is another one: A may not judge a dispute about A's own wash,
    // not even by revoking B's wipe, which would resolve (and so close) that dispute.
    await expectError(
      'moderateInstance',
      memberA.token,
      { householdId, instanceId: instance.id, verdict: 'not_done', subtaskIds: ['wipe'] },
      'permission-denied',
    );
    expect((await disputeDoc(householdId, instance.id).get()).get('status')).toBe('open');
    expect(await memberXp(householdId, memberB.uid)).toBe(15);
    expect(await memberXp(householdId, memberA.uid)).toBe(10);
  });

  it('stamps the real dispute id on the revoke rows when it resolves an open dispute', async () => {
    const { creator, memberA, memberB, householdId, choreId } = await setup('b3-marker');
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('reportCompletion', memberB.token, { householdId, instanceId: instance.id });

    await must('moderateInstance', creator.token, { householdId, instanceId: instance.id, verdict: 'not_done' });
    const revoke = (await ledgerFor(householdId, instance.id)).find((row) => row.source === 'revoke-subtask')!;
    expect(revoke.moderation).toEqual({ actorUid: creator.uid, disputeId: instance.id, verdict: 'not_done' });
  });

  it('still stamps null when there is no open dispute', async () => {
    const { creator, memberA, householdId, choreId } = await setup('b3-null');
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('moderateInstance', creator.token, { householdId, instanceId: instance.id, verdict: 'not_done' });
    const revoke = (await ledgerFor(householdId, instance.id)).find((row) => row.source === 'revoke-subtask')!;
    expect(revoke.moderation).toEqual({ actorUid: creator.uid, disputeId: null, verdict: 'not_done' });
  });
});

describe('verdicts only touch the reported completions (B4)', () => {
  it('records the reported completion ids, as a union over reports', async () => {
    const { memberA, memberB, memberC, householdId, choreId } = await setup('b4-ids');
    const instance = await nextOpenInstance(householdId, choreId);
    const first = await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    const second = await must('completeSubtask', memberB.token, { householdId, instanceId: instance.id, subtaskId: 'wipe' });
    await must('reportCompletion', memberC.token, { householdId, instanceId: instance.id, subtaskIds: ['wash'] });
    expect((await disputeDoc(householdId, instance.id).get()).get('completionIds')).toEqual([first.completionId]);
    await must('reportCompletion', memberA.token, { householdId, instanceId: instance.id, subtaskIds: ['wipe'] });
    expect((await disputeDoc(householdId, instance.id).get()).get('completionIds')).toEqual([
      first.completionId,
      second.completionId,
    ]);
  });

  it('not_done does not revoke a completion somebody else made after the reported one was undone', async () => {
    const { creator, memberA, memberB, memberC, householdId, choreId } = await setup('b4-redo');
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('reportCompletion', memberB.token, { householdId, instanceId: instance.id });
    await must('undoSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    // C honestly does the wash after the undo.
    const redo = await must('completeSubtask', memberC.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });

    const resolved = await must('resolveDispute', creator.token, {
      householdId,
      disputeId: instance.id,
      verdict: 'not_done',
    });
    expect(resolved.revokedSubtaskIds).toEqual([]);
    expect(await memberXp(householdId, memberC.uid)).toBe(10);
    const after = await instanceDoc(householdId, instance.id).get();
    expect((after.get('completions') as { id: string; memberId: string }[]).map((c) => [c.id, c.memberId])).toEqual([
      [redo.completionId, memberC.uid],
    ]);
    expect(after.get('disputeStatus')).toBe('resolved');
    expect((await disputeDoc(householdId, instance.id).get()).get('status')).toBe('resolved');
    expect((await ledgerFor(householdId, instance.id)).filter((row) => row.source === 'revoke-subtask')).toEqual([]);
  });

  it('the conflict check follows the matched completion, not the subtask', async () => {
    const { creator, memberA, memberB, memberC, householdId, choreId } = await setup('b4-conflict');
    await must('setMemberRole', creator.token, { householdId, memberId: memberC.uid, role: 'admin' });
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('reportCompletion', memberB.token, { householdId, instanceId: instance.id });
    await must('undoSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('completeSubtask', memberC.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    // C (an admin) did the standing wash, but the reported completion was A's: C is not conflicted.
    const resolved = await must('resolveDispute', memberC.token, {
      householdId,
      disputeId: instance.id,
      verdict: 'not_done',
    });
    expect(resolved.revokedSubtaskIds).toEqual([]);
  });

  it('a dispute from before completion ids existed still revokes by subtask', async () => {
    const { creator, memberA, memberB, householdId, choreId } = await setup('b4-legacy');
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('reportCompletion', memberB.token, { householdId, instanceId: instance.id });
    await disputeDoc(householdId, instance.id).update({ completionIds: FieldValue.delete() });

    const resolved = await must('resolveDispute', creator.token, {
      householdId,
      disputeId: instance.id,
      verdict: 'not_done',
    });
    expect(resolved.revokedSubtaskIds).toEqual(['wash']);
    expect(await memberXp(householdId, memberA.uid)).toBe(0);
  });

  it('a second report on a legacy dispute records the ids of what it already disputed', async () => {
    const { memberA, memberB, memberC, householdId, choreId } = await setup('b4-legacy-union');
    const instance = await nextOpenInstance(householdId, choreId);
    const wash = await must('completeSubtask', memberA.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    const wipe = await must('completeSubtask', memberB.token, { householdId, instanceId: instance.id, subtaskId: 'wipe' });
    await must('reportCompletion', memberC.token, { householdId, instanceId: instance.id, subtaskIds: ['wash'] });
    await disputeDoc(householdId, instance.id).update({ completionIds: FieldValue.delete() });
    await must('reportCompletion', memberA.token, { householdId, instanceId: instance.id, subtaskIds: ['wipe'] });
    expect((await disputeDoc(householdId, instance.id).get()).get('completionIds')).toEqual([
      wash.completionId,
      wipe.completionId,
    ]);
  });
});

describe('dispute expiry (B2, B5)', () => {
  /** Opens a dispute on a fresh instance and pushes it past its window. */
  async function staleDispute(label: string) {
    const ctx = await setup(label);
    const instance = await nextOpenInstance(ctx.householdId, ctx.choreId);
    await must('completeSubtask', ctx.memberA.token, {
      householdId: ctx.householdId,
      instanceId: instance.id,
      subtaskId: 'wash',
    });
    await must('reportCompletion', ctx.memberB.token, { householdId: ctx.householdId, instanceId: instance.id });
    await disputeDoc(ctx.householdId, instance.id).update({ expiresAt: PAST });
    return { ...ctx, instance };
  }

  it('does not overwrite a dispute an admin resolved after the expiry query read it (B5)', async () => {
    const { householdId, instance } = await staleDispute('b5-race');
    const path = `households/${householdId}/disputes/${instance.id}`;
    const original = Query.prototype.get;
    // Resolve the dispute right after the expiry query returned it as open.
    const spy = vi.spyOn(Query.prototype, 'get').mockImplementation(async function (this: Query) {
      const snapshot = await original.call(this);
      if (snapshot.docs.some((doc) => doc.ref.path === path)) {
        await adminDb().doc(path).update({ status: 'resolved', verdict: 'done' });
        await instanceDoc(householdId, instance.id).update({ disputeStatus: 'resolved' });
      }
      return snapshot;
    });
    try {
      await closeAllWeeks(new Date('2026-11-23T02:00:00Z'));
    } finally {
      spy.mockRestore();
    }
    const dispute = await disputeDoc(householdId, instance.id).get();
    expect(dispute.get('status')).toBe('resolved');
    expect(dispute.get('verdict')).toBe('done');
    expect((await instanceDoc(householdId, instance.id).get()).get('disputeStatus')).toBe('resolved');
  });

  it('expires a dispute whose instance is gone and still expires the others (B2)', async () => {
    const { memberA, memberB, householdId, choreId, instance } = await staleDispute('b2-expire');
    // A second stale dispute on another instance of the same household.
    const [, second] = (
      await adminDb()
        .collection(`households/${householdId}/instances`)
        .where('choreId', '==', choreId)
        .where('status', '==', 'open')
        .orderBy('dueAt')
        .get()
    ).docs;
    await must('completeSubtask', memberA.token, { householdId, instanceId: second.id, subtaskId: 'wash' });
    await must('reportCompletion', memberB.token, { householdId, instanceId: second.id });
    await disputeDoc(householdId, second.id).update({ expiresAt: PAST });
    await instanceDoc(householdId, instance.id).delete();

    await closeAllWeeks(new Date('2026-11-23T02:00:00Z'));

    expect((await disputeDoc(householdId, instance.id).get()).get('status')).toBe('expired');
    expect((await disputeDoc(householdId, second.id).get()).get('status')).toBe('expired');
    expect((await instanceDoc(householdId, second.id).get()).get('disputeStatus')).toBe('expired');
  });

  it('a week still closes when a dispute of the household has no instance (B2)', async () => {
    const { householdId, instance } = await staleDispute('b2-close');
    await instanceDoc(householdId, instance.id).delete();
    await closeAllWeeks(MONDAY_0300);
    expect((await adminDb().doc(`households/${householdId}/weeks/2026-11-16`).get()).exists).toBe(true);
    expect((await disputeDoc(householdId, instance.id).get()).get('status')).toBe('expired');
  });
});
