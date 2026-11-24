import { Timestamp, type DocumentReference, type DocumentSnapshot } from 'firebase-admin/firestore';
import { db } from '../admin';
import { DomainError } from '../domain/errors';
import { validateRuleSet, type RuleSet } from '../domain/gamification';
import { invalidateGamiConfigCache } from '../gamification/config';
import { GAMI_CONFIG_PATH, GAMI_RULE_SETS_PATH, gamiRuleSetPath } from '../gamification/paths';
import type {
  AdminListRuleSetsResponse,
  AdminPublishResponse,
  AdminRollbackResponse,
  AdminRuleSet,
  AdminSaveDraftResponse,
  RuleSetStatus,
} from './api-types';
import { writeAuditTx } from './audit';
import { configFromDoc, newCohortSalt } from './config';
import { asObject, requirePositiveVersion, stringOr, toIso, toIsoOrEpoch } from './parse';

// Rule set lifecycle (C2, C10): draft -> published -> archived. The config's activeVersion points at the
// published set and previousVersion at the one a rollback returns to. Every change to the pair and to the
// statuses happens in one transaction.

const NOTES_MAX = 2000;
const STATUSES: readonly RuleSetStatus[] = ['draft', 'published', 'archived'];

const ruleSetRef = (version: number): DocumentReference => db().doc(gamiRuleSetPath(version));

function statusOf(value: unknown): RuleSetStatus {
  return STATUSES.find((status) => status === value) ?? 'archived';
}

/** Validates a client-supplied rule set; the error list goes into the message so the admin app can show it. */
export function validateOrThrow(raw: unknown): RuleSet {
  const result = validateRuleSet(raw);
  if (!result.ok) {
    throw new DomainError('invalid-argument', `Invalid rule set: ${result.errors.join('; ')}`);
  }
  return result.rules;
}

function ruleSetFromDoc(snap: DocumentSnapshot): AdminRuleSet | null {
  const version = Number(snap.id);
  if (!Number.isInteger(version) || version < 1) return null;
  const validated = validateRuleSet(snap.get('rules'));
  if (!validated.ok) {
    throw new DomainError('failed-precondition', `Stored rule set ${version} is invalid: ${validated.errors.slice(0, 3).join('; ')}`);
  }
  return {
    version,
    status: statusOf(snap.get('status')),
    notes: stringOr(snap.get('notes'), ''),
    createdBy: stringOr(snap.get('createdBy'), ''),
    createdAt: toIsoOrEpoch(snap.get('createdAt')),
    publishedAt: toIso(snap.get('publishedAt')),
    rules: validated.rules,
  };
}

export async function listRuleSets(): Promise<AdminListRuleSetsResponse> {
  const snap = await db().collection(GAMI_RULE_SETS_PATH).get();
  const ruleSets = snap.docs.flatMap((doc) => {
    const parsed = ruleSetFromDoc(doc);
    return parsed === null ? [] : [parsed];
  });
  return { ruleSets: ruleSets.sort((a, b) => b.version - a.version) };
}

export async function saveDraft(actorUid: string, raw: unknown): Promise<AdminSaveDraftResponse> {
  const data = asObject(raw);
  const notes = data.notes;
  if (typeof notes !== 'string' || notes.length > NOTES_MAX) {
    throw new DomainError('invalid-argument', `notes must be a string of at most ${NOTES_MAX} characters.`);
  }
  const rules = validateOrThrow(data.rules);
  const existing = data.version === undefined ? null : requirePositiveVersion(data);
  const now = new Date();

  return db().runTransaction(async (tx) => {
    if (existing !== null) {
      const ref = ruleSetRef(existing);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new DomainError('not-found', `Rule set ${existing} does not exist.`);
      const status = statusOf(snap.get('status'));
      if (status !== 'draft') {
        throw new DomainError('failed-precondition', `Rule set ${existing} is ${status}; only drafts can be edited.`);
      }
      tx.update(ref, { rules, notes, updatedAt: Timestamp.fromDate(now), updatedBy: actorUid });
      writeAuditTx(tx, {
        action: 'ruleSet.updateDraft',
        actorUid,
        before: { version: existing, status },
        after: { version: existing, status: 'draft' },
        at: now,
      });
      return { version: existing, status: 'draft' as const, createdAt: toIsoOrEpoch(snap.get('createdAt')) };
    }

    // Versions are never reused: the next integer after the highest existing id.
    const ids = await tx.get(db().collection(GAMI_RULE_SETS_PATH).select());
    const highest = ids.docs.reduce((max, doc) => Math.max(max, Number(doc.id) || 0), 0);
    const version = highest + 1;
    tx.create(ruleSetRef(version), {
      version,
      status: 'draft',
      notes,
      createdBy: actorUid,
      createdAt: Timestamp.fromDate(now),
      publishedAt: null,
      rules,
    });
    writeAuditTx(tx, {
      action: 'ruleSet.createDraft',
      actorUid,
      before: null,
      after: { version, status: 'draft' },
      at: now,
    });
    return { version, status: 'draft' as const, createdAt: now.toISOString() };
  });
}

export async function publish(actorUid: string, raw: unknown): Promise<AdminPublishResponse> {
  const version = requirePositiveVersion(asObject(raw));
  const now = new Date();
  const result = await db().runTransaction(async (tx) => {
    const configRef = db().doc(GAMI_CONFIG_PATH);
    const [configSnap, targetSnap] = await Promise.all([tx.get(configRef), tx.get(ruleSetRef(version))]);
    const config = configFromDoc(configSnap.data());
    if (!targetSnap.exists) throw new DomainError('not-found', `Rule set ${version} does not exist.`);
    const status = statusOf(targetSnap.get('status'));
    if (status !== 'draft') {
      throw new DomainError('failed-precondition', `Rule set ${version} is ${status}; only a draft can be published.`);
    }
    // Re-validate: a draft is only ever as good as the validator of the day it is published.
    validateOrThrow(targetSnap.get('rules'));
    const previous = config.activeVersion;
    const previousRef = previous === null ? null : ruleSetRef(previous);
    const previousSnap = previousRef === null ? null : await tx.get(previousRef);

    tx.update(ruleSetRef(version), { status: 'published', publishedAt: Timestamp.fromDate(now) });
    if (previousRef !== null && previousSnap !== null && previousSnap.exists) {
      tx.update(previousRef, { status: 'archived' });
    }
    tx.set(
      configRef,
      {
        activeVersion: version,
        previousVersion: previous,
        cohortSalt: config.cohortSalt !== '' ? config.cohortSalt : newCohortSalt(),
      },
      { merge: true },
    );
    writeAuditTx(tx, {
      action: 'ruleSet.publish',
      actorUid,
      before: { activeVersion: previous, previousVersion: config.previousVersion },
      after: { activeVersion: version, previousVersion: previous },
      at: now,
    });
    return { activeVersion: version, previousVersion: previous, publishedAt: now.toISOString() };
  });
  invalidateGamiConfigCache();
  return result;
}

/** activeVersion <-> previousVersion; the set that becomes active is `published` again, the other `archived`. */
export async function rollback(actorUid: string): Promise<AdminRollbackResponse> {
  const now = new Date();
  const result = await db().runTransaction(async (tx) => {
    const configRef = db().doc(GAMI_CONFIG_PATH);
    const config = configFromDoc((await tx.get(configRef)).data());
    const { activeVersion, previousVersion } = config;
    if (previousVersion === null) {
      throw new DomainError('failed-precondition', 'There is no previous rule set to roll back to.');
    }
    const target = await tx.get(ruleSetRef(previousVersion));
    if (!target.exists) {
      throw new DomainError('failed-precondition', `Previous rule set ${previousVersion} no longer exists.`);
    }
    const activeRef = activeVersion === null ? null : ruleSetRef(activeVersion);
    const activeSnap = activeRef === null ? null : await tx.get(activeRef);

    tx.update(ruleSetRef(previousVersion), { status: 'published' });
    if (activeRef !== null && activeSnap !== null && activeSnap.exists) tx.update(activeRef, { status: 'archived' });
    tx.set(configRef, { activeVersion: previousVersion, previousVersion: activeVersion }, { merge: true });
    writeAuditTx(tx, {
      action: 'ruleSet.rollback',
      actorUid,
      before: { activeVersion, previousVersion },
      after: { activeVersion: previousVersion, previousVersion: activeVersion },
      at: now,
    });
    return { activeVersion: previousVersion, previousVersion: activeVersion };
  });
  invalidateGamiConfigCache();
  return result;
}
