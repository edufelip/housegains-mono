import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULE_SET, type RuleSet } from '../../src/domain/gamification';
import { adminAuth, adminDb, callFn, expectError, must, newUser, type TestUser } from './helpers';
import {
  LIVE,
  burnWelcome,
  gamiHousehold,
  nextOpenInstance,
  resetGamiConfig,
  setGamiConfig,
  walletLedger,
  walletOf,
} from './gami-helpers';

// The 13 admin callables of the gamification back office (contract C10) against the Auth, Firestore and
// Functions emulators: real custom claims on real ID tokens, real engine runs.

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;

/** A user whose ID token carries `admin: true` (the claim is set, then a fresh token is minted). */
async function adminUser(label: string): Promise<TestUser> {
  const email = `${label}-${randomUUID()}@example.test`;
  const password = 'correct-horse-battery';
  const base = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts`;
  const post = async (path: string, body: object) =>
    (await (await fetch(`${base}:${path}?key=fake-api-key`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })).json()) as { localId: string; idToken: string };
  const created = await post('signUp', { email, password, returnSecureToken: true });
  await adminAuth().setCustomUserClaims(created.localId, { admin: true });
  const signedIn = await post('signInWithPassword', { email, password, returnSecureToken: true });
  return { uid: signedIn.localId, token: signedIn.idToken };
}

async function clearCollection(path: string): Promise<void> {
  await adminDb().recursiveDelete(adminDb().collection(path));
}

async function resetAdminState(): Promise<void> {
  await resetGamiConfig();
  for (const path of ['ruleSets', 'alerts', 'audit', 'adjustments']) await clearCollection(`gamification/${path}/items`);
}

async function auditRows(action: string) {
  const snap = await adminDb().collection('gamification/audit/items').where('action', '==', action).get();
  return snap.docs.map((doc) => doc.data());
}

/** A rule set that pays `perXp` Ganhos per subtask XP instead of the default 1. */
function rulesWithSubtaskRate(perXp: number): RuleSet {
  const rules = structuredClone(DEFAULT_RULE_SET);
  const rule = rules.earnRules.find((entry) => entry.id === 'earn.subtask');
  if (rule === undefined) throw new Error('DEFAULT_RULE_SET has no earn.subtask');
  rule.award.amount = perXp;
  return rules;
}

let admin: TestUser;
let admin2: TestUser;
let plain: TestUser;

beforeAll(async () => {
  admin = await adminUser('admin1');
  admin2 = await adminUser('admin2');
  plain = await newUser('plain');
});
afterAll(resetAdminState);
beforeEach(resetAdminState);

const CALLABLES: Array<[string, unknown]> = [
  ['adminGetConfig', {}],
  ['adminSetConfig', { mode: 'shadow', livePercent: 10, controlPercent: 10 }],
  ['adminListRuleSets', {}],
  ['adminSaveDraft', { notes: 'x', rules: DEFAULT_RULE_SET }],
  ['adminPublish', { version: 1 }],
  ['adminRollback', {}],
  ['adminSimulate', { rules: DEFAULT_RULE_SET, days: 1 }],
  ['adminLookupUser', { uid: 'someone' }],
  ['adminAdjust', { uid: 'someone', amount: 5, reasonCode: 'correction', note: 'x' }],
  ['adminApproveAdjustment', { id: 'nope' }],
  ['adminListAlerts', {}],
  ['adminRebuildWallet', { uid: 'someone' }],
  ['adminBackfillLevelFloors', {}],
];

describe('access control', () => {
  it.each(CALLABLES)('%s rejects a signed-in user without the admin claim', async (name, payload) => {
    await expectError(name, plain.token, payload, 'permission-denied');
  });

  it.each(CALLABLES)('%s rejects an anonymous caller', async (name, payload) => {
    await expectError(name, null, payload, 'unauthenticated');
  });

  it('a denied mutation changes and audits nothing', async () => {
    await expectError('adminSetConfig', plain.token, { mode: 'live', livePercent: 100, controlPercent: 0 }, 'permission-denied');
    expect((await adminDb().doc('gamification/config').get()).exists).toBe(false);
    expect((await adminDb().collection('gamification/audit/items').get()).size).toBe(0);
  });
});

describe('config', () => {
  it('reads a missing config as off', async () => {
    expect(await must('adminGetConfig', admin.token, {})).toEqual({
      mode: 'off',
      activeVersion: null,
      previousVersion: null,
      cohortSalt: '',
      livePercent: 0,
      controlPercent: 0,
    });
  });

  it('validates mode and percentages', async () => {
    for (const bad of [
      { mode: 'loud', livePercent: 10, controlPercent: 10 },
      { mode: 'live', livePercent: 101, controlPercent: 0 },
      { mode: 'live', livePercent: -1, controlPercent: 0 },
      { mode: 'live', livePercent: 60, controlPercent: 41 },
      { mode: 'live', livePercent: '10', controlPercent: 0 },
      { mode: 'live', livePercent: 10 },
    ]) {
      await expectError('adminSetConfig', admin.token, bad, 'invalid-argument');
    }
    expect((await adminDb().doc('gamification/config').get()).exists).toBe(false);
  });

  it('creates the cohort salt once and never changes it', async () => {
    const first = await must('adminSetConfig', admin.token, { mode: 'shadow', livePercent: 20, controlPercent: 10 });
    expect(first).toMatchObject({ mode: 'shadow', livePercent: 20, controlPercent: 10, activeVersion: null });
    expect(first.cohortSalt).toMatch(/^[0-9a-f]{32}$/);
    const second = await must('adminSetConfig', admin.token, { mode: 'live', livePercent: 60, controlPercent: 40 });
    expect(second).toMatchObject({ mode: 'live', livePercent: 60, controlPercent: 40, cohortSalt: first.cohortSalt });
    expect(await must('adminGetConfig', admin.token, {})).toEqual(second);
    const rows = await auditRows('config.set');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ actorUid: admin.uid });
    expect(rows[0].at).toBeInstanceOf(Timestamp);
  });

  it('keeps an existing salt and the published pointers when it sets the rollout', async () => {
    await adminDb().doc('gamification/config').set({
      mode: 'off',
      activeVersion: 4,
      previousVersion: 3,
      cohortSalt: 'ops-salt',
      livePercent: 0,
      controlPercent: 0,
    });
    const result = await must('adminSetConfig', admin.token, { mode: 'shadow', livePercent: 5, controlPercent: 5 });
    expect(result).toMatchObject({ cohortSalt: 'ops-salt', activeVersion: 4, previousVersion: 3, mode: 'shadow' });
  });
});

describe('rule sets', () => {
  it('rejects an invalid draft with the validator errors in the message', async () => {
    const broken = { ...DEFAULT_RULE_SET, schemaVersion: 2 };
    const response = await callFn('adminSaveDraft', admin.token, { notes: 'bad', rules: broken });
    expect(response.ok).toBe(false);
    expect(response.code).toBe('invalid-argument');
    expect(response.message).toContain('schemaVersion must be 1');
    expect((await adminDb().collection('gamification/ruleSets/items').get()).size).toBe(0);
    await expectError('adminSaveDraft', admin.token, { notes: 'no rules' }, 'invalid-argument');
    await expectError('adminSaveDraft', admin.token, { rules: DEFAULT_RULE_SET }, 'invalid-argument');
  });

  it('numbers drafts, edits drafts only, and lists newest first with the rules inlined', async () => {
    const v1 = await must('adminSaveDraft', admin.token, { notes: 'first', rules: DEFAULT_RULE_SET });
    expect(v1).toMatchObject({ version: 1, status: 'draft' });
    const v2 = await must('adminSaveDraft', admin.token, { notes: 'second', rules: rulesWithSubtaskRate(2) });
    expect(v2.version).toBe(2);
    const edited = await must('adminSaveDraft', admin.token, { version: 1, notes: 'first, edited', rules: rulesWithSubtaskRate(3) });
    expect(edited).toEqual({ version: 1, status: 'draft', createdAt: v1.createdAt });
    await expectError('adminSaveDraft', admin.token, { version: 99, notes: 'x', rules: DEFAULT_RULE_SET }, 'not-found');

    const { ruleSets } = await must('adminListRuleSets', admin.token, {});
    expect(ruleSets.map((entry: { version: number }) => entry.version)).toEqual([2, 1]);
    expect(ruleSets[1]).toMatchObject({ version: 1, status: 'draft', notes: 'first, edited', createdBy: admin.uid, publishedAt: null });
    expect(ruleSets[1].rules.earnRules.find((rule: { id: string }) => rule.id === 'earn.subtask').award.amount).toBe(3);

    await must('adminPublish', admin.token, { version: 1 });
    await expectError('adminSaveDraft', admin.token, { version: 1, notes: 'x', rules: DEFAULT_RULE_SET }, 'failed-precondition');
    expect((await auditRows('ruleSet.createDraft')).length).toBe(2);
    expect((await auditRows('ruleSet.updateDraft')).length).toBe(1);
  });

  it('publishes, archives the previous set, rolls back and forth, and the engine picks the rules up', async () => {
    await setGamiConfig(LIVE);
    const { member, householdId, choreId } = await gamiHousehold('lifecycle');
    await burnWelcome(member.uid);
    const instance = await nextOpenInstance(householdId, choreId);
    const subtaskRows = async () =>
      Object.values(await walletLedger(member.uid))
        .filter((row) => row.ruleId === 'earn.subtask')
        .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());

    await expectError('adminPublish', admin.token, { version: 1 }, 'not-found');
    await expectError('adminRollback', admin.token, {}, 'failed-precondition');

    const d1 = await must('adminSaveDraft', admin.token, { notes: 'x2', rules: rulesWithSubtaskRate(2) });
    const published1 = await must('adminPublish', admin.token, { version: d1.version });
    expect(published1).toMatchObject({ activeVersion: d1.version, previousVersion: null });
    expect(typeof published1.publishedAt).toBe('string');
    await expectError('adminPublish', admin.token, { version: d1.version }, 'failed-precondition');
    await expectError('adminRollback', admin.token, {}, 'failed-precondition');

    // wash = 10 XP at 2 per XP, stamped with the rule set version.
    await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    expect((await subtaskRows()).map((row) => [row.amount, row.ruleSetVersion])).toEqual([[20, d1.version]]);

    const d2 = await must('adminSaveDraft', admin.token, { notes: 'x3', rules: rulesWithSubtaskRate(3) });
    const published2 = await must('adminPublish', admin.token, { version: d2.version });
    expect(published2).toMatchObject({ activeVersion: d2.version, previousVersion: d1.version });
    expect(await must('adminGetConfig', admin.token, {})).toMatchObject({ activeVersion: d2.version, previousVersion: d1.version });
    const statuses = async () =>
      Object.fromEntries(
        (await must('adminListRuleSets', admin.token, {})).ruleSets.map((entry: { version: number; status: string }) => [entry.version, entry.status]),
      );
    expect(await statuses()).toEqual({ [d1.version]: 'archived', [d2.version]: 'published' });

    // wipe = 15 XP at 3 per XP.
    await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wipe' });
    expect((await subtaskRows()).map((row) => [row.amount, row.ruleSetVersion])).toEqual([
      [20, d1.version],
      [45, d2.version],
    ]);

    const rolledBack = await must('adminRollback', admin.token, {});
    expect(rolledBack).toEqual({ activeVersion: d1.version, previousVersion: d2.version });
    expect(await statuses()).toEqual({ [d1.version]: 'published', [d2.version]: 'archived' });

    // trash = 5 XP at 2 per XP again.
    await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'trash' });
    expect((await subtaskRows()).map((row) => [row.amount, row.ruleSetVersion])).toEqual([
      [20, d1.version],
      [45, d2.version],
      [10, d1.version],
    ]);

    expect((await auditRows('ruleSet.publish')).length).toBe(2);
    expect((await auditRows('ruleSet.rollback')).length).toBe(1);
  });
});

describe('simulate', () => {
  beforeAll(async () => {
    // Earlier suites leave XP ledger rows behind; the simulation reads them all. Start from none.
    const rows = await adminDb().collectionGroup('ledger').where('source', 'in', ['subtask', 'bonus', 'undo-subtask', 'undo-bonus', 'revoke-subtask', 'revoke-bonus']).get();
    await Promise.all(rows.docs.map((doc) => doc.ref.delete()));
  });

  it('validates its input', async () => {
    await expectError('adminSimulate', admin.token, { rules: DEFAULT_RULE_SET, days: 0 }, 'invalid-argument');
    await expectError('adminSimulate', admin.token, { rules: DEFAULT_RULE_SET, days: 29 }, 'invalid-argument');
    await expectError('adminSimulate', admin.token, { rules: DEFAULT_RULE_SET, days: 1.5 }, 'invalid-argument');
    await expectError('adminSimulate', admin.token, { rules: { schemaVersion: 1 }, days: 7 }, 'invalid-argument');
  });

  it('returns different totals for a draft that changes an amount, and writes nothing', async () => {
    await setGamiConfig(LIVE);
    const { member, householdId, choreId } = await gamiHousehold('sim', {}, { assign: 'creator' });
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    const walletBefore = await walletOf(member.uid);
    const ledgerBefore = await walletLedger(member.uid);
    const auditBefore = (await adminDb().collection('gamification/audit/items').get()).size;

    const result = await must('adminSimulate', admin.token, { rules: rulesWithSubtaskRate(2), days: 1 });
    expect(result.days).toBe(1);
    // Fresh projection: welcome 50 + wash 10 + assist 5; Zelo 5 for the creator's chore.
    expect(result.published).toMatchObject({ ganhos: 65, zelo: 5, membersAffected: 2, capHits: 0 });
    expect(result.draft).toMatchObject({ ganhos: 75, zelo: 5, membersAffected: 2, capHits: 0 });
    expect(result.published.averagePerMember).toBe(35);
    expect(result.draft.averagePerMember).toBe(40);
    const subtask = result.perRule.find((rule: { ruleId: string }) => rule.ruleId === 'earn.subtask');
    expect(subtask).toMatchObject({
      track: 'ganhos',
      published: { total: 10, membersAffected: 1 },
      draft: { total: 20, membersAffected: 1 },
    });
    const ruleIds = result.perRule.map((rule: { ruleId: string }) => rule.ruleId);
    expect([...ruleIds].sort()).toEqual(ruleIds);

    // A tighter daily pool trims the 10-Ganhos wash to 8: one cap hit on the draft side only.
    const tight = structuredClone(DEFAULT_RULE_SET);
    tight.caps.dailyGanhos = 8;
    const trimmed = await must('adminSimulate', admin.token, { rules: tight, days: 1 });
    expect(trimmed.published.capHits).toBe(0);
    expect(trimmed.draft.capHits).toBe(1);
    expect(trimmed.draft.ganhos).toBe(63);
    expect(trimmed.perRule.find((rule: { ruleId: string }) => rule.ruleId === 'earn.subtask')).toMatchObject({
      published: { total: 10, capHits: 0 },
      draft: { total: 8, capHits: 1 },
    });

    // No writes: wallet, ledger and audit are exactly as they were.
    expect(await walletOf(member.uid)).toEqual(walletBefore);
    expect(await walletLedger(member.uid)).toEqual(ledgerBefore);
    expect((await adminDb().collection('gamification/audit/items').get()).size).toBe(auditBefore);
  });
});

describe('lookup', () => {
  it('returns the wallet, newest-first ledger rows with explanations and pending adjustments', async () => {
    await setGamiConfig(LIVE);
    const { member, householdId, choreId } = await gamiHousehold('lookup', {}, { assign: 'creator' });
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wipe' });
    await must('undoSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wipe' });
    await must('adminAdjust', admin.token, { uid: member.uid, amount: 7, reasonCode: 'support-goodwill', note: 'late fee' });
    const pending = await must('adminAdjust', admin.token, { uid: member.uid, amount: 900, reasonCode: 'correction', note: 'big fix' });

    const result = await must('adminLookupUser', admin.token, { uid: member.uid });
    expect(result.uid).toBe(member.uid);
    const wallet = (await walletOf(member.uid))!;
    expect(result.wallet).toMatchObject({
      uid: member.uid,
      householdId,
      balance: wallet.balance,
      lifetimeEarned: wallet.lifetimeEarned,
      pendingBalance: wallet.pendingBalance,
      xpPeak: wallet.xpPeak,
      level: wallet.level,
    });
    const times = result.ledger.map((row: { createdAt: string }) => Date.parse(row.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));

    const byRule = (ruleId: string) => result.ledger.filter((row: { ruleId: string }) => row.ruleId === ruleId);
    const [subtask] = byRule('earn.subtask');
    expect(subtask).toMatchObject({ track: 'ganhos', memberId: member.uid, householdId });
    expect(subtask.explanation).toContain('earn.subtask');
    expect(subtask.explanation).toContain('built-in default rule set');
    const reversal = result.ledger.find((row: { reversesEntryId: string | null }) => row.reversesEntryId !== null);
    expect(reversal.amount).toBeLessThan(0);
    expect(reversal.explanation).toContain(`Reversal of ${reversal.reversesEntryId}`);
    const [adjustment] = byRule('admin.adjust');
    expect(adjustment).toMatchObject({ amount: 7, reason: 'late fee', ruleSetVersion: null });
    expect(adjustment.explanation).toBe('Admin adjustment (support-goodwill): late fee');

    expect(result.pendingAdjustments).toEqual([
      expect.objectContaining({ id: pending.id, uid: member.uid, amount: 900, reasonCode: 'correction', note: 'big fix', createdBy: admin.uid }),
    ]);
  });

  it('answers for a user without a wallet and rejects a missing uid', async () => {
    expect(await must('adminLookupUser', admin.token, { uid: 'nobody-here' })).toEqual({
      uid: 'nobody-here',
      wallet: null,
      ledger: [],
      pendingAdjustments: [],
    });
    await expectError('adminLookupUser', admin.token, {}, 'invalid-argument');
  });
});

describe('adjustments', () => {
  async function earner(label: string) {
    await setGamiConfig(LIVE);
    const home = await gamiHousehold(label, {}, { assign: 'creator' });
    await burnWelcome(home.member.uid);
    const instance = await nextOpenInstance(home.householdId, home.choreId);
    await must('completeSubtask', home.member.token, { householdId: home.householdId, instanceId: instance.id, subtaskId: 'wash' });
    return home.member; // balance 15
  }

  it('applies a small adjustment at once: ledger row, projection, audit', async () => {
    const member = await earner('adj-small');
    const result = await must('adminAdjust', admin.token, { uid: member.uid, amount: 100, reasonCode: 'correction', note: 'make good' });
    expect(result).toEqual({ id: null, status: 'applied' });
    const wallet = (await walletOf(member.uid))!;
    expect(wallet).toMatchObject({ balance: 115, lifetimeEarned: 115, pendingBalance: expect.any(Number) });
    const rows = Object.values(await walletLedger(member.uid)).filter((row) => row.ruleId === 'admin.adjust');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      amount: 100,
      track: 'ganhos',
      reason: 'make good',
      reasonCode: 'correction',
      memberId: member.uid,
      ruleSetVersion: null,
      appliedBy: admin.uid,
    });
    expect(rows[0].key).toBe(`admin.adjust:${rows[0].adjustmentId}:${member.uid}`);
    expect(rows[0].sourceRef).toBe(rows[0].adjustmentId);

    // A negative one is a clawback: balance moves, lifetime stays.
    await must('adminAdjust', admin.token, { uid: member.uid, amount: -115, reasonCode: 'abuse', note: 'farmed' });
    expect(await walletOf(member.uid)).toMatchObject({ balance: 0, lifetimeEarned: 115 });
    const audit = await auditRows('adjust.apply');
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ actorUid: admin.uid, before: { balance: 15 }, after: { balance: 115, amount: 100 } });
  });

  it('refuses a balance below zero, bad amounts and a missing note, and changes nothing', async () => {
    const member = await earner('adj-bad');
    await expectError('adminAdjust', admin.token, { uid: member.uid, amount: -16, reasonCode: 'abuse', note: 'too much' }, 'failed-precondition');
    for (const bad of [
      { amount: 0 },
      { amount: 1.5 },
      { amount: '10' },
      { amount: 10, note: '   ' },
      { amount: 10, reasonCode: 'because' },
    ]) {
      await expectError('adminAdjust', admin.token, { uid: member.uid, amount: 10, reasonCode: 'correction', note: 'ok', ...bad }, 'invalid-argument');
    }
    await expectError('adminAdjust', admin.token, { uid: 'ghost', amount: 10, reasonCode: 'correction', note: 'ok' }, 'not-found');
    await expectError('adminAdjust', admin.token, { uid: 'ghost', amount: 900, reasonCode: 'correction', note: 'ok' }, 'not-found');
    expect((await walletOf(member.uid))!.balance).toBe(15);
    expect(Object.values(await walletLedger(member.uid)).filter((row) => row.ruleId === 'admin.adjust')).toEqual([]);
    expect((await adminDb().collection('gamification/adjustments/items').get()).size).toBe(0);
    expect((await auditRows('adjust.apply')).length).toBe(0);
  });

  it('applies exactly 500 immediately and pends 501', async () => {
    const member = await earner('adj-edge');
    expect(await must('adminAdjust', admin.token, { uid: member.uid, amount: 500, reasonCode: 'correction', note: 'edge' })).toEqual({ id: null, status: 'applied' });
    const pending = await must('adminAdjust', admin.token, { uid: member.uid, amount: 501, reasonCode: 'correction', note: 'edge+1' });
    expect(pending.status).toBe('pending');
    expect(pending.id).toEqual(expect.any(String));
    expect((await walletOf(member.uid))!.balance).toBe(515);
  });

  it('pends a large adjustment, forbids self-approval, lets a second admin approve it once', async () => {
    const member = await earner('adj-large');
    const pending = await must('adminAdjust', admin.token, { uid: member.uid, amount: 800, reasonCode: 'support-goodwill', note: 'compensation' });
    expect(pending.status).toBe('pending');
    expect((await walletOf(member.uid))!.balance).toBe(15);
    expect(await adminDb().doc(`gamification/adjustments/items/${pending.id}`).get().then((snap) => snap.data())).toMatchObject({
      uid: member.uid,
      amount: 800,
      status: 'pending',
      createdBy: admin.uid,
    });

    await expectError('adminApproveAdjustment', admin.token, { id: pending.id }, 'permission-denied');
    await expectError('adminApproveAdjustment', admin2.token, { id: 'does-not-exist' }, 'not-found');
    expect((await walletOf(member.uid))!.balance).toBe(15);

    const approved = await must('adminApproveAdjustment', admin2.token, { id: pending.id });
    expect(approved).toMatchObject({ id: pending.id, status: 'applied', approvedBy: admin2.uid });
    expect(typeof approved.appliedAt).toBe('string');
    expect((await walletOf(member.uid))!.balance).toBe(815);
    await expectError('adminApproveAdjustment', admin2.token, { id: pending.id }, 'failed-precondition');
    await expectError('adminApproveAdjustment', admin.token, { id: pending.id }, 'permission-denied');
    expect((await walletOf(member.uid))!.balance).toBe(815);

    const rows = Object.values(await walletLedger(member.uid)).filter((row) => row.ruleId === 'admin.adjust');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 800, key: `admin.adjust:${pending.id}:${member.uid}`, appliedBy: admin2.uid });
    expect(await adminDb().doc(`gamification/adjustments/items/${pending.id}`).get().then((snap) => snap.data())).toMatchObject({
      status: 'applied',
      approvedBy: admin2.uid,
    });
    expect((await must('adminLookupUser', admin.token, { uid: member.uid })).pendingAdjustments).toEqual([]);
    expect((await auditRows('adjust.request')).length).toBe(1);
    expect(await auditRows('adjust.approve')).toEqual([expect.objectContaining({ actorUid: admin2.uid })]);
  });

  it('applies a pending adjustment once when two approvals race', async () => {
    const member = await earner('adj-race');
    const pending = await must('adminAdjust', admin.token, { uid: member.uid, amount: 600, reasonCode: 'correction', note: 'race' });
    const admin3 = await adminUser('admin3');
    const results = await Promise.all([
      callFn('adminApproveAdjustment', admin2.token, { id: pending.id }),
      callFn('adminApproveAdjustment', admin3.token, { id: pending.id }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)?.code).toBe('failed-precondition');
    expect((await walletOf(member.uid))!.balance).toBe(615);
    expect(Object.values(await walletLedger(member.uid)).filter((row) => row.ruleId === 'admin.adjust')).toHaveLength(1);
  });

  it('refuses to approve a large negative adjustment that the balance can no longer cover', async () => {
    const member = await earner('adj-neg');
    const pending = await must('adminAdjust', admin.token, { uid: member.uid, amount: -600, reasonCode: 'abuse', note: 'clawback' });
    await expectError('adminApproveAdjustment', admin2.token, { id: pending.id }, 'failed-precondition');
    expect((await walletOf(member.uid))!.balance).toBe(15);
    expect((await adminDb().doc(`gamification/adjustments/items/${pending.id}`).get()).get('status')).toBe('pending');
  });
});

describe('alerts', () => {
  it('lists alerts newest first', async () => {
    const col = adminDb().collection('gamification/alerts/items');
    await col.doc('a-old').set({ kind: 'velocity', householdId: 'h1', memberId: 'm1', data: { count: 14, windowMinutes: 10 }, createdAt: Timestamp.fromMillis(1_000_000) });
    await col.doc('a-new').set({ kind: 'undo-rate', householdId: 'h2', data: { rate: 40 }, createdAt: Timestamp.fromMillis(3_000_000) });
    await col.doc('a-mid').set({ kind: 'chore-xp-raise', householdId: 'h3', memberId: 'm3', data: { choreId: 'c1' }, createdAt: Timestamp.fromMillis(2_000_000) });
    const { alerts } = await must('adminListAlerts', admin.token, {});
    expect(alerts.map((alert: { id: string }) => alert.id)).toEqual(['a-new', 'a-mid', 'a-old']);
    expect(alerts[0]).toEqual({
      id: 'a-new',
      kind: 'undo-rate',
      householdId: 'h2',
      memberId: null,
      data: { rate: 40 },
      createdAt: new Date(3_000_000).toISOString(),
    });
    expect(alerts[2]).toMatchObject({ memberId: 'm1', data: { count: 14, windowMinutes: 10 } });
  });
});

describe('rebuild wallet', () => {
  it('restores a tampered projection from the ledger and keeps what the ledger cannot derive', async () => {
    await setGamiConfig(LIVE);
    const { member, householdId, choreId } = await gamiHousehold('rebuild', {}, { assign: 'creator' });
    const instance = await nextOpenInstance(householdId, choreId);
    await must('completeSubtask', member.token, { householdId, instanceId: instance.id, subtaskId: 'wash' });
    await must('adminAdjust', admin.token, { uid: member.uid, amount: 40, reasonCode: 'correction', note: 'fix' });
    const good = (await walletOf(member.uid))!;
    expect(good.balance).toBe(105); // welcome 50 + 10 + assist 5 + 40

    await adminDb().doc(`wallets/${member.uid}`).update({ balance: 9999, lifetimeEarned: 1, pendingBalance: 500, nextSpendableAt: null });
    const ledgerRows = Object.keys(await walletLedger(member.uid)).length;
    const result = await must('adminRebuildWallet', admin.token, { uid: member.uid });
    expect(result).toEqual({ uid: member.uid, rows: ledgerRows, balance: 105 });

    const rebuilt = (await walletOf(member.uid))!;
    expect(rebuilt).toMatchObject({
      balance: 105,
      lifetimeEarned: good.lifetimeEarned,
      pendingBalance: good.pendingBalance,
      xpPeak: good.xpPeak,
      householdId,
      projectionVersion: good.projectionVersion + 1,
    });
    expect(rebuilt.nextSpendableAt?.toMillis()).toBe(good.nextSpendableAt?.toMillis());
    expect(rebuilt.stats).toEqual(good.stats);
    expect(rebuilt.streak).toEqual(good.streak);
    expect(rebuilt.caps).toEqual(good.caps);
    const [audit] = await auditRows('wallet.rebuild');
    expect(audit).toMatchObject({ actorUid: admin.uid, before: { balance: 9999 }, after: { balance: 105 } });
  });

  it('is not-found for a user with neither wallet nor ledger', async () => {
    await expectError('adminRebuildWallet', admin.token, { uid: 'nobody-here' }, 'not-found');
    await expectError('adminRebuildWallet', admin.token, {}, 'invalid-argument');
  });
});

describe('backfill level floors', () => {
  it('sets floors only where missing', async () => {
    // Clear whatever earlier suites left, then tamper with exactly two members of a fresh household.
    await must('adminBackfillLevelFloors', admin.token, {});
    const { creator, member, householdId } = await gamiHousehold('floors');
    const members = adminDb().collection(`households/${householdId}/members`);
    await members.doc(creator.uid).update({ xp: 250, levelFloor: FieldValue.delete(), xpPeak: FieldValue.delete() });
    await members.doc(member.uid).update({ xp: 40, xpPeak: 80, levelFloor: 7 });

    const result = await must('adminBackfillLevelFloors', admin.token, {});
    expect(result).toEqual({ updatedMembers: 1 });
    expect((await members.doc(creator.uid).get()).data()).toMatchObject({ xp: 250, levelFloor: 3, xpPeak: 250 });
    expect((await members.doc(member.uid).get()).data()).toMatchObject({ xp: 40, levelFloor: 7, xpPeak: 80 });
    expect(await must('adminBackfillLevelFloors', admin.token, {})).toEqual({ updatedMembers: 0 });

    // Negative or missing xp still yields a sane floor.
    await members.doc(member.uid).update({ xp: -30, levelFloor: FieldValue.delete(), xpPeak: FieldValue.delete() });
    expect(await must('adminBackfillLevelFloors', admin.token, {})).toEqual({ updatedMembers: 1 });
    expect((await members.doc(member.uid).get()).data()).toMatchObject({ levelFloor: 1, xpPeak: 0 });
    expect((await auditRows('members.backfillLevelFloors')).length).toBe(4);
  });
});
