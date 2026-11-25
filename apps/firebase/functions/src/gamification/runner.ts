import { FieldPath, Timestamp, type Query, type Transaction } from 'firebase-admin/firestore';
import { db } from '../admin';
import { pushToMembers } from '../notify';
import { gamiWeekCloseBody, gamiWeekCloseTitle } from '../domain/people';
import {
  escapeRef,
  evaluate,
  walletKey,
  type AlertDraft,
  type Celebration,
  type GamiEvent,
  type LedgerRowDraft,
  type OrganizerProjection,
  type PaidRow,
  type ReversedRow,
  type RuleSet,
  type ServerEventDraft,
  type WalletProjection,
} from '../domain/gamification';
import { loadGamiConfig } from './config';
import { GAMI_ALERTS_PATH, gamiProcessedPath } from './paths';
import {
  alertToDoc,
  celebrationToDoc,
  ledgerRowToDoc,
  organizerFromDoc,
  organizerToDoc,
  serverEventToDoc,
  walletFromDoc,
  walletToDoc,
} from './serialize';

// The gamification runner (contract C8): turns GamiEvents into wallet and
// organizer ledger rows, projections, server events, alerts, inbox rows and
// FCM. One call per XP-affecting action, right after its transaction commits.
//
// Loading the projections, the idempotency keys, evaluating and writing all
// happen inside ONE Firestore transaction. Two runs touching the same wallet
// (two quick completions, the callable and the safety-net trigger) therefore
// serialise instead of overwriting each other's projection, and the ledger
// rows are created with create(): a key that already exists is never paid twice.
//
// The runner never throws: any failure is logged with context and the XP action
// that triggered it stands.

export interface GamiHouseholdInfo {
  timeZone: string;
  creatorUid: string;
  memberCount: number;
}

export interface GamiRunContext {
  householdId: string;
  household: GamiHouseholdInfo;
  /** The member whose client is waiting; sync runs return their celebrations. */
  callerUid: string;
  now: Date;
  /** true: the caller's celebrations are returned; other celebrations go to their owner's inbox. */
  sync: boolean;
  /**
   * The households/{hid}/ledger rows this run covers. They are marked processed in the same
   * transaction, so the safety-net trigger can tell a handled row from a crashed run.
   */
  ledgerRowIds?: string[];
}

export interface LoadedRow {
  key: string;
  amount: number;
  createdAt: Date;
}

interface LedgerRead {
  keys: Set<string>;
  rows: LoadedRow[];
}

interface OwnedCelebration {
  owner: string;
  kind: GamiEvent['kind'];
  celebration: Celebration;
}

export type ReversalEvent = Extract<
  GamiEvent,
  { kind: 'ledger.undo-subtask' | 'ledger.revoke-subtask' | 'ledger.undo-bonus' | 'ledger.revoke-bonus' }
>;

/** Events the engine can award Zelo on; they need the organizer projection. */
export const ORGANIZER_KINDS = new Set<GamiEvent['kind']>([
  'ledger.subtask',
  'household.setup_finished',
  'chore.deleted',
  'member.removed',
  'household.week_closed',
]);

/** Engine no-ops: it acts on credits, not membership churn. */
const NO_OP_KINDS = new Set<GamiEvent['kind']>(['member.joined', 'member.activated', 'chore.created']);

const IN_QUERY_CHUNK = 10;
const TIERS = ['bronze', 'silver', 'gold'] as const;

export async function runGamification(events: GamiEvent[], ctx: GamiRunContext): Promise<Celebration[]> {
  try {
    return await run(events, ctx);
  } catch (error) {
    console.error(
      'runGamification failed',
      { householdId: ctx.householdId, kinds: events.map((event) => event.kind) },
      error,
    );
    return [];
  }
}

/**
 * `runGamification` without the safety catch: a failure propagates. For callers that must know
 * whether the run committed, like the week close marking a week processed.
 */
export async function runGamificationStrict(events: GamiEvent[], ctx: GamiRunContext): Promise<Celebration[]> {
  return run(events, ctx);
}

async function run(events: GamiEvent[], ctx: GamiRunContext): Promise<Celebration[]> {
  const config = await loadGamiConfig();
  const active = events.filter((event) => !NO_OP_KINDS.has(event.kind));
  if (active.length === 0) return [];
  const rules = config.rules;
  const { creatorUid } = ctx.household;

  // Which wallets each event touches, and the sourceRefs their ledgers must be
  // queried by (existing-key idempotency; never whole ledgers).
  const memberIds = new Set<string>();
  const memberRefs = new Map<string, Set<string>>();
  const prefixRefs = new Map<string, Set<string>>();
  const organizerNeeded = active.some((event) => ORGANIZER_KINDS.has(event.kind));
  const organizerRefs = new Set<string>();

  for (const event of active) {
    const members = membersFor(event);
    const refs = refsFor(event, rules);
    for (const memberId of members) {
      memberIds.add(memberId);
      addAll(memberRefs, memberId, refs);
    }
    if (organizerNeeded) for (const ref of refs) organizerRefs.add(ref);
    // A reversal that reopens the instance must see every on_time row of the
    // instance, whichever generation completed it (the engine scans by key prefix).
    if (
      (event.kind === 'ledger.undo-subtask' || event.kind === 'ledger.revoke-subtask') &&
      event.instanceStatusAfter !== 'done'
    ) {
      const prefix = `earn.on_time:${escapeRef(event.instanceId)}|`;
      for (const memberId of members) addAll(prefixRefs, memberId, [prefix]);
    }
  }

  const outcome = await db().runTransaction(async (tx) => {
    // ---- reads (all of them, before the first write) ----
    const wallets = new Map<string, WalletProjection | null>();
    if (memberIds.size > 0) {
      const snaps = await tx.getAll(...[...memberIds].map((memberId) => db().doc(`wallets/${memberId}`)));
      for (const snap of snaps) {
        wallets.set(snap.id, snap.exists ? walletFromDoc(snap.data()!, ctx.householdId, snap.id) : null);
      }
    }

    let organizer: OrganizerProjection | null = null;
    let organizerLedger: LedgerRead = { keys: new Set<string>(), rows: [] };
    if (organizerNeeded) {
      const snap = await tx.get(db().doc(`households/${ctx.householdId}/organizer/${creatorUid}`));
      organizer = snap.exists ? organizerFromDoc(snap.data()!, ctx.householdId, creatorUid) : null;
      organizerLedger = await readLedger(
        tx,
        db().collection(`households/${ctx.householdId}/organizerLedger`),
        organizerRefs,
      );
    }
    const organizerKeys = organizerLedger.keys;

    const memberLedgers = new Map<string, LedgerRead>();
    for (const memberId of memberIds) {
      memberLedgers.set(
        memberId,
        await readLedger(
          tx,
          db().collection(`wallets/${memberId}/ledger`),
          memberRefs.get(memberId) ?? new Set(),
          prefixRefs.get(memberId) ?? new Set(),
        ),
      );
    }

    // ---- evaluation (pure) ----
    const emittedKeys = new Set<string>();
    const walletRows: LedgerRowDraft[] = [];
    const zeloRows: LedgerRowDraft[] = [];
    const changedWallets = new Set<string>();
    const serverEvents: Array<{ event: ServerEventDraft; sourceKey: string }> = [];
    const alerts: Array<{ alert: AlertDraft; sourceKey: string }> = [];
    const celebrations: OwnedCelebration[] = [];
    let organizerChanged = false;

    for (const event of active) {
      const sourceKey = escapeRef(sourceKeyOf(event));
      const members = membersFor(event);
      // Organizer-only events (setup, chore.deleted, member.removed) still get
      // one evaluate call with no wallet so the organizer pipeline runs.
      const calls: Array<string | null> =
        members.length > 0 ? members : ORGANIZER_KINDS.has(event.kind) ? [null] : [];
      for (const memberId of calls) {
        const ledger = memberId !== null ? memberLedgers.get(memberId) : undefined;
        const input = isReversal(event) && ledger !== undefined ? enrichReversal(event, memberId, ledger.rows) : event;
        const result = evaluate(input, {
          now: ctx.now,
          rules,
          ruleSetVersion: config.ruleSetVersion,
          wallet: memberId !== null ? wallets.get(memberId) ?? null : null,
          organizer: organizerNeeded ? organizer : undefined,
          householdMemberCount: ctx.household.memberCount,
          timeZone: ctx.household.timeZone,
          existingKeys: new Set<string>([...(ledger?.keys ?? []), ...organizerKeys, ...emittedKeys]),
          // What the standing rows paid and when: clawbacks reverse exactly that (G1-G3).
          existingRows: paidRows([...(ledger?.rows ?? []), ...organizerLedger.rows]),
          creatorUid,
        });
        if (result.organizer !== null) {
          organizer = result.organizer;
          organizerChanged = true;
        }
        for (const row of result.walletRows) {
          emittedKeys.add(row.key);
          walletRows.push(row);
        }
        for (const row of result.zeloRows) {
          emittedKeys.add(row.key);
          zeloRows.push(row);
        }
        if (result.wallet !== null && memberId !== null) {
          wallets.set(memberId, result.wallet);
          changedWallets.add(memberId);
        }
        for (const celebration of result.celebrations) {
          celebrations.push({
            owner: celebration.track === 'zelo' ? creatorUid : memberId ?? creatorUid,
            kind: event.kind,
            celebration,
          });
        }
        for (const serverEvent of result.serverEvents) serverEvents.push({ event: serverEvent, sourceKey });
        for (const alert of result.alerts) alerts.push({ alert, sourceKey });
      }
    }

    // The caller's own celebrations travel in the callable response (sync
    // runs); everything else lands in the owner's inbox.
    const inboxOwned = celebrations.filter((entry) => !(ctx.sync && entry.owner === ctx.callerUid));
    const inboxRefs = inboxOwned.map((entry) => db().doc(`users/${entry.owner}/inbox/${entry.celebration.id}`));
    const existingInbox = new Set<string>();
    if (inboxRefs.length > 0) {
      for (const snap of await tx.getAll(...inboxRefs)) if (snap.exists) existingInbox.add(snap.ref.path);
    }

    const derivedEvents = serverEvents.filter(({ event }) => event.docId === undefined);
    const fixedEvents = new Map<string, ServerEventDraft>();
    for (const { event } of serverEvents) {
      if (event.docId !== undefined && !fixedEvents.has(event.docId)) fixedEvents.set(event.docId, event);
    }
    const existingFixedEvents = new Set<string>();
    if (fixedEvents.size > 0) {
      const refs = [...fixedEvents.keys()].map((id) => db().doc(`households/${ctx.householdId}/events/${id}`));
      for (const snap of await tx.getAll(...refs)) if (snap.exists) existingFixedEvents.add(snap.id);
    }

    // ---- writes ----
    const firestore = db();
    for (const row of walletRows) {
      tx.create(firestore.doc(`wallets/${row.memberId}/ledger/${row.key}`), ledgerRowToDoc(row));
    }
    for (const row of zeloRows) {
      tx.create(firestore.doc(`households/${ctx.householdId}/organizerLedger/${row.key}`), ledgerRowToDoc(row));
    }
    for (const memberId of changedWallets) {
      const wallet = wallets.get(memberId);
      if (wallet !== null && wallet !== undefined) tx.set(firestore.doc(`wallets/${memberId}`), walletToDoc(wallet));
    }
    if (organizerChanged && organizer !== null) {
      tx.set(firestore.doc(`households/${ctx.householdId}/organizer/${creatorUid}`), organizerToDoc(organizer));
    }
    for (const rowId of ctx.ledgerRowIds ?? []) {
      tx.set(firestore.doc(gamiProcessedPath(ctx.householdId, rowId)), { at: Timestamp.fromDate(ctx.now) });
    }
    // Server events and alerts are deterministic and idempotent: set(), never a
    // conflict that could abort the ledger writes above.
    for (const [id, event] of dedupe(derivedEvents, ({ event: e, sourceKey }) => `evt:${e.name}:${e.memberId ?? 'household'}:${sourceKey}`)) {
      tx.set(firestore.doc(`households/${ctx.householdId}/events/${id}`), serverEventToDoc(event.event));
    }
    // Fixed-id events (level-ups) are written once: an existing doc keeps its first createdAt.
    for (const [id, event] of fixedEvents) {
      if (!existingFixedEvents.has(id)) tx.set(firestore.doc(`households/${ctx.householdId}/events/${id}`), serverEventToDoc(event));
    }
    for (const [id, entry] of dedupe(alerts, ({ alert, sourceKey }) => `alert:${alert.kind}:${alert.memberId ?? ctx.householdId}:${sourceKey}`)) {
      tx.set(firestore.doc(`${GAMI_ALERTS_PATH}/${id}`), alertToDoc(entry.alert));
    }
    const written = new Set<string>();
    for (const { owner, celebration } of inboxOwned) {
      const path = `users/${owner}/inbox/${celebration.id}`;
      if (existingInbox.has(path) || written.has(path)) continue;
      written.add(path);
      tx.create(firestore.doc(path), celebrationToDoc(celebration, ctx.now));
    }
    return celebrations;
  });

  // FCM only for week-close earns; pushToMembers logs its own failures.
  const pushes = outcome.filter(
    (entry) => entry.kind === 'household.week_closed' && entry.celebration.amount !== undefined,
  );
  await Promise.all(
    pushes.map(({ owner, celebration }) =>
      pushToMembers({
        uids: [owner],
        title: (locale) => gamiWeekCloseTitle(locale, celebration.track),
        bodyFor: (locale) => gamiWeekCloseBody(locale, celebration.track, celebration.amount ?? 0),
      }),
    ),
  );
  return ctx.sync
    ? outcome.filter((entry) => entry.owner === ctx.callerUid).map((entry) => entry.celebration)
    : [];
}

function paidRows(rows: LoadedRow[]): Map<string, PaidRow> {
  return new Map(rows.map((row) => [row.key, { amount: row.amount, createdAt: row.createdAt }]));
}

/** Deterministic doc ids: the base, then `#1`, `#2` for repeats of the same base inside one run. */
function dedupe<T>(items: T[], baseOf: (item: T) => string): Array<[string, T]> {
  const counts = new Map<string, number>();
  return items.map((item) => {
    const base = baseOf(item);
    const index = counts.get(base) ?? 0;
    counts.set(base, index + 1);
    return [index === 0 ? base : `${base}#${index}`, item];
  });
}

// ---- per-event membership and source refs ----------------------------------------

export function membersFor(event: GamiEvent): string[] {
  switch (event.kind) {
    case 'ledger.subtask':
    case 'ledger.bonus':
    case 'ledger.undo-bonus':
    case 'ledger.revoke-bonus':
    case 'feed.post':
      return [event.memberId];
    case 'ledger.undo-subtask':
    case 'ledger.revoke-subtask':
      // The undone completer plus every assignee: a reopened instance reverses
      // each on-time-paid assignee's earn.on_time (C4).
      return [
        ...new Set(event.instanceStatusAfter === 'done' ? [event.memberId] : [event.memberId, ...event.assigneeIds]),
      ].sort();
    case 'instance.completed_on_time':
      return [...new Set(event.assigneeIds.filter((id) => event.contributorIds.includes(id)))].sort();
    case 'household.week_closed':
      return Object.keys(event.members).sort();
    default:
      return [];
  }
}

/** SourceRefs the engine can build ledger keys from for this event. */
function refsFor(event: GamiEvent, rules: RuleSet): Set<string> {
  switch (event.kind) {
    case 'ledger.subtask':
      // earn.subtask/assist keys on the XP row; welcome and zelo.member_activated
      // on the member; zelo.chore_done on the chore; rules may also ref the instance.
      return new Set([event.ledgerRowId, event.choreId, event.memberId, event.instanceId, ...achievementRefs(rules)]);
    case 'ledger.bonus':
      return new Set([event.ledgerRowId]);
    case 'ledger.undo-subtask':
    case 'ledger.revoke-subtask':
    case 'ledger.undo-bonus':
    case 'ledger.revoke-bonus':
      return new Set([event.reversedRowId]);
    case 'instance.completed_on_time':
      return new Set([`${event.instanceId}/${event.finalRowId}`]);
    case 'feed.post':
      return new Set([event.postId]);
    case 'household.setup_finished':
      return new Set(['setup']);
    case 'chore.deleted':
      return new Set([event.choreId]);
    case 'member.removed':
      return new Set([event.memberId]);
    case 'household.week_closed':
      return weekRefs(event, rules);
    default:
      return new Set();
  }
}

/** `{achievementId}#{tier}`: the sourceRef every achievement payout is keyed on. */
function achievementRefs(rules: RuleSet): string[] {
  return rules.achievements.flatMap((def) =>
    TIERS.filter((tier) => def.tiers[tier] !== undefined).map((tier) => `${def.id}#${tier}`),
  );
}

/** weekStart plus every milestone/achievement sourceRef the rules can key on (C7). */
function weekRefs(event: Extract<GamiEvent, { kind: 'household.week_closed' }>, rules: RuleSet): Set<string> {
  const refs = new Set<string>([event.weekStart, ...achievementRefs(rules)]);
  for (const rule of rules.earnRules) {
    if (rule.on.kind !== 'household.week_closed' || rule.award.milestones === undefined) continue;
    for (const milestone of Object.keys(rule.award.milestones)) refs.add(`${event.weekStart}#${milestone}`);
  }
  return refs;
}

function addAll(map: Map<string, Set<string>>, key: string, values: Iterable<string>): void {
  const set = map.get(key) ?? new Set<string>();
  for (const value of values) set.add(value);
  map.set(key, set);
}

function sourceKeyOf(event: GamiEvent): string {
  switch (event.kind) {
    case 'ledger.subtask':
    case 'ledger.bonus':
      return event.ledgerRowId;
    case 'ledger.undo-subtask':
    case 'ledger.revoke-subtask':
    case 'ledger.undo-bonus':
    case 'ledger.revoke-bonus':
      return event.reversedRowId;
    case 'instance.completed_on_time':
      return `${event.instanceId}/${event.finalRowId}`;
    case 'feed.post':
      return event.postId;
    case 'household.setup_finished':
      return 'setup';
    case 'chore.deleted':
      return event.choreId;
    case 'member.removed':
      return event.memberId;
    case 'household.week_closed':
      return event.weekStart;
    default:
      return 'household';
  }
}

// ---- ledger reads ----------------------------------------------------------------

/**
 * The ledger rows whose sourceRef is one of `refs`, plus every row whose doc id
 * starts with one of `prefixes`. Never the whole ledger. Reads inside `tx`.
 */
async function readLedger(
  tx: Transaction,
  collection: Query,
  refs: Set<string>,
  prefixes: Set<string> = new Set(),
): Promise<LedgerRead> {
  const keys = new Set<string>();
  const rows: LoadedRow[] = [];
  const take = (doc: { id: string; get: (field: string) => unknown }) => {
    if (keys.has(doc.id)) return;
    keys.add(doc.id);
    const createdAt = doc.get('createdAt');
    rows.push({
      key: doc.id,
      amount: Number(doc.get('amount')) || 0,
      createdAt: createdAt instanceof Timestamp ? createdAt.toDate() : new Date(0),
    });
  };
  const direct = [...refs];
  for (let index = 0; index < direct.length; index += IN_QUERY_CHUNK) {
    const snap = await tx.get(collection.where('sourceRef', 'in', direct.slice(index, index + IN_QUERY_CHUNK)));
    snap.docs.forEach(take);
  }
  for (const prefix of prefixes) {
    const snap = await tx.get(
      collection.where(FieldPath.documentId(), '>=', prefix).where(FieldPath.documentId(), '<', `${prefix}`),
    );
    snap.docs.forEach(take);
  }
  return { keys, rows };
}

// ---- reversal enrichment -----------------------------------------------------------

export function isReversal(event: GamiEvent): event is ReversalEvent {
  return (
    event.kind === 'ledger.undo-subtask' ||
    event.kind === 'ledger.revoke-subtask' ||
    event.kind === 'ledger.undo-bonus' ||
    event.kind === 'ledger.revoke-bonus'
  );
}

/** reversedAward comes from the original wallet rows (amount + awardedAt), or null (C4). */
export function enrichReversal(event: ReversalEvent, walletOwner: string | null, rows: LoadedRow[]): ReversalEvent {
  const awarded = (ruleId: string): ReversedRow | null => {
    if (walletOwner !== event.memberId) return null;
    const key = walletKey(ruleId, event.reversedRowId, event.memberId);
    const row = rows.find((candidate) => candidate.key === key && candidate.amount > 0);
    return row === undefined ? null : { amount: row.amount, awardedAt: row.createdAt };
  };
  if (event.kind === 'ledger.undo-bonus' || event.kind === 'ledger.revoke-bonus') {
    return { ...event, reversedAward: { bonus: awarded('earn.bonus') } };
  }
  return { ...event, reversedAward: { subtask: awarded('earn.subtask'), assist: awarded('earn.assist') } };
}
