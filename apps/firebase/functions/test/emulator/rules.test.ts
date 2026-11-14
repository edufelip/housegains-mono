import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc } from 'firebase/firestore';
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
    for (const path of ['households/h1/chores/c1', 'households/h1/members/alice', 'households/h1/instances/c1_2026-01-05', 'households/h1/ledger/e1', 'households/h1/meta/invite']) {
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

  it('nobody reads invite codes or reports from the client', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(getDoc(doc(alice, 'inviteCodes/A2B3C4')));
    await assertFails(getDoc(doc(alice, 'reports/r1')));
    await assertFails(setDoc(doc(alice, 'reports/r2'), { reporterUid: 'alice' }));
  });
});
