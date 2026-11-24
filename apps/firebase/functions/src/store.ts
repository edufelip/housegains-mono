import { randomUUID } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import {
  FieldValue,
  Timestamp,
  type DocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import { db } from './admin';
import { DomainError } from './domain/errors';
import {
  calculateBonusAwards,
  isDue,
  UNDO_WINDOW_MS,
  undoInstanceStatus,
} from './domain/bonus';
import {
  createInviteCode,
  INVITE_MAX_USES,
  INVITE_TTL_MS,
  inviteProblem,
  isValidInviteCode,
  MAX_HOUSEHOLD_MEMBERS,
  normalizeInviteCode,
} from './domain/invites';
import {
  type ChoreFields,
  type ChoreRecord,
  type Completion,
  type InstanceRecord,
  generateChoreInstances,
  isEditableFuture,
  refreshedFields,
} from './domain/instances';
import { colorFor, completionReviewedBody, initialsFor, reportReviewBody } from './domain/people';
import { recurrenceKey } from './domain/recurrence';
import { addDaysToDateKey, dateKeyInTimeZone } from './domain/time';
import {
  assertNoConflict,
  assertWithinDisputeWindow,
  DISPUTE_WINDOW_MS,
  hasAdminRights,
  moderateTargets,
  type MemberRole,
  pickAdminSuccessor,
  reportTargets,
  resolveTargets,
} from './domain/moderation';
import { pushToMembers } from './notify';
import {
  asObject,
  parseAssigneeIds,
  parseChoreFields,
  parseHouseholdCreate,
  parseHouseholdUpdate,
  parseProfileInput,
  requireId,
  requireOneOf,
  requireString,
} from './domain/validate';

// Firestore boundary. Every write path reads first, then writes, inside one transaction.
// The pure rules live in ./domain.

const ts = (date: Date) => Timestamp.fromDate(date);
function fail(code: ConstructorParameters<typeof DomainError>[0], message: string): never {
  throw new DomainError(code, message);
}

const householdRef = (hid: string) => db().collection('households').doc(hid);
const userRef = (uid: string) => db().collection('users').doc(uid);
const inviteRef = (code: string) => db().collection('inviteCodes').doc(code);
const inviteMetaRef = (hid: string) => householdRef(hid).collection('meta').doc('invite');
const choreRef = (hid: string, choreId: string) => householdRef(hid).collection('chores').doc(choreId);
const instanceRef = (hid: string, instanceId: string) => householdRef(hid).collection('instances').doc(instanceId);
const disputeRef = (hid: string, instanceId: string) => householdRef(hid).collection('disputes').doc(instanceId);
const ledgerCol = (hid: string) => householdRef(hid).collection('ledger');

// ---- Read helpers -------------------------------------------------------------

function readChore(snap: DocumentSnapshot): ChoreRecord {
  const d = snap.data()!;
  return {
    id: snap.id,
    name: d.name,
    icon: d.icon,
    category: d.category ?? '',
    catalogId: d.catalogId,
    subtasks: d.subtasks,
    bonusXp: d.bonusXp,
    assigneeIds: d.assigneeIds ?? [],
    recurrence: d.recurrence,
    dueTime: d.dueTime,
    isActive: d.isActive !== false,
    recurrenceAnchor: d.recurrenceAnchor,
    generatedThrough: d.generatedThrough,
  };
}

function fieldsOf(chore: ChoreRecord): ChoreFields {
  const { id: _id, recurrenceAnchor: _anchor, generatedThrough: _through, ...fields } = chore;
  return fields;
}

function readInstance(snap: DocumentSnapshot): InstanceRecord {
  const d = snap.data()!;
  return {
    id: snap.id,
    choreId: d.choreId,
    dueAt: d.dueAt.toDate(),
    subtasks: d.subtasks,
    bonusXp: d.bonusXp,
    assigneeIds: d.assigneeIds ?? [],
    status: d.status,
    completions: (d.completions ?? []).map((c: Record<string, unknown> & { completedAt: Timestamp }) => ({
      ...c,
      completedAt: c.completedAt.toDate(),
    })) as Completion[],
    bonusAwards: d.bonusAwards ?? {},
    choreSnapshot: d.choreSnapshot,
    ...(d.reminderSentAt ? { reminderSentAt: d.reminderSentAt.toDate() } : {}),
    ...(d.revocations
      ? {
          revocations: (d.revocations as Array<Record<string, unknown> & { at: Timestamp }>).map((r) => ({
            ...r,
            at: r.at.toDate(),
          })) as InstanceRecord['revocations'],
        }
      : {}),
    ...(d.disputeStatus ? { disputeStatus: d.disputeStatus as InstanceRecord['disputeStatus'] } : {}),
  };
}

function instanceDoc(instance: InstanceRecord) {
  return {
    choreId: instance.choreId,
    dueAt: ts(instance.dueAt),
    subtasks: instance.subtasks,
    bonusXp: instance.bonusXp,
    assigneeIds: instance.assigneeIds,
    status: instance.status,
    completions: instance.completions.map((c) => ({ ...c, completedAt: ts(c.completedAt) })),
    bonusAwards: instance.bonusAwards,
    choreSnapshot: instance.choreSnapshot,
    ...(instance.revocations
      ? { revocations: instance.revocations.map((r) => ({ ...r, at: ts(r.at) })) }
      : {}),
    ...(instance.disputeStatus ? { disputeStatus: instance.disputeStatus } : {}),
  };
}

function choreDoc(chore: ChoreRecord) {
  return {
    name: chore.name,
    icon: chore.icon,
    category: chore.category,
    ...(chore.catalogId ? { catalogId: chore.catalogId } : {}),
    subtasks: chore.subtasks,
    bonusXp: chore.bonusXp,
    assigneeIds: chore.assigneeIds,
    recurrence: chore.recurrence,
    dueTime: chore.dueTime,
    isActive: chore.isActive,
    recurrenceAnchor: chore.recurrenceAnchor,
    generatedThrough: chore.generatedThrough,
  };
}

function assertMember(household: DocumentSnapshot, uid: string): Record<string, any> {
  const data = household.data();
  if (!household.exists || !data || !(data.memberUids as string[]).includes(uid)) {
    fail('permission-denied', 'You are not a member of this household.');
  }
  return data!;
}

function assertCreator(household: DocumentSnapshot, uid: string): Record<string, any> {
  const data = assertMember(household, uid);
  if (data.creatorUid !== uid) fail('permission-denied', 'Only the household creator can do that.');
  return data;
}

function memberDoc(profile: Record<string, any>, role: MemberRole, now: Date) {
  return {
    name: profile.displayName,
    initials: profile.initials,
    color: profile.color,
    role,
    xp: 0,
    joinedAt: ts(now),
  };
}

function profileView(uid: string, data: Record<string, any>) {
  return {
    uid,
    displayName: data.displayName,
    initials: data.initials,
    color: data.color,
    householdId: data.householdId ?? null,
    locale: data.locale,
    themeId: data.themeId,
    remindersEnabled: data.remindersEnabled !== false,
  };
}

async function freeInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = createInviteCode();
    if (!(await inviteRef(code).get()).exists) return code;
  }
  return fail('failed-precondition', 'Could not allocate an invite code. Try again.');
}

// ---- Profile -------------------------------------------------------------------

export async function ensureProfile(uid: string, raw: unknown) {
  const input = parseProfileInput(raw);
  const ref = userRef(uid);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return profileView(uid, snap.data()!);
    const profile = {
      displayName: input.displayName,
      initials: initialsFor(input.displayName),
      color: colorFor(uid),
      householdId: null,
      locale: input.locale,
      themeId: input.themeId,
      fcmTokens: [] as string[],
      remindersEnabled: true,
      createdAt: ts(new Date()),
    };
    tx.set(ref, profile);
    return profileView(uid, profile);
  });
}

// ---- Household -----------------------------------------------------------------

export async function createHousehold(uid: string, raw: unknown) {
  const input = parseHouseholdCreate(raw);
  const now = new Date();
  const code = await freeInviteCode();
  const hid = db().collection('households').doc().id;
  const hRef = householdRef(hid);
  const invite = {
    code,
    expiresAt: ts(new Date(now.getTime() + INVITE_TTL_MS)),
    uses: 0,
    maxUses: INVITE_MAX_USES,
    revoked: false,
  };

  await db().runTransaction(async (tx) => {
    const user = await tx.get(userRef(uid));
    if (!user.exists) fail('failed-precondition', 'Create your profile first.');
    if (user.data()!.deleting === true) fail('failed-precondition', 'This account is being deleted.');
    if (user.data()!.householdId) fail('failed-precondition', 'You already belong to a household.');
    tx.set(hRef, {
      name: input.name,
      icon: input.icon,
      color: input.color,
      timeZone: input.timeZone,
      weeklyGoalXp: 400,
      creatorUid: uid,
      memberUids: [uid],
      setupComplete: false,
      createdAt: ts(now),
      updatedAt: ts(now),
    });
    tx.set(hRef.collection('members').doc(uid), memberDoc(user.data()!, 'creator', now));
    tx.set(inviteMetaRef(hid), invite);
    tx.set(inviteRef(code), { ...invite, householdId: hid });
    tx.set(userRef(uid), { householdId: hid }, { merge: true });
  });
  return { householdId: hid };
}

export async function updateHousehold(uid: string, raw: unknown) {
  const data = asObject(raw);
  const hid = requireId(data.householdId, 'householdId');
  const update = parseHouseholdUpdate(raw);
  const hRef = householdRef(hid);
  await db().runTransaction(async (tx) => {
    const household = await tx.get(hRef);
    assertCreator(household, uid);
    tx.update(hRef, { ...update, updatedAt: ts(new Date()) });
  });
  return { ok: true };
}

export async function joinHousehold(uid: string, raw: unknown) {
  const code = normalizeInviteCode(asObject(raw).code);
  const now = new Date();

  const result = await db().runTransaction(async (tx) => {
    const user = await tx.get(userRef(uid));
    if (!user.exists) fail('failed-precondition', 'Create your profile first.');
    const profile = user.data()!;
    if (profile.deleting === true) fail('failed-precondition', 'This account is being deleted.');
    if (profile.householdId) fail('failed-precondition', 'You already belong to a household.');

    const attempts = profile.joinAttempts as { count?: number; windowStart?: Timestamp } | undefined;
    const windowStart = attempts?.windowStart?.toDate() ?? now;
    const inWindow = now.getTime() - windowStart.getTime() < 60 * 60 * 1000;
    const count = inWindow ? attempts?.count ?? 0 : 0;
    if (count >= 20) fail('resource-exhausted', 'Too many failed invite attempts. Try again later.');

    const recordFailure = (code: 'not-found' | 'failed-precondition' | 'resource-exhausted', message: string) => {
      tx.set(userRef(uid), {
        joinAttempts: {
          count: count + 1,
          windowStart: ts(inWindow ? windowStart : now),
        },
      }, { merge: true });
      return { error: { code, message } } as const;
    };

    if (!isValidInviteCode(code)) return recordFailure('not-found', 'Invite code not found.');

    const invite = await tx.get(inviteRef(code));
    if (!invite.exists) return recordFailure('not-found', 'Invite code not found.');
    const inv = invite.data()!;
    const problem = inviteProblem(
      {
        revoked: inv.revoked === true,
        expiresAt: inv.expiresAt.toDate(),
        uses: inv.uses,
        maxUses: inv.maxUses,
      },
      now,
    );
    if (problem === 'revoked') return recordFailure('failed-precondition', 'This invite was revoked.');
    if (problem === 'expired') return recordFailure('failed-precondition', 'This invite has expired.');
    if (problem === 'full') return recordFailure('failed-precondition', 'This invite has reached its use limit.');

    const hid = inv.householdId as string;
    const hRef = householdRef(hid);
    const household = await tx.get(hRef);
    if (!household.exists) return recordFailure('not-found', 'Invite code not found.');
    const hh = household.data()!;
    if ((hh.memberUids as string[]).length >= MAX_HOUSEHOLD_MEMBERS) {
      return recordFailure('resource-exhausted', 'This household is full.');
    }
    const meta = await tx.get(inviteMetaRef(hid));

    tx.update(hRef, {
      memberUids: FieldValue.arrayUnion(uid),
      updatedAt: ts(now),
    });
    tx.set(hRef.collection('members').doc(uid), memberDoc(user.data()!, 'member', now));
    tx.update(inviteRef(code), { uses: FieldValue.increment(1) });
    if (meta.exists && meta.data()!.code === code) {
      tx.update(inviteMetaRef(hid), { uses: FieldValue.increment(1) });
    }
    tx.set(userRef(uid), { householdId: hid }, { merge: true });
    return { householdId: hid } as const;
  });
  if ('error' in result) fail(result.error.code, result.error.message);
  return result;
}

export async function rotateInvite(uid: string, raw: unknown) {
  const hid = requireId(asObject(raw).householdId, 'householdId');
  const newCode = await freeInviteCode();
  const now = new Date();
  const expiresAt = ts(new Date(now.getTime() + INVITE_TTL_MS));
  return db().runTransaction(async (tx) => {
    const household = await tx.get(householdRef(hid));
    assertCreator(household, uid);
    const meta = await tx.get(inviteMetaRef(hid));
    const oldCode = meta.exists ? (meta.data()!.code as string) : null;
    const oldInvite = oldCode ? await tx.get(inviteRef(oldCode)) : null;

    if (oldCode && oldInvite?.exists) tx.update(inviteRef(oldCode), { revoked: true });
    const invite = { code: newCode, expiresAt, uses: 0, maxUses: INVITE_MAX_USES, revoked: false };
    tx.set(inviteRef(newCode), { ...invite, householdId: hid });
    tx.set(inviteMetaRef(hid), invite);
    return { code: newCode, expiresAt: expiresAt.toDate().toISOString() };
  });
}

export async function finishSetup(uid: string, raw: unknown) {
  const hid = requireId(asObject(raw).householdId, 'householdId');
  const hRef = householdRef(hid);
  await db().runTransaction(async (tx) => {
    assertCreator(await tx.get(hRef), uid);
    tx.update(hRef, { setupComplete: true, updatedAt: ts(new Date()) });
  });
  return { ok: true };
}

export async function reportContent(uid: string, raw: unknown) {
  const input = asObject(raw);
  const hid = requireId(input.householdId, 'householdId');
  const kind = requireOneOf(input.kind, 'kind', ['member', 'household', 'chore'] as const);
  const targetId = requireId(input.targetId, 'targetId');
  const reason = requireString(input.reason ?? '', 'reason', 0, 500);
  const hRef = householdRef(hid);
  assertMember(await hRef.get(), uid);

  if (kind === 'household' && targetId !== hid) fail('invalid-argument', 'targetId must be the household id.');
  if (kind === 'member' && !(await hRef.collection('members').doc(targetId).get()).exists) {
    fail('not-found', 'Member not found.');
  }
  if (kind === 'chore' && !(await choreRef(hid, targetId).get()).exists) fail('not-found', 'Chore not found.');

  const reportId = `${uid}_${kind}_${targetId}`;
  await db().collection('reports').doc(reportId).set({
    reporterUid: uid,
    householdId: hid,
    kind,
    targetId,
    reason,
    createdAt: ts(new Date()),
  });
  return { reportId };
}

/**
 * Removes `targetUid` from a household: tombstones their member doc, moves creator
 * ownership to the longest-standing remaining member, and clears them from
 * chore and open-instance assignees. The last member leaving deletes the household.
 *
 * `requireCreatorBy`: the acting uid must be the creator (removeMember).
 * `lenient`: a non-member is a no-op, and only the user's householdId is cleared (deleteAccount).
 */
export async function departMember(
  hid: string,
  targetUid: string,
  opts: { requireCreatorBy?: string; lenient?: boolean; rotateInvite?: boolean },
): Promise<'left' | 'deleted' | 'noop'> {
  const now = new Date();
  const hRef = householdRef(hid);
  const newCode = opts.rotateInvite ? await freeInviteCode() : null;
  const expiresAt = newCode ? ts(new Date(now.getTime() + INVITE_TTL_MS)) : null;
  let deleted = false;
  let noop = false;

  await db().runTransaction(async (tx) => {
    deleted = false;
    noop = false;
    const household = await tx.get(hRef);
    const user = await tx.get(userRef(targetUid));
    if (opts.requireCreatorBy) {
      assertCreator(household, opts.requireCreatorBy);
      if (!(household.data()!.memberUids as string[]).includes(targetUid)) {
        fail('not-found', 'That person is not a member of this household.');
      }
    }
    const isMember = household.exists && (household.data()!.memberUids as string[]).includes(targetUid);
    if (!isMember) {
      if (!opts.lenient) fail('permission-denied', 'You are not a member of this household.');
      if (user.exists && user.data()!.householdId === hid) {
        tx.set(userRef(targetUid), { householdId: null }, { merge: true });
      }
      noop = true;
      return;
    }

    const hh = household.data()!;
    const members = await tx.get(hRef.collection('members'));
    const chores = await tx.get(hRef.collection('chores').where('assigneeIds', 'array-contains', targetUid));
    const instances = await tx.get(hRef.collection('instances').where('assigneeIds', 'array-contains', targetUid));
    const meta = opts.rotateInvite ? await tx.get(inviteMetaRef(hid)) : null;
    const oldCode = meta?.exists ? (meta.data()!.code as string) : null;
    const oldInvite = oldCode ? await tx.get(inviteRef(oldCode)) : null;
    const remainingUids = (hh.memberUids as string[]).filter((id) => id !== targetUid);

    if (remainingUids.length === 0) {
      const codes = await tx.get(db().collection('inviteCodes').where('householdId', '==', hid));
      codes.docs.forEach((doc) => tx.delete(doc.ref));
      tx.delete(hRef);
      tx.set(userRef(targetUid), { householdId: null }, { merge: true });
      deleted = true;
      return;
    }

    const successor =
      hh.creatorUid === targetUid
        ? pickAdminSuccessor(
            remainingUids.map((id) => ({
              uid: id,
              role: (members.docs.find((d) => d.id === id)?.data().role ?? 'member') as MemberRole,
              joinedAt: members.docs.find((d) => d.id === id)?.data().joinedAt?.toDate() ?? now,
            })),
          )
        : null;

    tx.update(hRef, {
      memberUids: FieldValue.arrayRemove(targetUid),
      updatedAt: ts(now),
      ...(successor ? { creatorUid: successor } : {}),
    });
    tx.set(
      hRef.collection('members').doc(targetUid),
      { name: 'Former member', initials: '?', deleted: true, role: 'member' },
      { merge: true },
    );
    if (successor) tx.set(hRef.collection('members').doc(successor), { role: 'creator' }, { merge: true });
    if (newCode && expiresAt) {
      if (oldCode && oldInvite?.exists) tx.update(inviteRef(oldCode), { revoked: true });
      const invite = { code: newCode, expiresAt, uses: 0, maxUses: INVITE_MAX_USES, revoked: false };
      tx.set(inviteRef(newCode), { ...invite, householdId: hid });
      tx.set(inviteMetaRef(hid), invite);
    }
    for (const chore of chores.docs) {
      tx.update(chore.ref, { assigneeIds: FieldValue.arrayRemove(targetUid) });
    }
    for (const instance of instances.docs) {
      if (instance.data().status === 'done') continue;
      tx.update(instance.ref, { assigneeIds: FieldValue.arrayRemove(targetUid) });
    }
    tx.set(userRef(targetUid), { householdId: null }, { merge: true });
  });

  if (deleted) await db().recursiveDelete(hRef);
  if (noop) return 'noop';
  return deleted ? 'deleted' : 'left';
}

export async function leaveHousehold(uid: string, raw: unknown) {
  const hid = requireId(asObject(raw).householdId, 'householdId');
  await departMember(hid, uid, {});
  return { ok: true };
}

export async function removeMember(uid: string, raw: unknown) {
  const input = asObject(raw);
  const hid = requireId(input.householdId, 'householdId');
  const target = requireId(input.uid, 'uid');
  if (target === uid) fail('invalid-argument', 'Use leaveHousehold to leave the household.');
  await departMember(hid, target, { requireCreatorBy: uid, rotateInvite: true });
  return { ok: true };
}

export async function deleteAccount(uid: string) {
  const hid = await db().runTransaction(async (tx) => {
    const user = await tx.get(userRef(uid));
    if (!user.exists) return null;
    tx.set(userRef(uid), { deleting: true }, { merge: true });
    return user.data()?.householdId as string | null | undefined;
  });
  if (hid) {
    try {
      await departMember(hid, uid, { lenient: true });
    } catch (error) {
      // Unlock the profile so a failed deletion doesn't block create and join forever.
      await userRef(uid).set({ deleting: false }, { merge: true });
      throw error;
    }
  }
  await userRef(uid).delete();
  try {
    await getAuth().deleteUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
  }
  return { ok: true };
}

// ---- Chores --------------------------------------------------------------------

/**
 * Applies a chore definition and brings its future instances in line:
 * - a structural recurrence change, or reactivation, drops editable future instances
 *   and restarts generation from today;
 * - a plain edit rewrites editable future instances in place;
 * - pausing drops editable future instances.
 * Earned or started instances are never touched.
 */
async function writeChore(
  tx: Transaction,
  hid: string,
  household: Record<string, any>,
  now: Date,
  choreId: string,
  prev: ChoreRecord | null,
  next: ChoreFields,
) {
  const tz = household.timeZone as string;
  const today = dateKeyInTimeZone(now, tz);
  const restart = { recurrenceAnchor: today, generatedThrough: addDaysToDateKey(today, -1) };

  const openSnap = await tx.get(
    householdRef(hid).collection('instances').where('choreId', '==', choreId).where('status', '==', 'open'),
  );
  const editable = openSnap.docs.map(readInstance).filter((i) => isEditableFuture(i, now));

  const removed = new Set<string>();
  const refreshed: InstanceRecord[] = [];
  let base = restart;
  if (!prev) {
    // New chore: restart is the base.
  } else {
    const structural =
      recurrenceKey(prev.recurrence, prev.recurrenceAnchor) !== recurrenceKey(next.recurrence, prev.recurrenceAnchor);
    const reactivated = !prev.isActive && next.isActive;
    if (structural || reactivated) {
      editable.forEach((i) => removed.add(i.id));
      base = restart;
    } else {
      base = { recurrenceAnchor: prev.recurrenceAnchor, generatedThrough: prev.generatedThrough };
      refreshed.push(...editable);
    }
    if (!next.isActive) {
      editable.forEach((i) => removed.add(i.id));
      refreshed.length = 0;
    }
  }

  const record: ChoreRecord = { id: choreId, ...next, ...base };
  let generated: InstanceRecord[] = [];
  if (next.isActive) {
    const result = generateChoreInstances(record, now, tz);
    generated = result.instances;
    record.generatedThrough = result.generatedThrough;
  }

  const refs = generated.map((i) => instanceRef(hid, i.id));
  const existing = refs.length > 0 ? await tx.getAll(...refs) : [];

  const regenerated = new Set<string>();
  generated.forEach((instance, index) => {
    const exists = existing[index].exists && !removed.has(instance.id);
    if (exists) return;
    regenerated.add(instance.id);
    tx.set(refs[index], instanceDoc(instance));
  });
  for (const id of removed) {
    if (!regenerated.has(id)) tx.delete(instanceRef(hid, id));
  }
  for (const instance of refreshed) {
    tx.update(instanceRef(hid, instance.id), refreshedFields(instance, next, tz));
  }
  tx.set(choreRef(hid, choreId), {
    ...choreDoc(record),
    ...(prev ? {} : { createdAt: ts(now) }),
    updatedAt: ts(now),
  });
}

export async function saveChore(uid: string, raw: unknown) {
  const input = asObject(raw);
  const hid = requireId(input.householdId, 'householdId');
  const now = new Date();
  const hRef = householdRef(hid);

  return db().runTransaction(async (tx) => {
    const household = await tx.get(hRef);
    const hh = assertCreator(household, uid);
    const fields = parseChoreFields(input.chore, hh.memberUids as string[]);
    const { id, ...next } = fields;

    let prev: ChoreRecord | null = null;
    let choreId: string;
    if (id) {
      const snap = await tx.get(choreRef(hid, id));
      if (!snap.exists) fail('not-found', 'Chore not found.');
      prev = readChore(snap);
      choreId = id;
    } else {
      choreId = hRef.collection('chores').doc().id;
    }
    await writeChore(tx, hid, hh, now, choreId, prev, next);
    return { choreId };
  });
}

export async function setAssignments(uid: string, raw: unknown) {
  const input = asObject(raw);
  const hid = requireId(input.householdId, 'householdId');
  const choreId = requireId(input.choreId, 'choreId');
  const now = new Date();
  const hRef = householdRef(hid);

  return db().runTransaction(async (tx) => {
    const hh = assertCreator(await tx.get(hRef), uid);
    const chore = await tx.get(choreRef(hid, choreId));
    if (!chore.exists) fail('not-found', 'Chore not found.');
    const assigneeIds = parseAssigneeIds(input.assigneeIds, hh.memberUids as string[]);

    const openSnap = await tx.get(hRef.collection('instances').where('choreId', '==', choreId).where('status', '==', 'open'));
    const editable = openSnap.docs.map(readInstance).filter((i) => isEditableFuture(i, now));

    tx.update(choreRef(hid, choreId), { assigneeIds, updatedAt: ts(now) });
    for (const instance of editable) {
      tx.update(instanceRef(hid, instance.id), { assigneeIds });
    }
    return { choreId, assigneeIds };
  });
}

export async function setChoreActive(uid: string, raw: unknown) {
  const input = asObject(raw);
  const hid = requireId(input.householdId, 'householdId');
  const choreId = requireId(input.choreId, 'choreId');
  const isActive = input.isActive;
  if (typeof isActive !== 'boolean') fail('invalid-argument', 'isActive must be true or false.');
  const now = new Date();
  const hRef = householdRef(hid);

  return db().runTransaction(async (tx) => {
    const hh = assertCreator(await tx.get(hRef), uid);
    const chore = await tx.get(choreRef(hid, choreId));
    if (!chore.exists) fail('not-found', 'Chore not found.');
    const prev = readChore(chore);
    await writeChore(tx, hid, hh, now, choreId, prev, { ...fieldsOf(prev), isActive });
    return { choreId, isActive };
  });
}

export async function deleteChore(uid: string, raw: unknown) {
  const input = asObject(raw);
  const hid = requireId(input.householdId, 'householdId');
  const choreId = requireId(input.choreId, 'choreId');
  const now = new Date();
  const hRef = householdRef(hid);

  await db().runTransaction(async (tx) => {
    assertCreator(await tx.get(hRef), uid);
    const chore = await tx.get(choreRef(hid, choreId));
    if (!chore.exists) fail('not-found', 'Chore not found.');
    const openSnap = await tx.get(hRef.collection('instances').where('choreId', '==', choreId).where('status', '==', 'open'));
    const editable = openSnap.docs.map(readInstance).filter((i) => isEditableFuture(i, now));
    for (const instance of editable) tx.delete(instanceRef(hid, instance.id));
    tx.delete(choreRef(hid, choreId));
  });
  return { ok: true };
}

/** Creates any missing instances for one active chore, from its generatedThrough forward. */
export async function generateChoreInstancesFor(hid: string, choreId: string, now: Date): Promise<number> {
  const hRef = householdRef(hid);
  return db().runTransaction(async (tx) => {
    const household = await tx.get(hRef);
    if (!household.exists) return 0;
    const chore = await tx.get(choreRef(hid, choreId));
    if (!chore.exists || !readChore(chore).isActive) return 0;
    const record = readChore(chore);
    const result = generateChoreInstances(record, now, household.data()!.timeZone as string);
    const refs = result.instances.map((i) => instanceRef(hid, i.id));
    const existing = refs.length > 0 ? await tx.getAll(...refs) : [];

    let created = 0;
    result.instances.forEach((instance, index) => {
      if (existing[index].exists) return;
      tx.set(refs[index], instanceDoc(instance));
      created += 1;
    });
    if (result.generatedThrough !== record.generatedThrough) {
      tx.update(choreRef(hid, choreId), { generatedThrough: result.generatedThrough });
    }
    return created;
  });
}

// ---- Completion ----------------------------------------------------------------

function ledgerRow(input: {
  instanceId: string;
  subtaskId?: string;
  memberId: string;
  amount: number;
  source: 'subtask' | 'bonus' | 'undo-subtask' | 'undo-bonus' | 'revoke-subtask' | 'revoke-bonus';
  createdAt: Date;
  reversesEntryId?: string;
  moderation?: { actorUid: string; disputeId: string | null; verdict: 'partial' | 'not_done' };
}) {
  return {
    instanceId: input.instanceId,
    ...(input.subtaskId ? { subtaskId: input.subtaskId } : {}),
    memberId: input.memberId,
    amount: input.amount,
    source: input.source,
    createdAt: ts(input.createdAt),
    ...(input.reversesEntryId ? { reversesEntryId: input.reversesEntryId } : {}),
    ...(input.moderation ? { moderation: input.moderation } : {}),
  };
}

/** Reads each member's lifetime XP and returns it plus the new rows. Call before any transaction write. */
async function nextMemberXp(
  tx: Transaction,
  hid: string,
  rows: { memberId: string; amount: number }[],
): Promise<Map<string, number>> {
  const deltas = new Map<string, number>();
  for (const row of rows) deltas.set(row.memberId, (deltas.get(row.memberId) ?? 0) + row.amount);
  const totals = new Map<string, number>();
  for (const [memberId, delta] of deltas) {
    let base = (await tx.get(householdRef(hid).collection('members').doc(memberId))).get('xp');
    if (typeof base !== 'number') {
      // Members from before the xp counter: seed it once from their ledger rows.
      const ledger = await tx.get(ledgerCol(hid).where('memberId', '==', memberId));
      base = ledger.docs.reduce((sum, doc) => sum + (Number(doc.get('amount')) || 0), 0);
    }
    totals.set(memberId, base + delta);
  }
  return totals;
}

export async function completeSubtask(uid: string, raw: unknown) {
  const input = asObject(raw);
  const hid = requireId(input.householdId, 'householdId');
  const instanceId = requireId(input.instanceId, 'instanceId');
  const subtaskId = requireId(input.subtaskId, 'subtaskId');
  const now = new Date();
  const iRef = instanceRef(hid, instanceId);

  return db().runTransaction(async (tx) => {
    assertMember(await tx.get(householdRef(hid)), uid);
    const snap = await tx.get(iRef);
    if (!snap.exists) fail('not-found', 'Chore instance not found.');
    const instance = readInstance(snap);

    const subtask = instance.subtasks.find((candidate) => candidate.id === subtaskId);
    if (!subtask) fail('not-found', 'That subtask is not part of this chore.');
    if (instance.completions.some((c) => c.subtaskId === subtaskId)) {
      fail('already-exists', 'This subtask was already completed.');
    }
    if (instance.status === 'done') fail('failed-precondition', 'This chore is already completed.');
    if (isDue(instance.dueAt, now)) fail('failed-precondition', 'The deadline has passed.');

    const completion: Completion = {
      id: randomUUID(),
      instanceId,
      subtaskId,
      memberId: uid,
      xp: subtask.xp,
      completedAt: now,
      isAssist: instance.assigneeIds.length > 0 && !instance.assigneeIds.includes(uid),
    };
    const completions = [...instance.completions, completion];
    const rows = [
      ledgerRow({ instanceId, subtaskId, memberId: uid, amount: subtask.xp, source: 'subtask', createdAt: now }),
    ];

    let status: 'partial' | 'done' = 'partial';
    let bonusAwards: Record<string, number> = {};
    if (completions.length === instance.subtasks.length) {
      status = 'done';
      const contributors = [...new Set(completions.map((c) => c.memberId))];
      bonusAwards = calculateBonusAwards(instance.bonusXp, contributors, uid);
      for (const [memberId, amount] of Object.entries(bonusAwards)) {
        if (amount > 0) rows.push(ledgerRow({ instanceId, memberId, amount, source: 'bonus', createdAt: now }));
      }
    }

    const xpTotals = await nextMemberXp(tx, hid, rows);
    tx.update(iRef, {
      completions: completions.map((c) => ({ ...c, completedAt: ts(c.completedAt) })),
      status,
      bonusAwards,
    });
    for (const row of rows) tx.set(ledgerCol(hid).doc(), row);
    for (const [memberId, xp] of xpTotals) {
      tx.set(householdRef(hid).collection('members').doc(memberId), { xp }, { merge: true });
    }
    return { instanceId, subtaskId, status, completionId: completion.id };
  });
}

export async function undoSubtask(uid: string, raw: unknown) {
  const input = asObject(raw);
  const hid = requireId(input.householdId, 'householdId');
  const instanceId = requireId(input.instanceId, 'instanceId');
  const subtaskId = requireId(input.subtaskId, 'subtaskId');
  const now = new Date();
  const iRef = instanceRef(hid, instanceId);

  await db().runTransaction(async (tx) => {
    assertMember(await tx.get(householdRef(hid)), uid);
    const snap = await tx.get(iRef);
    if (!snap.exists) fail('not-found', 'Chore instance not found.');
    const instance = readInstance(snap);

    const completion = instance.completions.find((c) => c.subtaskId === subtaskId);
    if (!completion) fail('not-found', 'There is no completed subtask to undo.');
    if (completion.memberId !== uid) {
      fail('permission-denied', 'Only the member who completed this subtask can undo it.');
    }
    const age = now.getTime() - completion.completedAt.getTime();
    if (age < 0 || age > UNDO_WINDOW_MS) {
      fail('failed-precondition', 'Undo is available for 5 minutes after your completion.');
    }

    const [subtaskLedger, bonusLedger, reversalLedger] = await Promise.all([
      tx.get(ledgerCol(hid).where('instanceId', '==', instanceId).where('subtaskId', '==', subtaskId)),
      tx.get(ledgerCol(hid).where('instanceId', '==', instanceId).where('source', '==', 'bonus')),
      // undo-* and revoke-* both mark their source rows reversed; fetching both keeps
      // a revoked bonus row from ever being reversed a second time.
      tx.get(
        ledgerCol(hid)
          .where('instanceId', '==', instanceId)
          .where('source', 'in', ['undo-bonus', 'revoke-bonus']),
      ),
    ]);
    const rows = [...subtaskLedger.docs, ...bonusLedger.docs, ...reversalLedger.docs].map(
      (doc) => ({ id: doc.id, ...doc.data() }) as Record<string, any> & { id: string },
    );
    const reversed = new Set(rows.map((r) => r.reversesEntryId).filter(Boolean));
    const subtaskRow = rows.find(
      (r) =>
        r.source === 'subtask' &&
        r.subtaskId === subtaskId &&
        r.memberId === uid &&
        !reversed.has(r.id),
    );
    if (!subtaskRow) fail('failed-precondition', 'The subtask XP entry is missing.');
    const bonusRows = rows.filter((r) => r.source === 'bonus' && !reversed.has(r.id));

    const undoRows = [
      ledgerRow({
        instanceId,
        subtaskId,
        memberId: uid,
        amount: -subtaskRow.amount,
        source: 'undo-subtask',
        createdAt: now,
        reversesEntryId: subtaskRow.id,
      }),
    ];
    for (const bonus of bonusRows) {
      undoRows.push(
        ledgerRow({
          instanceId,
          memberId: bonus.memberId,
          amount: -bonus.amount,
          source: 'undo-bonus',
          createdAt: now,
          reversesEntryId: bonus.id,
        }),
      );
    }
    const xpTotals = await nextMemberXp(tx, hid, undoRows);
    for (const row of undoRows) tx.set(ledgerCol(hid).doc(), row);
    for (const [memberId, xp] of xpTotals) {
      tx.set(householdRef(hid).collection('members').doc(memberId), { xp }, { merge: true });
    }

    const remaining = instance.completions.filter((c) => c.subtaskId !== subtaskId);
    tx.update(iRef, {
      completions: remaining.map((c) => ({ ...c, completedAt: ts(c.completedAt) })),
      bonusAwards: {},
      status: undoInstanceStatus({ dueAt: instance.dueAt, now, remainingCompletions: remaining.length }),
    });
  });
  return { ok: true };
}

export async function postCompletion(uid: string, raw: unknown) {
  const input = asObject(raw);
  const hid = requireId(input.householdId, 'householdId');
  const instanceId = requireId(input.instanceId, 'instanceId');
  const now = new Date();
  const postRef = householdRef(hid).collection('feed').doc(`${instanceId}_${uid}`);

  return db().runTransaction(async (tx) => {
    assertMember(await tx.get(householdRef(hid)), uid);
    const snap = await tx.get(instanceRef(hid, instanceId));
    if (!snap.exists) fail('not-found', 'Chore instance not found.');
    const instance = readInstance(snap);
    if (instance.status !== 'done') fail('failed-precondition', 'Only completed chores can be shared.');
    if (!instance.completions.some((c) => c.memberId === uid)) {
      fail('permission-denied', 'Only a contributing member can share this completion.');
    }
    const existing = await tx.get(postRef);
    if (existing.exists) return { postId: postRef.id, created: false };
    tx.set(postRef, { instanceId, memberId: uid, createdAt: ts(now) });
    return { postId: postRef.id, created: true };
  });
}

// ---- Moderation (contract Part A) ----------------------------------------------

interface DisputeDoc {
  choreName: string;
  status: 'open' | 'resolved' | 'expired';
  subtaskIds: string[];
  completerIds: string[];
  reports: { uid: string; subtaskIds: string[]; reason: string; createdAt: Timestamp }[];
  expiresAt: Timestamp;
}

function readDispute(snap: DocumentSnapshot): DisputeDoc {
  const d = snap.data()!;
  return {
    choreName: d.choreName,
    status: d.status,
    subtaskIds: (d.subtaskIds ?? []) as string[],
    completerIds: (d.completerIds ?? []) as string[],
    reports: (d.reports ?? []) as DisputeDoc['reports'],
    expiresAt: d.expiresAt as Timestamp,
  };
}

/** The caller's member doc plus every member doc with admin rights. */
async function memberContext(tx: Transaction, hid: string, uid: string) {
  const members = await tx.get(householdRef(hid).collection('members'));
  const admins = members.docs.filter((doc) => hasAdminRights(doc.get('role'))).map((doc) => doc.id);
  return {
    admins,
    soleAdmin: admins.length === 1,
    callerRole: members.docs.find((doc) => doc.id === uid)?.get('role'),
    callerName: (members.docs.find((doc) => doc.id === uid)?.get('name') as string | undefined) ?? 'Someone',
  };
}

export async function setMemberRole(uid: string, raw: unknown) {
  const input = asObject(raw);
  const hid = requireId(input.householdId, 'householdId');
  const memberId = requireId(input.memberId, 'memberId');
  const role = requireOneOf(input.role, 'role', ['admin', 'member'] as const);
  const hRef = householdRef(hid);

  await db().runTransaction(async (tx) => {
    const hh = assertCreator(await tx.get(hRef), uid);
    if (memberId === uid) fail('invalid-argument', 'You cannot change your own role.');
    if (!(hh.memberUids as string[]).includes(memberId)) {
      fail('not-found', 'That person is not a member of this household.');
    }
    tx.set(hRef.collection('members').doc(memberId), { role }, { merge: true });
  });
  return { memberId, role };
}

export async function reportCompletion(uid: string, raw: unknown) {
  const input = asObject(raw);
  const hid = requireId(input.householdId, 'householdId');
  const instanceId = requireId(input.instanceId, 'instanceId');
  const reason = requireString(input.reason ?? '', 'reason', 0, 280);
  const now = new Date();
  const hRef = householdRef(hid);

  const outcome = await db().runTransaction(async (tx) => {
    assertMember(await tx.get(hRef), uid);
    const members = await memberContext(tx, hid, uid);
    if (hasAdminRights(members.callerRole)) {
      fail('permission-denied', 'Admins mark completions directly instead of reporting.');
    }
    const instanceSnap = await tx.get(instanceRef(hid, instanceId));
    if (!instanceSnap.exists) fail('not-found', 'Chore instance not found.');
    const instance = readInstance(instanceSnap);
    if (instance.completions.length === 0) fail('failed-precondition', 'This chore has no completions to report.');
    const targets = reportTargets(instance.completions, uid, input.subtaskIds, now);

    const choreName = instance.choreSnapshot.name;
    const completerIds = [...new Set(targets.map((id) => instance.completions.find((c) => c.subtaskId === id)!.memberId))];
    const earliest = Math.min(
      ...targets.map((id) => instance.completions.find((c) => c.subtaskId === id)!.completedAt.getTime()),
    );

    const dRef = disputeRef(hid, instanceId);
    const disputeSnap = await tx.get(dRef);
    if (!disputeSnap.exists) {
      tx.set(dRef, {
        instanceId,
        choreName,
        status: 'open',
        subtaskIds: targets,
        completerIds,
        reports: [{ uid, subtaskIds: targets, reason, createdAt: ts(now) }],
        createdAt: ts(now),
        expiresAt: ts(new Date(earliest + DISPUTE_WINDOW_MS)),
      });
    } else {
      const dispute = readDispute(disputeSnap);
      if (dispute.status !== 'open') fail('failed-precondition', 'An admin already reviewed this chore.');
      if (dispute.reports.some((report) => report.uid === uid)) {
        fail('already-exists', 'You already reported this chore.');
      }
      tx.update(dRef, {
        subtaskIds: [...new Set([...dispute.subtaskIds, ...targets])],
        completerIds: [...new Set([...dispute.completerIds, ...completerIds])],
        reports: [...dispute.reports, { uid, subtaskIds: targets, reason, createdAt: ts(now) }],
        // expiresAt keeps tracking the earliest disputed completion.
        expiresAt: ts(new Date(Math.min(dispute.expiresAt.toMillis(), earliest + DISPUTE_WINDOW_MS))),
      });
    }
    tx.update(instanceRef(hid, instanceId), { disputeStatus: 'open' });
    return { admins: members.admins, reporterName: members.callerName, choreName };
  });

  await pushToMembers({
    uids: outcome.admins,
    title: outcome.choreName,
    bodyFor: (locale) => reportReviewBody(locale, outcome.reporterName, outcome.choreName),
  });
  return { disputeId: instanceId };
}

/** The ledger fields revocation reads; every other field passes through untouched. */
interface RevocationLedgerRow {
  id: string;
  source: string;
  subtaskId?: string;
  memberId: string;
  amount: number;
  reversesEntryId?: string;
}

/**
 * Shared A3 revocation: reverses each revoked subtask's active ledger row (and, when
 * the instance was done, every active bonus row) with 'revoke-*' rows carrying
 * `reversesEntryId` and a `moderation` marker, moves the completions to
 * `revocations[]`, reopens the instance per the undo status rule, and updates member
 * XP. `disputeStatus` mirrors the dispute lifecycle when given.
 */
async function applyRevocation(
  tx: Transaction,
  hid: string,
  instance: InstanceRecord,
  revokedIds: string[],
  moderation: { actorUid: string; disputeId: string | null; verdict: 'partial' | 'not_done' },
  now: Date,
  extra: { disputeStatus?: 'open' | 'resolved' | 'expired' } = {},
): Promise<string[]> {
  const revoked = revokedIds
    .map((subtaskId) => ({ subtaskId, completion: instance.completions.find((c) => c.subtaskId === subtaskId) }))
    .filter((entry): entry is { subtaskId: string; completion: Completion } => Boolean(entry.completion));
  if (revoked.length === 0) {
    if (extra.disputeStatus) tx.update(instanceRef(hid, instance.id), { disputeStatus: extra.disputeStatus });
    return [];
  }

  const ledger = await tx.get(ledgerCol(hid).where('instanceId', '==', instance.id));
  const rows = ledger.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as RevocationLedgerRow);
  const reversed = new Set(rows.map((row) => row.reversesEntryId).filter((id): id is string => Boolean(id)));

  const revokeRows: ReturnType<typeof ledgerRow>[] = [];
  for (const { subtaskId, completion } of revoked) {
    const subtaskRow = rows.find(
      (row) => row.source === 'subtask' && row.subtaskId === subtaskId && !reversed.has(row.id),
    );
    if (!subtaskRow) fail('failed-precondition', 'The subtask XP entry is missing.');
    revokeRows.push(
      ledgerRow({
        instanceId: instance.id,
        subtaskId,
        memberId: completion.memberId,
        amount: -subtaskRow.amount,
        source: 'revoke-subtask',
        createdAt: now,
        reversesEntryId: subtaskRow.id,
        moderation,
      }),
    );
  }

  const wasDone = instance.status === 'done';
  if (wasDone) {
    for (const bonus of rows.filter((row) => row.source === 'bonus' && !reversed.has(row.id))) {
      revokeRows.push(
        ledgerRow({
          instanceId: instance.id,
          memberId: bonus.memberId,
          amount: -bonus.amount,
          source: 'revoke-bonus',
          createdAt: now,
          reversesEntryId: bonus.id,
          moderation,
        }),
      );
    }
  }

  const xpTotals = await nextMemberXp(tx, hid, revokeRows);
  for (const row of revokeRows) tx.set(ledgerCol(hid).doc(), row);
  for (const [memberId, xp] of xpTotals) {
    tx.set(householdRef(hid).collection('members').doc(memberId), { xp }, { merge: true });
  }

  const remaining = instance.completions.filter((c) => !revokedIds.includes(c.subtaskId));
  tx.update(instanceRef(hid, instance.id), {
    completions: remaining.map((c) => ({ ...c, completedAt: ts(c.completedAt) })),
    revocations: [
      ...(instance.revocations ?? []),
      ...revoked.map(({ subtaskId, completion }) => ({
        subtaskId,
        memberId: completion.memberId,
        xp: completion.xp,
        actorUid: moderation.actorUid,
        verdict: moderation.verdict,
        at: ts(now),
      })),
    ],
    status: undoInstanceStatus({ dueAt: instance.dueAt, now, remainingCompletions: remaining.length }),
    ...(wasDone ? { bonusAwards: {} } : {}),
    ...(extra.disputeStatus ? { disputeStatus: extra.disputeStatus } : {}),
  });
  return revoked.map(({ subtaskId }) => subtaskId);
}

export async function resolveDispute(uid: string, raw: unknown) {
  const input = asObject(raw);
  const hid = requireId(input.householdId, 'householdId');
  const disputeId = requireId(input.disputeId, 'disputeId');
  const verdict = requireOneOf(input.verdict, 'verdict', ['done', 'partial', 'not_done'] as const);
  const now = new Date();
  const hRef = householdRef(hid);

  const outcome = await db().runTransaction(async (tx) => {
    assertMember(await tx.get(hRef), uid);
    const members = await memberContext(tx, hid, uid);
    if (!hasAdminRights(members.callerRole)) {
      fail('permission-denied', 'Only members with admin rights can review reports.');
    }
    const disputeSnap = await tx.get(disputeRef(hid, disputeId));
    if (!disputeSnap.exists) fail('not-found', 'Dispute not found.');
    const dispute = readDispute(disputeSnap);
    if (dispute.status !== 'open') fail('failed-precondition', 'An admin already reviewed this chore.');
    // The 72-hour window holds until the closeWeeks job marks the dispute expired.
    if (now.getTime() > dispute.expiresAt.toMillis()) {
      fail('failed-precondition', 'The 72-hour dispute window has closed.');
    }
    const targets = resolveTargets(dispute, verdict, input.subtaskIds);

    const instanceSnap = await tx.get(instanceRef(hid, disputeId));
    if (!instanceSnap.exists) fail('not-found', 'Chore instance not found.');
    const instance = readInstance(instanceSnap);
    assertNoConflict(instance.completions, dispute.subtaskIds, uid, members.soleAdmin);

    let revokedIds: string[] = [];
    if (verdict === 'done') {
      tx.update(instanceRef(hid, disputeId), { disputeStatus: 'resolved' });
    } else {
      revokedIds = await applyRevocation(
        tx,
        hid,
        instance,
        targets,
        { actorUid: uid, disputeId, verdict },
        now,
        { disputeStatus: 'resolved' },
      );
    }
    tx.update(disputeRef(hid, disputeId), {
      status: 'resolved',
      verdict,
      revokedSubtaskIds: revokedIds,
      resolverUid: uid,
      resolvedAt: ts(now),
    });
    return {
      revokedIds,
      recipients: [...new Set([...dispute.completerIds, ...dispute.reports.map((report) => report.uid)])].filter(
        (memberId) => memberId !== uid,
      ),
      choreName: dispute.choreName,
    };
  });

  await pushToMembers({
    uids: outcome.recipients,
    title: outcome.choreName,
    bodyFor: (locale) => completionReviewedBody(locale),
  });
  return { disputeId, verdict, revokedSubtaskIds: outcome.revokedIds };
}

export async function moderateInstance(uid: string, raw: unknown) {
  const input = asObject(raw);
  const hid = requireId(input.householdId, 'householdId');
  const instanceId = requireId(input.instanceId, 'instanceId');
  const verdict = requireOneOf(input.verdict, 'verdict', ['partial', 'not_done'] as const);
  const now = new Date();
  const hRef = householdRef(hid);

  const outcome = await db().runTransaction(async (tx) => {
    assertMember(await tx.get(hRef), uid);
    const members = await memberContext(tx, hid, uid);
    if (!hasAdminRights(members.callerRole)) {
      fail('permission-denied', 'Only members with admin rights can review completions.');
    }
    const instanceSnap = await tx.get(instanceRef(hid, instanceId));
    if (!instanceSnap.exists) fail('not-found', 'Chore instance not found.');
    const instance = readInstance(instanceSnap);
    const targets = moderateTargets(instance.completions, verdict, input.subtaskIds);
    assertWithinDisputeWindow(instance.completions, targets, now);
    assertNoConflict(instance.completions, targets, uid, members.soleAdmin);

    const disputeSnap = await tx.get(disputeRef(hid, instanceId));
    const openDispute = disputeSnap.exists && readDispute(disputeSnap).status === 'open';
    const revokedIds = await applyRevocation(
      tx,
      hid,
      instance,
      targets,
      { actorUid: uid, disputeId: null, verdict },
      now,
      openDispute ? { disputeStatus: 'resolved' } : {},
    );
    if (openDispute) {
      tx.update(disputeRef(hid, instanceId), {
        status: 'resolved',
        verdict,
        revokedSubtaskIds: revokedIds,
        resolverUid: uid,
        resolvedAt: ts(now),
      });
    }

    const dispute = openDispute ? readDispute(disputeSnap) : null;
    const revokedCompleters = instance.completions
      .filter((c) => revokedIds.includes(c.subtaskId))
      .map((c) => c.memberId);
    return {
      revokedIds,
      recipients: [
        ...new Set([...(dispute?.completerIds ?? []), ...(dispute?.reports.map((report) => report.uid) ?? []), ...revokedCompleters]),
      ].filter((memberId) => memberId !== uid),
      choreName: instance.choreSnapshot.name,
    };
  });

  await pushToMembers({
    uids: outcome.recipients,
    title: outcome.choreName,
    bodyFor: (locale) => completionReviewedBody(locale),
  });
  return { instanceId, verdict, revokedSubtaskIds: outcome.revokedIds };
}
