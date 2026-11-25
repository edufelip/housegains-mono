import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { PROJECT_ID } from './helpers';

// Firestore security rules, run against the emulator.

const RULES = readFileSync(fileURLToPath(new URL('../../../firestore.rules', import.meta.url)), 'utf8');
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: '127.0.0.1', port: 8080, rules: RULES },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'households/h1'), { name: 'Home', memberUids: ['alice', 'bob'], creatorUid: 'alice' });
    await setDoc(doc(db, 'households/h1/members/alice'), { name: 'Alice', role: 'creator' });
    await setDoc(doc(db, 'households/h1/chores/c1'), { name: 'Trash', assigneeIds: ['alice'] });
    await setDoc(doc(db, 'households/h1/instances/c1_2026-01-05'), { choreId: 'c1', status: 'open' });
    await setDoc(doc(db, 'households/h1/ledger/e1'), { memberId: 'alice', amount: 10 });
    await setDoc(doc(db, 'households/h1/disputes/c1_2026-01-05'), { instanceId: 'c1_2026-01-05', status: 'open', subtaskIds: ['wash'] });
    await setDoc(doc(db, 'households/h1/weeks/2026-01-05'), { weekStart: '2026-01-05', weekEnd: '2026-01-11', timeZone: 'UTC' });
    await setDoc(doc(db, 'households/h1/meta/invite'), { code: 'A2B3C4' });
    await setDoc(doc(db, 'inviteCodes/A2B3C4'), { householdId: 'h1', uses: 0 });
    await setDoc(doc(db, 'reports/r1'), { reporterUid: 'alice' });
    await setDoc(doc(db, 'users/alice'), profile({ householdId: 'h1' }));
    await setDoc(doc(db, 'users/eve'), profile({ householdId: null }));
  });
});

function profile(extra: Record<string, unknown>) {
  return {
    displayName: 'Someone',
    initials: 'SO',
    color: '#7c5cff',
    locale: 'en-US',
    themeId: 'arcade',
    fcmTokens: [],
    remindersEnabled: true,
    ...extra,
  };
}

describe('household read access', () => {
  it('a non-member cannot read a household', async () => {
    const eve = env.authenticatedContext('eve');
    await assertFails(getDoc(doc(eve.firestore(), 'households/h1')));
  });

  it('a member can read their household', async () => {
    const alice = env.authenticatedContext('alice');
    await assertSucceeds(getDoc(doc(alice.firestore(), 'households/h1')));
  });

  it('members read every household subcollection; non-members read none', async () => {
    const bob = env.authenticatedContext('bob').firestore();
    const eve = env.authenticatedContext('eve').firestore();
    for (const path of ['households/h1/chores/c1', 'households/h1/members/alice', 'households/h1/instances/c1_2026-01-05', 'households/h1/ledger/e1', 'households/h1/disputes/c1_2026-01-05', 'households/h1/weeks/2026-01-05', 'households/h1/meta/invite']) {
      await assertSucceeds(getDoc(doc(bob, path)));
      await assertFails(getDoc(doc(eve, path)));
    }
    await assertSucceeds(getDocs(collection(bob, 'households/h1/chores')));
    await assertFails(getDocs(collection(eve, 'households/h1/chores')));
  });

  it('signed-out clients read nothing', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'households/h1')));
    await assertFails(getDoc(doc(anon, 'households/h1/chores/c1')));
  });
});

describe('user profile writes', () => {
  it('a user cannot write householdId on their own doc', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(alice, 'users/alice'), { householdId: 'h2' }));
  });

  it('a user can update the allowed profile fields', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(
      updateDoc(doc(alice, 'users/alice'), { displayName: 'Alicia', locale: 'pt-BR', themeId: 'soft', remindersEnabled: false }),
    );
  });

  it('a user cannot write another user doc or read it', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(alice, 'users/eve'), { displayName: 'Hacked' }));
    await assertFails(getDoc(doc(alice, 'users/eve')));
  });

  it('a user cannot create their own profile doc', async () => {
    const newcomer = env.authenticatedContext('newcomer').firestore();
    await assertFails(setDoc(doc(newcomer, 'users/newcomer'), profile({ householdId: null })));
  });

  it('display names and token lists stay within limits', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(alice, 'users/alice'), { displayName: '' }));
    await assertFails(updateDoc(doc(alice, 'users/alice'), { displayName: 'x'.repeat(41) }));
    await assertFails(updateDoc(doc(alice, 'users/alice'), { fcmTokens: Array.from({ length: 11 }, (_, i) => `t${i}`) }));
    await assertSucceeds(updateDoc(doc(alice, 'users/alice'), { fcmTokens: ['t1'] }));
    await assertFails(updateDoc(doc(alice, 'users/alice'), { locale: 'ja-JP' }));
  });
});

describe('client writes outside the profile are denied', () => {
  it('members cannot write household, chore, instance, ledger or feed docs', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(alice, 'households/h1'), { name: 'Hacked' }));
    await assertFails(updateDoc(doc(alice, 'households/h1/chores/c1'), { bonusXp: 200 }));
    await assertFails(updateDoc(doc(alice, 'households/h1/instances/c1_2026-01-05'), { status: 'done' }));
    await assertFails(setDoc(doc(alice, 'households/h1/ledger/e2'), { memberId: 'alice', amount: 999 }));
    await assertFails(setDoc(doc(alice, 'households/h1/feed/f1'), { memberId: 'alice' }));
  });

  it('members cannot write disputes, even to agree with a report', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(alice, 'households/h1/disputes/c1_2026-01-05'), { status: 'resolved' }));
    await assertFails(setDoc(doc(alice, 'households/h1/disputes/other'), { instanceId: 'other', status: 'open' }));
  });

  it('closed weeks are read-only for clients: no edits, no fabricated weeks', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(alice, 'households/h1/weeks/2026-01-05'), { topMember: { memberId: 'alice', xp: 999 } }));
    await assertFails(setDoc(doc(alice, 'households/h1/weeks/2027-01-04'), { weekStart: '2027-01-04' }));
    await assertFails(deleteDoc(doc(alice, 'households/h1/weeks/2026-01-05')));
    await assertFails(getDoc(doc(env.authenticatedContext('eve').firestore(), 'households/h1/weeks/2026-01-05')));
  });

  it('nobody reads invite codes or reports from the client', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(getDoc(doc(alice, 'inviteCodes/A2B3C4')));
    await assertFails(getDoc(doc(alice, 'reports/r1')));
    await assertFails(setDoc(doc(alice, 'reports/r2'), { reporterUid: 'alice' }));
  });
});

describe('gamification access (contract C3, C1)', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'wallets/alice'), { memberId: 'alice', balance: 40 });
      await setDoc(doc(db, 'wallets/alice/ledger/earn.subtask:r1:alice'), { amount: 10 });
      await setDoc(doc(db, 'wallets/bob'), { memberId: 'bob', balance: 5 });
      await setDoc(doc(db, 'users/alice/inbox/cel:toast:r1:alice'), { id: 'cel:toast:r1:alice', seen: false });
      await setDoc(doc(db, 'households/h1/organizer/alice'), { zelo: 50 });
      await setDoc(doc(db, 'households/h1/organizerLedger/zelo.setup:setup:alice'), { amount: 50 });
      await setDoc(doc(db, 'households/h1/events/evt1'), { name: 'gami_earned' });
      await setDoc(doc(db, 'gamification/config'), { activeVersion: 1 });
      await setDoc(doc(db, 'gamification/ruleSets/items/1'), { status: 'published' });
      await setDoc(doc(db, 'gamification/alerts/items/a1'), { kind: 'velocity' });
    });
  });

  it('the owner reads their wallet and its ledger; nobody else does', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    const bob = env.authenticatedContext('bob').firestore();
    const anon = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(alice, 'wallets/alice')));
    await assertSucceeds(getDoc(doc(alice, 'wallets/alice/ledger/earn.subtask:r1:alice')));
    await assertSucceeds(getDocs(collection(alice, 'wallets/alice/ledger')));
    await assertFails(getDoc(doc(bob, 'wallets/alice')));
    await assertFails(getDoc(doc(bob, 'wallets/alice/ledger/earn.subtask:r1:alice')));
    await assertFails(getDocs(collection(bob, 'wallets/alice/ledger')));
    await assertFails(getDoc(doc(anon, 'wallets/alice')));
  });

  it('clients never write wallets or their ledger, not even their own', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(alice, 'wallets/alice'), { balance: 9999 }));
    await assertFails(setDoc(doc(alice, 'wallets/alice'), { balance: 9999 }));
    await assertFails(deleteDoc(doc(alice, 'wallets/alice')));
    await assertFails(setDoc(doc(alice, 'wallets/alice/ledger/fake'), { amount: 9999 }));
    await assertFails(deleteDoc(doc(alice, 'wallets/alice/ledger/earn.subtask:r1:alice')));
  });

  it('the owner reads their inbox; nobody else does; nobody writes it from the client', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    const bob = env.authenticatedContext('bob').firestore();
    await assertSucceeds(getDoc(doc(alice, 'users/alice/inbox/cel:toast:r1:alice')));
    await assertSucceeds(getDocs(collection(alice, 'users/alice/inbox')));
    await assertFails(getDoc(doc(bob, 'users/alice/inbox/cel:toast:r1:alice')));
    await assertFails(getDocs(collection(bob, 'users/alice/inbox')));
    // Acknowledging goes through the ackCelebrations callable.
    await assertFails(updateDoc(doc(alice, 'users/alice/inbox/cel:toast:r1:alice'), { seen: true }));
    await assertFails(setDoc(doc(alice, 'users/alice/inbox/new'), { id: 'new', seen: false }));
    await assertFails(deleteDoc(doc(alice, 'users/alice/inbox/cel:toast:r1:alice')));
  });

  it('members read Zelo, the organizer projection and server events; nobody writes them', async () => {
    const bob = env.authenticatedContext('bob').firestore();
    const eve = env.authenticatedContext('eve').firestore();
    for (const path of ['households/h1/organizer/alice', 'households/h1/organizerLedger/zelo.setup:setup:alice', 'households/h1/events/evt1']) {
      await assertSucceeds(getDoc(doc(bob, path)));
      await assertFails(getDoc(doc(eve, path)));
      await assertFails(setDoc(doc(bob, path), { zelo: 9999 }));
    }
  });

  it('gamification config, rule sets and alerts have no client access at all', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    for (const path of ['gamification/config', 'gamification/ruleSets/items/1', 'gamification/alerts/items/a1']) {
      await assertFails(getDoc(doc(alice, path)));
      await assertFails(setDoc(doc(alice, path), { activeVersion: 2 }));
    }
    await assertFails(getDocs(collection(alice, 'gamification/alerts/items')));
  });
});
