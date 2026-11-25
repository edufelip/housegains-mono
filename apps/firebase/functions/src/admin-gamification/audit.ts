import { Timestamp, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { db } from '../admin';
import { GAMI_AUDIT_PATH } from '../gamification/paths';

// gamification/audit/items/{id} (C10): one row per admin mutation, written in the same
// transaction as the change it records so the two can never disagree.

export type AuditSummary = Record<string, string | number | boolean | null | string[] | number[]>;

export interface AuditEntry {
  action: string;
  actorUid: string;
  before: AuditSummary | null;
  after: AuditSummary | null;
  at: Date;
}

function auditDoc(entry: AuditEntry): Record<string, unknown> {
  return {
    action: entry.action,
    actorUid: entry.actorUid,
    at: Timestamp.fromDate(entry.at),
    before: entry.before,
    after: entry.after,
  };
}

export function auditRef(): DocumentReference {
  return db().collection(GAMI_AUDIT_PATH).doc();
}

/** Adds the audit row to an open transaction. */
export function writeAuditTx(tx: Transaction, entry: AuditEntry): void {
  tx.create(auditRef(), auditDoc(entry));
}

/** For mutations that are not transactional (the level-floor backfill writes chunks). */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  await auditRef().create(auditDoc(entry));
}
