import { Timestamp, type Transaction } from 'firebase-admin/firestore';
import { db } from '../admin';
import { DomainError } from '../domain/errors';
import { walletFromDoc, walletToDoc } from '../gamification/serialize';
import { GAMI_ADJUSTMENTS_PATH } from '../gamification/paths';
import { walletKey } from '../domain/gamification';
import type {
  AdjustReasonCode,
  AdminAdjustResponse,
  AdminApproveAdjustmentResponse,
} from './api-types';
import { writeAuditTx } from './audit';
import { reasonCodeOf } from './lookup';
import { asObject, numberOr, requireInteger, requireString } from './parse';

// adminAdjust / adminApproveAdjustment (C10). |amount| <= IMMEDIATE_LIMIT applies at once; anything larger is
// stored as a pending adjustment that a DIFFERENT admin approves. Applying is one transaction that writes the
// wallet ledger row (create(): the deterministic key means an adjustment can never be applied twice) and the
// projection, and refuses a balance below zero.

export const IMMEDIATE_LIMIT = 500;
export const ADMIN_ADJUST_RULE_ID = 'admin.adjust';
const REASON_CODES: readonly AdjustReasonCode[] = ['correction', 'abuse', 'support-goodwill'];
const NOTE_MAX = 500;

interface AdjustmentInput {
  uid: string;
  amount: number;
  reasonCode: AdjustReasonCode;
  note: string;
}

function parseAdjustment(raw: unknown): AdjustmentInput {
  const data = asObject(raw);
  const uid = requireString(data, 'uid', 128);
  const amount = requireInteger(data, 'amount');
  if (amount === 0) throw new DomainError('invalid-argument', 'amount must not be zero.');
  const reasonCode = data.reasonCode;
  if (typeof reasonCode !== 'string' || !REASON_CODES.some((code) => code === reasonCode)) {
    throw new DomainError('invalid-argument', `reasonCode must be one of ${REASON_CODES.join(', ')}.`);
  }
  const note = requireString(data, 'note', NOTE_MAX).trim();
  return { uid, amount, reasonCode: reasonCodeOf(reasonCode), note };
}

/** Ledger key of an adjustment, deterministic from its id (same `{ruleId}:{sourceRef}:{memberId}` shape as C3). */
export const adjustmentLedgerKey = (adjustmentId: string, uid: string) => walletKey(ADMIN_ADJUST_RULE_ID, adjustmentId, uid);

/**
 * Applies one adjustment inside an open transaction. The caller has already done every read except the wallet's;
 * this reads the wallet, then writes the ledger row and the projection.
 */
async function applyInTx(
  tx: Transaction,
  input: AdjustmentInput & { adjustmentId: string; actorUid: string; now: Date },
): Promise<{ before: number; after: number }> {
  const walletRef = db().doc(`wallets/${input.uid}`);
  const walletSnap = await tx.get(walletRef);
  if (!walletSnap.exists) throw new DomainError('not-found', `User ${input.uid} has no wallet.`);
  const walletData = walletSnap.data()!;
  const householdId = typeof walletData.householdId === 'string' ? walletData.householdId : '';
  const wallet = walletFromDoc(walletData, householdId, input.uid);
  const before = numberOr(walletData.balance, 0);
  const after = before + input.amount;
  if (after < 0) {
    throw new DomainError('failed-precondition', `Balance ${before} cannot absorb ${input.amount}; it would go below zero.`);
  }
  const key = adjustmentLedgerKey(input.adjustmentId, input.uid);
  tx.create(db().doc(`wallets/${input.uid}/ledger/${key}`), {
    key,
    ruleId: ADMIN_ADJUST_RULE_ID,
    ruleSetVersion: null,
    track: 'ganhos',
    amount: input.amount,
    sourceRef: input.adjustmentId,
    householdId,
    memberId: input.uid,
    reason: input.note,
    reasonCode: input.reasonCode,
    adjustmentId: input.adjustmentId,
    appliedBy: input.actorUid,
    createdAt: Timestamp.fromDate(input.now),
    // Spendable at once, so a rebuild (which counts only future spendableAt as pending) agrees with this projection.
    spendableAt: Timestamp.fromDate(input.now),
  });
  // Same bookkeeping rebuildWalletProjection applies to a row without reversesEntryId: the balance moves, and only
  // a positive amount counts as earned.
  wallet.balance = after;
  if (input.amount > 0) wallet.lifetimeEarned += input.amount;
  wallet.updatedAt = input.now;
  tx.set(db().doc(`wallets/${input.uid}`), walletToDoc(wallet));
  return { before, after };
}

export async function adjust(actorUid: string, raw: unknown): Promise<AdminAdjustResponse> {
  const input = parseAdjustment(raw);
  const now = new Date();

  if (Math.abs(input.amount) <= IMMEDIATE_LIMIT) {
    const adjustmentId = db().collection(GAMI_ADJUSTMENTS_PATH).doc().id;
    await db().runTransaction(async (tx) => {
      const { before, after } = await applyInTx(tx, { ...input, adjustmentId, actorUid, now });
      writeAuditTx(tx, {
        action: 'adjust.apply',
        actorUid,
        before: { uid: input.uid, balance: before },
        after: {
          uid: input.uid,
          balance: after,
          amount: input.amount,
          reasonCode: input.reasonCode,
          note: input.note,
          adjustmentId,
        },
        at: now,
      });
    });
    return { id: null, status: 'applied' };
  }

  const ref = db().collection(GAMI_ADJUSTMENTS_PATH).doc();
  await db().runTransaction(async (tx) => {
    // A pending adjustment for a user without a wallet could never be approved: refuse it now.
    if (!(await tx.get(db().doc(`wallets/${input.uid}`))).exists) {
      throw new DomainError('not-found', `User ${input.uid} has no wallet.`);
    }
    tx.create(ref, {
      uid: input.uid,
      amount: input.amount,
      reasonCode: input.reasonCode,
      note: input.note,
      status: 'pending',
      createdBy: actorUid,
      createdAt: Timestamp.fromDate(now),
    });
    writeAuditTx(tx, {
      action: 'adjust.request',
      actorUid,
      before: null,
      after: {
        uid: input.uid,
        amount: input.amount,
        reasonCode: input.reasonCode,
        note: input.note,
        adjustmentId: ref.id,
        status: 'pending',
      },
      at: now,
    });
  });
  return { id: ref.id, status: 'pending' };
}

export async function approveAdjustment(actorUid: string, raw: unknown): Promise<AdminApproveAdjustmentResponse> {
  const id = requireString(asObject(raw), 'id', 128);
  const now = new Date();
  await db().runTransaction(async (tx) => {
    const ref = db().doc(`${GAMI_ADJUSTMENTS_PATH}/${id}`);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DomainError('not-found', `Adjustment ${id} does not exist.`);
    // The requester is never allowed, whatever the status; only then does an already-applied one say so.
    if (snap.get('createdBy') === actorUid) {
      throw new DomainError('permission-denied', 'A different admin must approve this adjustment.');
    }
    if (snap.get('status') !== 'pending') {
      throw new DomainError('failed-precondition', `Adjustment ${id} is already ${String(snap.get('status'))}.`);
    }
    const input: AdjustmentInput = {
      uid: String(snap.get('uid')),
      amount: Number(snap.get('amount')),
      reasonCode: reasonCodeOf(snap.get('reasonCode')),
      note: String(snap.get('note')),
    };
    const { before, after } = await applyInTx(tx, { ...input, adjustmentId: id, actorUid, now });
    tx.update(ref, { status: 'applied', approvedBy: actorUid, appliedAt: Timestamp.fromDate(now) });
    writeAuditTx(tx, {
      action: 'adjust.approve',
      actorUid,
      before: { uid: input.uid, balance: before, status: 'pending', requestedBy: String(snap.get('createdBy')) },
      after: {
        uid: input.uid,
        balance: after,
        status: 'applied',
        amount: input.amount,
        reasonCode: input.reasonCode,
        adjustmentId: id,
      },
      at: now,
    });
  });
  return { id, status: 'applied', approvedBy: actorUid, appliedAt: now.toISOString() };
}
