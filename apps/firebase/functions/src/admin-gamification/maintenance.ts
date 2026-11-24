import { FieldPath, Timestamp, type DocumentSnapshot, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { db } from '../admin';
import { DomainError } from '../domain/errors';
import { PROJECTION_VERSION, rebuildWalletProjection, type WalletLedgerRowInput } from '../domain/gamification';
import { GAMI_ALERTS_PATH } from '../gamification/paths';
import { walletFromDoc, walletToDoc } from '../gamification/serialize';
import type {
  AdminAlert,
  AdminBackfillLevelFloorsResponse,
  AdminListAlertsResponse,
  AdminRebuildWalletResponse,
  AlertKind,
} from './api-types';
import { writeAudit, writeAuditTx } from './audit';
import { asObject, numberOr, requireString, stringOr, toIsoOrEpoch } from './parse';

// adminListAlerts, adminRebuildWallet and adminBackfillLevelFloors (C9, C10).

export const ALERT_LIMIT = 200;
const ALERT_KINDS: readonly AlertKind[] = ['velocity', 'chore-xp-raise', 'undo-rate'];

function alertFromDoc(doc: QueryDocumentSnapshot): AdminAlert | null {
  const kind = ALERT_KINDS.find((candidate) => candidate === doc.get('kind'));
  if (kind === undefined) return null;
  const rawData = doc.get('data');
  const data: Record<string, string | number> = {};
  if (typeof rawData === 'object' && rawData !== null) {
    for (const [key, value] of Object.entries(rawData as Record<string, unknown>)) {
      if (typeof value === 'string' || typeof value === 'number') data[key] = value;
    }
  }
  const memberId = doc.get('memberId');
  return {
    id: doc.id,
    kind,
    householdId: stringOr(doc.get('householdId'), ''),
    memberId: typeof memberId === 'string' ? memberId : null,
    data,
    createdAt: toIsoOrEpoch(doc.get('createdAt')),
  };
}

export async function listAlerts(): Promise<AdminListAlertsResponse> {
  const snap = await db().collection(GAMI_ALERTS_PATH).orderBy('createdAt', 'desc').limit(ALERT_LIMIT).get();
  return { alerts: snap.docs.flatMap((doc) => alertFromDoc(doc) ?? []) };
}

// ---- rebuild ---------------------------------------------------------------------

function ledgerInput(doc: QueryDocumentSnapshot): WalletLedgerRowInput {
  const spendableAt = doc.get('spendableAt');
  const reversesEntryId = doc.get('reversesEntryId');
  return {
    key: doc.id,
    amount: numberOr(doc.get('amount'), 0),
    spendableAt: spendableAt instanceof Timestamp ? spendableAt.toDate() : null,
    ...(typeof reversesEntryId === 'string' ? { reversesEntryId } : {}),
  };
}

/**
 * Replays the wallet ledger (balance, lifetimeEarned, pendingBalance, nextSpendableAt, level) and rewrites the
 * projection. Everything the ledger cannot derive (streak, achievements, stats, caps) is kept from the existing
 * projection; xpPeak never goes down (the larger of the projection's and the member document's). The ledger and
 * the projection are read and written in one transaction, so a concurrent engine run cannot interleave.
 */
export async function rebuildWallet(actorUid: string, raw: unknown): Promise<AdminRebuildWalletResponse> {
  const uid = requireString(asObject(raw), 'uid', 128);
  const now = new Date();
  return db().runTransaction(async (tx) => {
    const walletRef = db().doc(`wallets/${uid}`);
    const [walletSnap, ledgerSnap] = await Promise.all([tx.get(walletRef), tx.get(db().collection(`wallets/${uid}/ledger`))]);
    if (!walletSnap.exists && ledgerSnap.empty) throw new DomainError('not-found', `User ${uid} has no wallet.`);

    const walletHousehold = walletSnap.get('householdId');
    const rowHousehold = ledgerSnap.docs.map((doc) => doc.get('householdId')).find((id) => typeof id === 'string');
    const householdId = String(typeof walletHousehold === 'string' ? walletHousehold : rowHousehold ?? '');
    const existing = walletSnap.exists ? walletFromDoc(walletSnap.data()!, householdId, uid) : null;
    const memberSnap: DocumentSnapshot | null =
      householdId === '' ? null : await tx.get(db().doc(`households/${householdId}/members/${uid}`));
    const memberPeak = memberSnap?.get('xpPeak');
    const xpPeak = Math.max(existing?.xpPeak ?? 0, typeof memberPeak === 'number' ? memberPeak : 0);

    const rows = ledgerSnap.docs.map(ledgerInput);
    const rebuilt = rebuildWalletProjection(rows, { now, xpPeak, householdId, memberId: uid });
    const next =
      existing === null
        ? rebuilt
        : {
            ...existing,
            balance: rebuilt.balance,
            lifetimeEarned: rebuilt.lifetimeEarned,
            pendingBalance: rebuilt.pendingBalance,
            nextSpendableAt: rebuilt.nextSpendableAt,
            level: rebuilt.level,
            xpPeak: rebuilt.xpPeak,
          };
    next.projectionVersion = existing === null ? PROJECTION_VERSION : existing.projectionVersion + 1;
    next.updatedAt = now;

    tx.set(walletRef, walletToDoc(next));
    writeAuditTx(tx, {
      action: 'wallet.rebuild',
      actorUid,
      before:
        existing === null
          ? null
          : {
              uid,
              balance: existing.balance,
              lifetimeEarned: existing.lifetimeEarned,
              pendingBalance: existing.pendingBalance,
            },
      after: {
        uid,
        balance: next.balance,
        lifetimeEarned: next.lifetimeEarned,
        pendingBalance: next.pendingBalance,
        rows: rows.length,
      },
      at: now,
    });
    return { uid, rows: rows.length, balance: next.balance };
  });
}

// ---- level-floor backfill --------------------------------------------------------

const BACKFILL_CHUNK = 200;

/**
 * Members written before the level migration have no `levelFloor` (C3): set it from the old curve,
 * `floor(xp / 100) + 1`, and make sure `xpPeak` exists (never lowering one that does). Pages through every
 * households/{hid}/members document in chunks; each chunk re-reads its members in a transaction so a member whose
 * xp moved meanwhile, or that another run already fixed, is handled on current data.
 */
export async function backfillLevelFloors(actorUid: string): Promise<AdminBackfillLevelFloorsResponse> {
  let updated = 0;
  let cursor: QueryDocumentSnapshot | null = null;
  for (;;) {
    let query = db().collectionGroup('members').orderBy(FieldPath.documentId()).limit(BACKFILL_CHUNK);
    if (cursor !== null) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    cursor = page.docs[page.docs.length - 1];
    const missing = page.docs.filter((doc) => isHouseholdMember(doc) && !isNumber(doc.get('levelFloor')));
    if (missing.length > 0) {
      updated += await db().runTransaction(async (tx) => {
        const fresh = await tx.getAll(...missing.map((doc) => doc.ref));
        let written = 0;
        for (const snap of fresh) {
          if (!snap.exists || isNumber(snap.get('levelFloor'))) continue;
          const xp = Math.max(numberOr(snap.get('xp'), 0), 0);
          const peak = snap.get('xpPeak');
          tx.update(snap.ref, { levelFloor: Math.floor(xp / 100) + 1, xpPeak: Math.max(isNumber(peak) ? peak : 0, xp) });
          written += 1;
        }
        return written;
      });
    }
    if (page.size < BACKFILL_CHUNK) break;
  }
  await writeAudit({
    action: 'members.backfillLevelFloors',
    actorUid,
    before: null,
    after: { updatedMembers: updated },
    at: new Date(),
  });
  return { updatedMembers: updated };
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** households/{hid}/members/{uid} only; another collection that happens to be called `members` is left alone. */
function isHouseholdMember(doc: QueryDocumentSnapshot): boolean {
  const parts = doc.ref.path.split('/');
  return parts.length === 4 && parts[0] === 'households';
}
