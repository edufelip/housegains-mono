import { db } from '../admin';
import type { Track } from '../domain/gamification';
import { GAMI_ADJUSTMENTS_PATH } from '../gamification/paths';
import type {
  AdjustReasonCode,
  AdminLedgerRow,
  AdminLookupUserResponse,
  AdminPendingAdjustment,
  AdminWalletSummary,
} from './api-types';
import { asObject, numberOr, requireString, stringOr, toIso, toIsoOrEpoch } from './parse';

// adminLookupUser (C10): the wallet projection, the newest ledger rows with a human explanation each, and the
// adjustments still waiting for a second admin.

export const LOOKUP_LEDGER_LIMIT = 500;

const REASON_CODES: readonly AdjustReasonCode[] = ['correction', 'abuse', 'support-goodwill'];

export function reasonCodeOf(value: unknown): AdjustReasonCode {
  return REASON_CODES.find((code) => code === value) ?? 'correction';
}

function walletSummary(uid: string, data: Record<string, unknown>): AdminWalletSummary {
  const streak = typeof data.streak === 'object' && data.streak !== null ? (data.streak as Record<string, unknown>) : {};
  return {
    uid,
    householdId: typeof data.householdId === 'string' ? data.householdId : null,
    balance: numberOr(data.balance, 0),
    pendingBalance: numberOr(data.pendingBalance, 0),
    lifetimeEarned: numberOr(data.lifetimeEarned, 0),
    nextSpendableAt: toIso(data.nextSpendableAt),
    level: numberOr(data.level, 1),
    xpPeak: numberOr(data.xpPeak, 0),
    streak: {
      current: numberOr(streak.current, 0),
      record: numberOr(streak.record, 0),
      folgas: numberOr(streak.folgas, 0),
    },
    updatedAt: toIso(data.updatedAt),
  };
}

/** One sentence for the support agent: which rule paid, under which rule set, what it reverses, the admin note. */
export function explainRow(row: {
  ruleId: string;
  ruleSetVersion: number | null;
  amount: number;
  sourceRef: string;
  reversesEntryId: string | null;
  reason: string | null;
  reasonCode: string | null;
}): string {
  if (row.ruleId === 'admin.adjust') {
    const code = row.reasonCode === null ? '' : ` (${row.reasonCode})`;
    return `Admin adjustment${code}: ${row.reason ?? 'no note'}`;
  }
  const version = row.ruleSetVersion === null ? 'the built-in default rule set' : `rule set v${row.ruleSetVersion}`;
  if (row.reversesEntryId !== null) {
    return `Reversal of ${row.reversesEntryId}: rule ${row.ruleId} (${version}) clawed ${Math.abs(row.amount)} back${
      row.reason === null ? '' : ` — ${row.reason}`
    }`;
  }
  return `Rule ${row.ruleId} (${version}) paid ${row.amount} for ${row.sourceRef}${row.reason === null ? '' : ` — ${row.reason}`}`;
}

export function ledgerRowFromDoc(id: string, d: Record<string, unknown>, fallbackHouseholdId: string): AdminLedgerRow {
  const reversesEntryId = typeof d.reversesEntryId === 'string' ? d.reversesEntryId : null;
  const reason = typeof d.reason === 'string' ? d.reason : null;
  const ruleId = stringOr(d.ruleId, 'unknown');
  const ruleSetVersion = typeof d.ruleSetVersion === 'number' ? d.ruleSetVersion : null;
  const sourceRef = stringOr(d.sourceRef, '');
  const amount = numberOr(d.amount, 0);
  const track: Track = d.track === 'zelo' ? 'zelo' : 'ganhos';
  return {
    key: stringOr(d.key, id),
    ruleId,
    ruleSetVersion,
    track,
    amount,
    sourceRef,
    householdId: stringOr(d.householdId, fallbackHouseholdId),
    memberId: stringOr(d.memberId, ''),
    reversesEntryId,
    reason,
    createdAt: toIsoOrEpoch(d.createdAt),
    spendableAt: toIsoOrEpoch(d.spendableAt),
    explanation: explainRow({
      ruleId,
      ruleSetVersion,
      amount,
      sourceRef,
      reversesEntryId,
      reason,
      reasonCode: typeof d.reasonCode === 'string' ? d.reasonCode : null,
    }),
  };
}

export function pendingAdjustmentFromDoc(id: string, d: Record<string, unknown>): AdminPendingAdjustment {
  return {
    id,
    uid: stringOr(d.uid, ''),
    amount: numberOr(d.amount, 0),
    reasonCode: reasonCodeOf(d.reasonCode),
    note: stringOr(d.note, ''),
    createdBy: stringOr(d.createdBy, ''),
    createdAt: toIsoOrEpoch(d.createdAt),
  };
}

export async function lookupUser(raw: unknown): Promise<AdminLookupUserResponse> {
  const uid = requireString(asObject(raw), 'uid', 128);
  const [walletSnap, ledgerSnap, pendingSnap] = await Promise.all([
    db().doc(`wallets/${uid}`).get(),
    db().collection(`wallets/${uid}/ledger`).orderBy('createdAt', 'desc').limit(LOOKUP_LEDGER_LIMIT).get(),
    db().collection(GAMI_ADJUSTMENTS_PATH).where('uid', '==', uid).where('status', '==', 'pending').get(),
  ]);
  const wallet = walletSnap.exists ? walletSummary(uid, walletSnap.data()!) : null;
  const fallbackHouseholdId = wallet?.householdId ?? '';
  return {
    uid,
    wallet,
    ledger: ledgerSnap.docs.map((doc) => ledgerRowFromDoc(doc.id, doc.data(), fallbackHouseholdId)),
    pendingAdjustments: pendingSnap.docs
      .map((doc) => pendingAdjustmentFromDoc(doc.id, doc.data()))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}
