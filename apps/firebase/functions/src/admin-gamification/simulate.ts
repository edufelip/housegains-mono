import { Timestamp, type DocumentReference, type DocumentSnapshot } from 'firebase-admin/firestore';
import { db } from '../admin';
import { DomainError } from '../domain/errors';
import type { GamiEvent } from '../domain/gamification';
import { readGamiConfig } from '../gamification/config';
import { buildReplayEvents, isLedgerSource, readModeration, type LedgerSource, type ReplayFacts } from '../gamification/trigger';
import { householdInfo, readChore, readInstance } from '../store';
import type { AdminSimulateResponse } from './api-types';
import { asObject, requireInteger } from './parse';
import { validateOrThrow } from './rule-sets';
import { perRuleTable, SimulationSide, type SimHousehold } from './simulation-side';

// adminSimulate (C10): replays the last N days of households/*/ledger rows through the published rule set and
// the draft, in time order, against fresh in-memory projections. Read-only: nothing here writes.
//
// Like the safety-net trigger, events are rebuilt from each row and the documents as they are now (the same
// buildReplayEvents), so a completion that was undone since is not replayed; the simulation is an approximation
// of history, accurate enough to compare two rule sets on the same input.

const DAY_MS = 24 * 60 * 60 * 1000;
const VELOCITY_WINDOW_MS = 10 * 60_000;
const MAX_ROWS = 20_000;
const GET_ALL_CHUNK = 300;
const SOURCES: LedgerSource[] = ['subtask', 'bonus', 'undo-subtask', 'undo-bonus', 'revoke-subtask', 'revoke-bonus'];

interface SimRow {
  hid: string;
  id: string;
  source: LedgerSource;
  data: Record<string, unknown>;
  at: Date;
}

async function getAllChunked(refs: DocumentReference[]): Promise<Map<string, DocumentSnapshot>> {
  const out = new Map<string, DocumentSnapshot>();
  for (let index = 0; index < refs.length; index += GET_ALL_CHUNK) {
    for (const snap of await db().getAll(...refs.slice(index, index + GET_ALL_CHUNK))) out.set(snap.ref.path, snap);
  }
  return out;
}

async function loadRows(since: Date): Promise<SimRow[]> {
  // `source` only exists on households/{hid}/ledger rows; wallets/{uid}/ledger shares the collection id.
  const snap = await db()
    .collectionGroup('ledger')
    .where('source', 'in', SOURCES)
    .where('createdAt', '>=', Timestamp.fromDate(since))
    .orderBy('createdAt', 'asc')
    .limit(MAX_ROWS + 1)
    .get();
  if (snap.size > MAX_ROWS) {
    throw new DomainError('failed-precondition', `More than ${MAX_ROWS} ledger rows in that window; pick fewer days.`);
  }
  return snap.docs.flatMap((doc) => {
    const parts = doc.ref.path.split('/');
    const source = doc.get('source');
    const createdAt = doc.get('createdAt');
    if (parts.length !== 4 || parts[0] !== 'households') return [];
    if (!isLedgerSource(source) || !(createdAt instanceof Timestamp)) return [];
    return [{ hid: parts[1], id: doc.id, source, data: doc.data(), at: createdAt.toDate() }];
  });
}

export async function simulate(raw: unknown): Promise<AdminSimulateResponse> {
  const data = asObject(raw);
  const days = requireInteger(data, 'days');
  if (days < 1 || days > 28) throw new DomainError('invalid-argument', 'days must be from 1 to 28.');
  const draftRules = validateOrThrow(data.rules);
  const config = await readGamiConfig();

  const rows = await loadRows(new Date(Date.now() - days * DAY_MS));
  const hids = [...new Set(rows.map((row) => row.hid))];
  const households = await getAllChunked(hids.map((hid) => db().doc(`households/${hid}`)));
  const instances = await getAllChunked(
    [...new Set(rows.map((row) => `households/${row.hid}/instances/${String(row.data.instanceId)}`))].map((path) => db().doc(path)),
  );
  const choreRefs = new Set<string>();
  for (const snap of instances.values()) {
    if (snap.exists && typeof snap.get('choreId') === 'string') {
      choreRefs.add(`households/${snap.ref.path.split('/')[1]}/chores/${snap.get('choreId') as string}`);
    }
  }
  const chores = await getAllChunked([...choreRefs].map((path) => db().doc(path)));
  const members = await getAllChunked(
    [...new Set(rows.map((row) => `households/${row.hid}/members/${String(row.data.memberId)}`))].map((path) => db().doc(path)),
  );

  const reversedRowIds = new Set(
    rows.flatMap((row) => (typeof row.data.reversesEntryId === 'string' ? [row.data.reversesEntryId] : [])),
  );
  const subtaskTimes = new Map<string, number[]>();

  const published = new SimulationSide(config.rules, config.ruleSetVersion);
  const draft = new SimulationSide(draftRules, null);

  for (const row of rows) {
    const memberId = row.data.memberId;
    const instanceId = row.data.instanceId;
    const householdSnap = households.get(`households/${row.hid}`);
    const instanceSnap = instances.get(`households/${row.hid}/instances/${String(instanceId)}`);
    if (typeof memberId !== 'string' || typeof instanceId !== 'string') continue;
    if (householdSnap === undefined || !householdSnap.exists || instanceSnap === undefined || !instanceSnap.exists) continue;

    const instance = readInstance(instanceSnap);
    const choreSnap = chores.get(`households/${row.hid}/chores/${instance.choreId}`);
    const memberSnap = members.get(`households/${row.hid}/members/${memberId}`);
    const joinedAt = memberSnap?.get('joinedAt');

    // The velocity window: this member's earlier subtask rows up to and including this one.
    const timesKey = `${row.hid}|${memberId}`;
    const times = subtaskTimes.get(timesKey) ?? [];
    if (row.source === 'subtask') {
      times.push(row.at.getTime());
      subtaskTimes.set(timesKey, times);
    }
    const facts: ReplayFacts = {
      hid: row.hid,
      rowId: row.id,
      instance,
      chore: choreSnap !== undefined && choreSnap.exists ? readChore(choreSnap) : null,
      memberId,
      actionAt: row.at,
      amount: typeof row.data.amount === 'number' ? row.data.amount : 0,
      xpPeakAfter: null,
      joinedAt: joinedAt instanceof Timestamp ? joinedAt.toDate() : null,
      reversesRowId: typeof row.data.reversesEntryId === 'string' ? row.data.reversesEntryId : null,
      subtaskId: typeof row.data.subtaskId === 'string' ? row.data.subtaskId : null,
      moderation: readModeration(row.data.moderation, memberId),
      recentSubtaskTimestamps:
        row.source === 'subtask'
          ? times.filter((time) => time >= row.at.getTime() - VELOCITY_WINDOW_MS).map((time) => new Date(time))
          : [],
      reversed: row.source === 'bonus' && reversedRowIds.has(row.id),
    };
    const events: GamiEvent[] = buildReplayEvents(row.source, facts);
    if (events.length === 0) continue;
    const info = householdInfo(householdSnap.data()!);
    const household: SimHousehold = {
      householdId: row.hid,
      creatorUid: info.creatorUid,
      memberCount: info.memberCount,
      timeZone: info.timeZone,
    };
    for (const event of events) {
      published.apply(event, household, row.at);
      draft.apply(event, household, row.at);
    }
  }

  return { days, published: published.totals(), draft: draft.totals(), perRule: perRuleTable(published, draft) };
}
