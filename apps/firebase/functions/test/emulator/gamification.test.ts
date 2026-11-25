import { Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { replayGamiLedgerRow } from '../../src/gamification/trigger';
import {
  adminDb,
  choreInput,
  createHousehold,
  expectError,
  must,
  withProfile,
} from './helpers';
import {
  burnWelcome,
  gamiHousehold,
  inboxOf,
  nextOpenInstance,
  openInstances,
  organizerLedger,
  resetGamiConfig,
  serverEvents,
  setGamiConfig,
  sum,
  waitFor,
  walletLedger,
  walletOf,
  xpRows,
} from './gami-helpers';

// The Part C wiring (contract C1-C9) end to end: Cloud Functions + Firestore emulators,
// real callables, the real safety-net trigger. The program is always on; tests that need a
// published rule set write gamification/config themselves and it is removed around every test.

afterAll(resetGamiConfig);
beforeEach(resetGamiConfig);

const ONE_SUBTASK = { subtasks: [{ id: 'wash', name: 'Wash', xp: 10, position: 0 }], bonusXp: 0 };

function parts(toast: { parts?: Array<{ ruleId: string; amount: number }> }) {
  return Object.fromEntries((toast.parts ?? []).map((part) => [part.ruleId, part.amount]));
}

async function memberDoc(householdId: string, uid: string) {
  return (await adminDb().doc(`households/${householdId}/members/${uid}`).get()).data() as Record<string, any>;
}

describe('always on (C1)', () => {
  it('with no gamification/config doc, a household is paid live: celebrations with parts, the rest in the inbox', async () => {
    expect((await adminDb().doc('gamification/config').get()).exists).toBe(false);
    const { member, creator, householdId, choreId } = await gamiHousehold('live', {}, { assign: 'creator' });
    await burnWelcome(member.uid);
    const instance = await nextOpenInstance(householdId, choreId);
    const result = await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });

    // The member is not an assignee: subtask (10 XP) plus the 5-Ganhos assist.
    expect(result.celebrations).toHaveLength(1);
    const [toast] = result.celebrations;
    expect(toast).toMatchObject({ moment: 'toast', track: 'ganhos', amount: 15 });
    expect(parts(toast)).toEqual({ 'earn.subtask': 10, 'earn.assist': 5 });

    const wallet = (await walletOf(member.uid))!;
    expect(wallet.balance).toBe(15);
    expect(wallet.stats).toMatchObject({ assists: 1, credits: 1 });

    // The creator's Zelo toast is not the caller's: it waits in the creator's inbox.
    const inbox = await inboxOf(creator.uid);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ track: 'zelo', amount: 5, seen: false });
    expect(await inboxOf(member.uid)).toEqual([]);
    expect((await serverEvents(householdId, 'gami_earned')).length).toBeGreaterThan(0);
  });

  it('writes ledgers, projections and the Zelo organizer without any cohort bookkeeping on the household', async () => {
    const { member, creator, householdId, choreId } = await gamiHousehold('always');
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });

    const rows = await xpRows(householdId, instance.id);
    const rowId = rows[0].id;
    const ledger = await walletLedger(member.uid);
    expect(ledger[`earn.subtask:${rowId}:${member.uid}`]).toMatchObject({ amount: 10, track: 'ganhos', memberId: member.uid });
    expect(ledger[`earn.welcome:${rowId}:${member.uid}`]).toMatchObject({ amount: 50 });
    expect(await walletOf(member.uid)).toMatchObject({ balance: 60, lifetimeEarned: 60, xpPeak: 10 });

    const zelo = await organizerLedger(householdId);
    expect(zelo[`zelo.chore_done:${choreId}:${creator.uid}`]).toMatchObject({ amount: 5, track: 'zelo' });

    const household = (await adminDb().doc(`households/${householdId}`).get()).data()!;
    expect(household).not.toHaveProperty('gamificationCohort');
  });

  it('an invalid published rule set falls back to the built-in defaults', async () => {
    await adminDb().doc('gamification/ruleSets/items/7').set({ status: 'published', rules: { schemaVersion: 99 } });
    await setGamiConfig({ activeVersion: 7 });
    const { member, householdId, choreId } = await gamiHousehold('badrules');
    await burnWelcome(member.uid);
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    const ledger = await walletLedger(member.uid);
    const earn = Object.values(ledger).find((row) => row.ruleId === 'earn.subtask')!;
    expect(earn.amount).toBe(10);
    expect(earn.ruleSetVersion).toBeNull();
    await adminDb().doc('gamification/ruleSets/items/7').delete();
  });
});

describe('xpPeak and levelFloor (C3)', () => {
  it('new members start at xpPeak 0 / levelFloor 1; xpPeak rises with xp and never falls on undo', async () => {
    const { member, creator, householdId, choreId } = await gamiHousehold('peak');
    expect(await memberDoc(householdId, member.uid)).toMatchObject({ xp: 0, xpPeak: 0, levelFloor: 1 });
    expect(await memberDoc(householdId, creator.uid)).toMatchObject({ xpPeak: 0, levelFloor: 1 });

    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    expect(await memberDoc(householdId, member.uid)).toMatchObject({ xp: 10, xpPeak: 10 });

    await must('undoSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    expect(await memberDoc(householdId, member.uid)).toMatchObject({ xp: 0, xpPeak: 10 });
    expect((await walletOf(member.uid))!.xpPeak).toBe(10);
  });
});

describe('clawbacks (C4)', () => {
  it('undo claws back exactly what was paid, assist included', async () => {
    const { member, householdId, choreId } = await gamiHousehold('undo', {}, { assign: 'creator' });
    await burnWelcome(member.uid);
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    expect((await walletOf(member.uid))!.balance).toBe(15);

    await must('undoSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    const wallet = (await walletOf(member.uid))!;
    expect(wallet).toMatchObject({ balance: 0, lifetimeEarned: 0 });
    expect(wallet.stats).toMatchObject({ credits: 0, assists: 0 });
    const ledger = await walletLedger(member.uid);
    const reversals = Object.values(ledger).filter((row) => row.amount < 0);
    expect(reversals.map((row) => row.amount).sort()).toEqual([-10, -5]);
    expect(sum(Object.values(ledger).map((row) => row.amount))).toBe(0);
    for (const row of reversals) expect(row.reversesEntryId).toMatch(/^earn\./);
    expect((await serverEvents(householdId, 'gami_clawback')).length).toBeGreaterThan(0);
  });

  it('an admin verdict (moderateInstance partial) claws back only the revoked subtask', async () => {
    const { member, creator, householdId, choreId } = await gamiHousehold('revoke');
    await burnWelcome(member.uid);
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wipe' });
    expect((await walletOf(member.uid))!.balance).toBe(25);

    await must('moderateInstance', creator.token, {
      householdId,
      instanceId: instance.id,
      verdict: 'partial',
      subtaskIds: ['wash'],
    });
    const wallet = (await walletOf(member.uid))!;
    expect(wallet.balance).toBe(15);
    expect(wallet.stats.credits).toBe(1);
    const reversals = Object.values(await walletLedger(member.uid)).filter((row) => row.amount < 0);
    expect(reversals).toHaveLength(1);
    expect(reversals[0]).toMatchObject({ amount: -10 });
  });

  it('resolveDispute not_done claws back every disputed credit, bonus included', async () => {
    const { member, creator, householdId, choreId } = await gamiHousehold('dispute', ONE_SUBTASK);
    const reporter = await withProfile('dispute-r', 'Bea');
    await must('joinHousehold', reporter.token, { code: (await adminDb().doc(`households/${householdId}/meta/invite`).get()).get('code') });
    await burnWelcome(member.uid);
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    expect((await walletOf(member.uid))!.balance).toBe(10);

    await must('reportCompletion', reporter.token, { householdId, instanceId: instance.id, reason: 'not done' });
    await must('resolveDispute', creator.token, { householdId, disputeId: instance.id, verdict: 'not_done' });
    expect(await walletOf(member.uid)).toMatchObject({ balance: 0, lifetimeEarned: 0 });
  });

  it('revoking an on-time completion also reverses the on_time earn', async () => {
    const { member, creator, householdId, choreId } = await gamiHousehold('ontime', ONE_SUBTASK, { assign: 'member' });
    await burnWelcome(member.uid);
    const instance = await nextOpenInstance(householdId, choreId);
    const result = await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    expect(result.status).toBe('done');
    // Subtask 10 + on-time 10, as two toasts for the member.
    const amounts = result.celebrations.map((toast: { amount: number }) => toast.amount).sort((a: number, b: number) => a - b);
    expect(amounts).toEqual([10, 10]);
    const wallet = (await walletOf(member.uid))!;
    expect(wallet).toMatchObject({ balance: 20 });
    expect(wallet.stats).toMatchObject({ onTime: 1, finals: 1 });
    const onTimeKey = Object.keys(await walletLedger(member.uid)).find((key) => key.startsWith('earn.on_time:'))!;
    expect(onTimeKey).toContain(`${instance.id}|`);

    await must('moderateInstance', creator.token, { householdId, instanceId: instance.id, verdict: 'not_done' });
    const after = (await walletOf(member.uid))!;
    expect(after).toMatchObject({ balance: 0, lifetimeEarned: 0 });
    expect(after.stats).toMatchObject({ onTime: 0, finals: 0, credits: 0 });
    expect((await walletLedger(member.uid))[`rev:${onTimeKey}`]).toMatchObject({ amount: -10, reversesEntryId: onTimeKey });
  });

  it('undo of the finishing subtask reopens the instance and reverses on_time for every paid assignee', async () => {
    const { member, creator, householdId, choreId } = await gamiHousehold('ontime2', ONE_SUBTASK, {});
    // Assign both: both must have contributed to be paid, so the member finishes alone and only they are paid.
    await must('saveChore', creator.token, {
      householdId,
      chore: choreInput({ ...ONE_SUBTASK, id: choreId, assigneeIds: [member.uid, creator.uid] }),
    });
    await adminDb().doc(`households/${householdId}/chores/${choreId}`).update({ updatedAt: Timestamp.fromMillis(Date.now() - 3 * 86_400_000) });
    await burnWelcome(member.uid);
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    expect((await walletOf(member.uid))!.balance).toBe(20);
    await must('undoSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    expect(await walletOf(member.uid)).toMatchObject({ balance: 0 });
    const reversals = Object.values(await walletLedger(member.uid)).filter((row) => row.amount < 0);
    expect(reversals.map((row) => row.amount).sort()).toEqual([-10, -10]);
  });
});

describe('caps and idempotency (C4, C8)', () => {
  it('the 400 daily Ganhos cap holds across separate calls', async () => {
    const big = { subtasks: [{ id: 'big', name: 'Big', xp: 100, position: 0 }], bonusXp: 0 };
    const { member, householdId, choreId } = await gamiHousehold('cap', big);
    await burnWelcome(member.uid);
    const instances = await openInstances(householdId, choreId, 5);
    expect(instances).toHaveLength(5);
    const responses = [];
    for (const instance of instances) {
      responses.push(await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'big' }));
    }
    // XP is never capped; Ganhos stop at 400 for the (UTC) day.
    const toasts = (r: { celebrations: Array<{ moment: string }> }) => r.celebrations.filter((c) => c.moment === 'toast').length;
    expect(responses.map(toasts)).toEqual([1, 1, 1, 1, 0]);
    // Level-ups ride along: 100 XP reaches level 2 and 300 level 3 (level 4 needs 600; XP keeps counting past the cap).
    const levels = responses.flatMap((r) => r.celebrations.filter((c: { moment: string }) => c.moment === 'level').map((c: { level: number }) => c.level));
    expect(levels).toEqual([2, 3]);
    expect((await walletOf(member.uid))!.balance).toBe(400);
    expect((await memberDoc(householdId, member.uid)).xp).toBe(500);
  });

  it('the callable and the safety-net trigger never double-pay; replaying the trigger is a no-op', async () => {
    const { member, householdId, choreId } = await gamiHousehold('idem', ONE_SUBTASK);
    await burnWelcome(member.uid);
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    const before = await walletLedger(member.uid);
    const balance = (await walletOf(member.uid))!.balance;
    expect(balance).toBe(10);

    // The callable marked its XP rows processed, so the trigger skips them.
    const rows = await xpRows(householdId, instance.id);
    for (const row of rows) {
      expect((await adminDb().doc(`households/${householdId}/gamiProcessed/${row.id}`).get()).exists).toBe(true);
    }

    // Even without the markers the deterministic keys make a replay a no-op (create-only rows, same projection).
    const walletBefore = await walletOf(member.uid);
    for (const row of rows) {
      await adminDb().doc(`households/${householdId}/gamiProcessed/${row.id}`).delete();
      await replayGamiLedgerRow((await adminDb().doc(`households/${householdId}/ledger/${row.id}`).get()) as QueryDocumentSnapshot);
    }
    expect(await walletLedger(member.uid)).toEqual(before);
    expect(await walletOf(member.uid)).toEqual(walletBefore);

    // Let the real trigger (3 s grace) run as well.
    await new Promise((resolve) => setTimeout(resolve, 6_000));
    expect(await walletLedger(member.uid)).toEqual(before);
    expect((await walletOf(member.uid))!.balance).toBe(balance);
  }, 30_000);

  it('two simultaneous completions by one member both land (no lost update on the wallet)', async () => {
    const { member, householdId, choreId } = await gamiHousehold('race');
    await burnWelcome(member.uid);
    const instance = await nextOpenInstance(householdId, choreId);
    const results = await Promise.all(
      ['wash', 'wipe', 'trash'].map((subtaskId) => must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId })),
    );
    expect(results).toHaveLength(3);
    const wallet = (await walletOf(member.uid))!;
    // 10 + 15 + 5 for the subtasks, 5 more for the bonus the last one unlocks.
    expect(wallet.balance).toBe(35);
    expect(wallet.stats.credits).toBe(3);
    expect(sum(Object.values(await walletLedger(member.uid)).map((row) => row.amount))).toBe(35);
  }, 60_000);

  it('the trigger pays a row whose callable run never happened, once', async () => {
    const { member, householdId, choreId } = await gamiHousehold('safety', ONE_SUBTASK);
    await burnWelcome(member.uid);
    const instance = await nextOpenInstance(householdId, choreId);
    // Simulate a crashed post-transaction run: the XP transaction committed, the engine never ran.
    const at = Timestamp.now();
    await adminDb().doc(`households/${householdId}/instances/${instance.id}`).update({
      status: 'done',
      completions: [
        { id: 'c1', instanceId: instance.id, subtaskId: 'wash', memberId: member.uid, xp: 10, completedAt: at, isAssist: false },
      ],
    });
    const row = await adminDb().collection(`households/${householdId}/ledger`).add({
      instanceId: instance.id,
      subtaskId: 'wash',
      memberId: member.uid,
      amount: 10,
      source: 'subtask',
      createdAt: at,
    });
    const key = `earn.subtask:${row.id}:${member.uid}`;
    const paid = await waitFor(async () => (await walletLedger(member.uid))[key]);
    expect(paid.amount).toBe(10);
    const ledger = await walletLedger(member.uid);
    // The replay also pays the closing on_time (assigneeIds is empty, so nobody qualifies): just the subtask.
    expect(Object.keys(ledger)).toEqual([key]);

    // Replaying again changes nothing.
    await replayGamiLedgerRow(await row.get() as QueryDocumentSnapshot);
    expect(await walletLedger(member.uid)).toEqual(ledger);
    expect((await walletOf(member.uid))!.balance).toBe(10);
  }, 40_000);

  it('does not pay a row for a completion that was undone before the trigger ran', async () => {
    const { member, householdId, choreId } = await gamiHousehold('undone', ONE_SUBTASK);
    await burnWelcome(member.uid);
    const instance = await nextOpenInstance(householdId, choreId);
    const row = await adminDb().collection(`households/${householdId}/ledger`).add({
      instanceId: instance.id,
      subtaskId: 'wash',
      memberId: member.uid,
      amount: 10,
      source: 'subtask',
      createdAt: Timestamp.now(),
    });
    // The instance has no matching completion (it was undone): the replay must skip the row.
    await replayGamiLedgerRow(await row.get() as QueryDocumentSnapshot);
    expect(await walletLedger(member.uid)).toEqual({});
  });
});

describe('feed.post and the welcome bonus (C4)', () => {
  it('a share earns 2 once a day, and only once per post', async () => {
    const { member, householdId, choreId } = await gamiHousehold('feed', { ...ONE_SUBTASK, recurrence: 'daily' });
    await burnWelcome(member.uid);
    const [first, second] = await openInstances(householdId, choreId, 2);
    for (const instance of [first, second]) {
      await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    }
    const before = (await walletOf(member.uid))!.balance;

    const posted = await must('postCompletion', member.token, { householdId, instanceId: first.id });
    expect(posted).toMatchObject({ created: true });
    expect(posted.celebrations).toHaveLength(1);
    expect(posted.celebrations[0]).toMatchObject({ amount: 2, track: 'ganhos' });
    expect((await walletOf(member.uid))!.balance).toBe(before + 2);

    // Same post again, and a second post the same day: no more Ganhos.
    const again = await must('postCompletion', member.token, { householdId, instanceId: first.id });
    expect(again).toMatchObject({ created: false, celebrations: [] });
    const other = await must('postCompletion', member.token, { householdId, instanceId: second.id });
    expect(other).toMatchObject({ created: true, celebrations: [] });
    expect((await walletOf(member.uid))!.balance).toBe(before + 2);
  });

  it('the welcome bonus is paid once per user, even after leaving and joining another household', async () => {
    const first = await gamiHousehold('welcome1', ONE_SUBTASK);
    const instance = await nextOpenInstance(first.householdId, first.choreId);
    const result = await must('completeSubtask', first.member.token, {
      householdId: first.householdId,
      instanceId: instance.id,
      subtaskId: 'wash',
    });
    expect(parts(result.celebrations[0])).toEqual({ 'earn.subtask': 10, 'earn.welcome': 50 });
    expect((await walletOf(first.member.uid))!.balance).toBe(60);

    await must('leaveHousehold', first.member.token, { householdId: first.householdId });
    const second = await gamiHousehold('welcome2', ONE_SUBTASK);
    await must('joinHousehold', first.member.token, { code: second.code });
    const next = await nextOpenInstance(second.householdId, second.choreId);
    const again = await must('completeSubtask', first.member.token, {
      householdId: second.householdId,
      instanceId: next.id,
      subtaskId: 'wash',
    });
    expect(parts(again.celebrations[0])).toEqual({ 'earn.subtask': 10 });
    const ledger = await walletLedger(first.member.uid);
    expect(Object.keys(ledger).filter((key) => key.startsWith('earn.welcome:'))).toHaveLength(1);
    expect((await walletOf(first.member.uid))!.balance).toBe(70);
  });
});

describe('Zelo (C5)', () => {
  it('finishSetup pays the creator 50 once, queued in their inbox', async () => {
    const creator = await withProfile('zelo-c', 'Alex');
    const { householdId } = await createHousehold(creator);
    const response = await must('finishSetup', creator.token, { householdId });
    expect(response).toEqual({ ok: true });
    await must('finishSetup', creator.token, { householdId });

    const zelo = await organizerLedger(householdId);
    expect(Object.keys(zelo)).toEqual([`zelo.setup:setup:${creator.uid}`]);
    expect(zelo[`zelo.setup:setup:${creator.uid}`]).toMatchObject({ amount: 50, track: 'zelo' });
    const organizer = (await adminDb().doc(`households/${householdId}/organizer/${creator.uid}`).get()).data()!;
    expect(organizer).toMatchObject({ zelo: 50, lifetimeZelo: 50 });
    const inbox = await inboxOf(creator.uid);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ track: 'zelo', amount: 50 });
  });

  it('chore_done pays once per chore and is reversed when the chore is deleted', async () => {
    const { member, creator, householdId, choreId } = await gamiHousehold('choredone', { ...ONE_SUBTASK, recurrence: 'daily' });
    const [first, second] = await openInstances(householdId, choreId, 2);
    await must('completeSubtask', member.token, { householdId, instanceId: first.id, subtaskId: 'wash' });
    await must('completeSubtask', member.token, { householdId, instanceId: second.id, subtaskId: 'wash' });
    const key = `zelo.chore_done:${choreId}:${creator.uid}`;
    let zelo = await organizerLedger(householdId);
    expect(Object.keys(zelo).filter((k) => k.startsWith('zelo.chore_done:'))).toEqual([key]);

    await must('deleteChore', creator.token, { householdId, choreId });
    zelo = await organizerLedger(householdId);
    expect(zelo[`rev:${key}`]).toMatchObject({ amount: -5, reversesEntryId: key });
    const organizer = (await adminDb().doc(`households/${householdId}/organizer/${creator.uid}`).get()).data()!;
    expect(organizer.zelo).toBe(0);
  });

  it('member_activated pays when a joined member credits 3 subtasks, reversed if they are removed', async () => {
    const { member, creator, householdId, choreId } = await gamiHousehold('activated', {
      subtasks: [
        { id: 'a', name: 'A', xp: 5, position: 0 },
        { id: 'b', name: 'B', xp: 5, position: 1 },
        { id: 'c', name: 'C', xp: 5, position: 2 },
      ],
      bonusXp: 0,
    });
    const instance = await nextOpenInstance(householdId, choreId);
    for (const subtaskId of ['a', 'b', 'c']) {
      await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId });
    }
    const key = `zelo.member_activated:${member.uid}:${creator.uid}`;
    expect((await organizerLedger(householdId))[key]).toMatchObject({ amount: 40 });

    await must('removeMember', creator.token, { householdId, uid: member.uid });
    expect((await organizerLedger(householdId))[`rev:${key}`]).toMatchObject({ amount: -40 });
  });
});

describe('integrity alerts (C9)', () => {
  it('writes a velocity alert after more than 12 credits in 10 minutes, and never claws back', async () => {
    const subtasks = Array.from({ length: 12 }, (_, index) => ({ id: `s${index}`, name: `S${index}`, xp: 1, position: index }));
    const { member, householdId, choreId } = await gamiHousehold('velocity', { subtasks, bonusXp: 0, recurrence: 'daily' });
    await burnWelcome(member.uid);
    const [first, second] = await openInstances(householdId, choreId, 2);
    // 12 credits on one instance plus a 13th on the next: more than 12 in ten minutes.
    for (const subtask of subtasks) {
      await must('completeSubtask', member.token, { householdId, instanceId: first.id, subtaskId: subtask.id });
    }
    await must('completeSubtask', member.token, { householdId, instanceId: second.id, subtaskId: 's0' });
    const alerts = await adminDb().collection('gamification/alerts/items').where('memberId', '==', member.uid).get();
    expect(alerts.docs.map((doc) => doc.get('kind'))).toContain('velocity');
    expect(Object.values(await walletLedger(member.uid)).filter((row) => row.amount < 0)).toEqual([]);
  }, 60_000);
});

describe('chore metadata (C4, C9)', () => {
  it('stamps createdAt/updatedAt/createdBy, keeps the catalog id, and marks XP raises', async () => {
    const creator = await withProfile('meta-c', 'Alex');
    const { householdId } = await createHousehold(creator);
    const { choreId } = await must('saveChore', creator.token, {
      householdId,
      chore: choreInput({ ...ONE_SUBTASK, catalogId: 'catalog-kitchen' }),
    });
    const choreRef = adminDb().doc(`households/${householdId}/chores/${choreId}`);
    let chore = (await choreRef.get()).data()!;
    expect(chore).toMatchObject({ catalogId: 'catalog-kitchen', createdBy: creator.uid, xpRaisedAt: null });
    const createdAt = chore.createdAt.toMillis();
    expect(chore.updatedAt).toBeInstanceOf(Timestamp);

    // Raising the XP marks the chore; the creator then completing it within 48 h is a C9 alert (never a clawback).
    await must('saveChore', creator.token, {
      householdId,
      chore: choreInput({ id: choreId, catalogId: 'catalog-kitchen', subtasks: [{ id: 'wash', name: 'Wash', xp: 20, position: 0 }], bonusXp: 0 }),
    });
    chore = (await choreRef.get()).data()!;
    expect(chore.xpRaisedAt).toBeInstanceOf(Timestamp);
    expect(chore.createdAt.toMillis()).toBe(createdAt);
    expect(chore.createdBy).toBe(creator.uid);

    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', creator.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    const alerts = await adminDb().collection('gamification/alerts/items').where('householdId', '==', householdId).get();
    expect(alerts.docs.map((doc) => doc.get('kind'))).toEqual(['chore-xp-raise']);

    // A later edit that raises nothing clears the mark.
    await must('saveChore', creator.token, {
      householdId,
      chore: choreInput({ id: choreId, catalogId: 'catalog-kitchen', name: 'Renamed', subtasks: [{ id: 'wash', name: 'Wash', xp: 20, position: 0 }], bonusXp: 0 }),
    });
    expect((await choreRef.get()).get('xpRaisedAt')).toBeNull();
  });
});

describe('ackCelebrations (C8)', () => {
  it('marks only the caller\'s inbox rows as seen and rejects bad input', async () => {
    const creator = await withProfile('ack-c', 'Alex');
    const stranger = await withProfile('ack-s', 'Eve');
    const { householdId } = await createHousehold(creator);
    await must('finishSetup', creator.token, { householdId });
    const [row] = await inboxOf(creator.uid);
    expect(row.seen).toBe(false);

    const strangerAck = await must('ackCelebrations', stranger.token, { ids: [row.id] });
    expect(strangerAck).toMatchObject({ acknowledged: 0 });
    expect((await inboxOf(creator.uid))[0].seen).toBe(false);

    const ack = await must('ackCelebrations', creator.token, { ids: [row.id, 'unknown'] });
    expect(ack).toMatchObject({ ok: true, acknowledged: 1 });
    expect((await inboxOf(creator.uid))[0].seen).toBe(true);

    await expectError('ackCelebrations', creator.token, { ids: [] }, 'invalid-argument');
    await expectError('ackCelebrations', creator.token, { ids: Array.from({ length: 51 }, (_, i) => `id${i}`) }, 'invalid-argument');
    await expectError('ackCelebrations', creator.token, { ids: [7] }, 'invalid-argument');
    await expectError('ackCelebrations', null, { ids: ['x'] }, 'unauthenticated');
  });
});

describe('setAwayWeeks (C7)', () => {
  /** The next `count` Mondays strictly after today (UTC household). */
  function futureMondays(count: number, skip = 0): string[] {
    const cursor = new Date();
    cursor.setUTCHours(0, 0, 0, 0);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    while (cursor.getUTCDay() !== 1) cursor.setUTCDate(cursor.getUTCDate() + 1);
    cursor.setUTCDate(cursor.getUTCDate() + 7 * skip);
    return Array.from({ length: count }, (_, index) => {
      const next = new Date(cursor.getTime() + index * 7 * 86_400_000);
      return next.toISOString().slice(0, 10);
    });
  }

  it('stores future Mondays on the wallet and replaces the future list', async () => {
    const { member, householdId } = await gamiHousehold('away1');
    const [a, b] = futureMondays(2);
    const stored = await must('setAwayWeeks', member.token, { householdId, weekStarts: [b, a] });
    expect(stored).toEqual({ weekStarts: [a, b] });
    expect((await walletOf(member.uid))!.streak.awayWeeks).toEqual([a, b]);

    // The household is optional: the caller's own household is used.
    const replaced = await must('setAwayWeeks', member.token, { weekStarts: [b] });
    expect(replaced).toEqual({ weekStarts: [b] });
    expect((await walletOf(member.uid))!.streak.awayWeeks).toEqual([b]);
    expect((await must('setAwayWeeks', member.token, { householdId, weekStarts: [] })).weekStarts).toEqual([]);
  });

  it('rejects non-Mondays, past weeks, non-members and more than 3 per calendar year', async () => {
    const { member, householdId } = await gamiHousehold('away2');
    const stranger = await withProfile('away-x', 'Eve');
    const [monday] = futureMondays(1);
    const tuesday = new Date(Date.parse(monday) + 86_400_000).toISOString().slice(0, 10);
    await expectError('setAwayWeeks', member.token, { householdId, weekStarts: [tuesday] }, 'invalid-argument');
    await expectError('setAwayWeeks', member.token, { householdId, weekStarts: ['not-a-date'] }, 'invalid-argument');
    await expectError('setAwayWeeks', member.token, { householdId, weekStarts: 'x' }, 'invalid-argument');
    await expectError('setAwayWeeks', member.token, { householdId, weekStarts: ['2020-01-06'] }, 'failed-precondition');
    await expectError('setAwayWeeks', stranger.token, { householdId, weekStarts: [monday] }, 'permission-denied');

    // Four Mondays inside one calendar year are too many; spread across the year boundary they are fine.
    const same = [0, 1, 2, 3].map((index) => `2099-01-${String(5 + index * 7).padStart(2, '0')}`);
    await expectError('setAwayWeeks', member.token, { householdId, weekStarts: same }, 'failed-precondition');
    const split = ['2098-12-15', '2098-12-22', '2098-12-29', '2099-01-05'];
    await must('setAwayWeeks', member.token, { householdId, weekStarts: split });
  });
});

describe('deleteAccount (C9)', () => {
  it('removes the wallet, its ledger and the inbox; Zelo rows stay', async () => {
    const { member, creator, householdId, choreId } = await gamiHousehold('del', ONE_SUBTASK);
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await adminDb().doc(`users/${member.uid}/inbox/seed`).set({ id: 'seed', seen: false });
    expect(await walletOf(member.uid)).not.toBeNull();
    expect(Object.keys(await walletLedger(member.uid)).length).toBeGreaterThan(0);

    await must('deleteAccount', member.token, {});
    expect(await walletOf(member.uid)).toBeNull();
    expect(await walletLedger(member.uid)).toEqual({});
    expect(await inboxOf(member.uid)).toEqual([]);
    expect(Object.keys(await organizerLedger(householdId)).some((key) => key.startsWith('zelo.chore_done:'))).toBe(true);
    expect(creator.uid).toBeTruthy();
  });
});
