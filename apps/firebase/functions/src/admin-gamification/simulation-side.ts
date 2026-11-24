import {
  evaluate,
  type EngineInput,
  type EngineResult,
  type GamiEvent,
  type LedgerRowDraft,
  type OrganizerProjection,
  type RuleSet,
  type WalletProjection,
} from '../domain/gamification';
import { enrichReversal, isReversal, membersFor, ORGANIZER_KINDS, type LoadedRow } from '../gamification/runner';
import type { SimPerRule, SimRuleSide, SimSideTotals } from './api-types';

// One side (published or draft rule set) of an adminSimulate run: fresh in-memory projections, the engine's
// own evaluate(), no Firestore. The same event sequence is fed to both sides, in time order.

export interface SimHousehold {
  householdId: string;
  creatorUid: string;
  memberCount: number;
  timeZone: string;
}

interface RuleTally {
  track: 'ganhos' | 'zelo';
  total: number;
  members: Set<string>;
  capHits: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export class SimulationSide {
  private readonly wallets = new Map<string, WalletProjection | null>();
  private readonly organizers = new Map<string, OrganizerProjection | null>();
  private readonly walletKeys = new Map<string, Set<string>>();
  private readonly walletRows = new Map<string, LoadedRow[]>();
  private readonly organizerKeys = new Map<string, Set<string>>();
  private readonly tallies = new Map<string, RuleTally>();
  private readonly members = new Set<string>();
  private ganhos = 0;
  private zelo = 0;
  private capHits = 0;
  private readonly uncappedRules: RuleSet;

  constructor(
    readonly rules: RuleSet,
    private readonly ruleSetVersion: number | null,
  ) {
    // Same rules with every earn rule's caps removed: the difference to the real run is what the caps took away.
    this.uncappedRules = { ...rules, earnRules: rules.earnRules.map((rule) => ({ ...rule, caps: [] })) };
  }

  defines(ruleId: string): boolean {
    return this.rules.earnRules.some((rule) => rule.id === ruleId);
  }

  apply(event: GamiEvent, household: SimHousehold, now: Date): void {
    const members = membersFor(event);
    const organizerNeeded = ORGANIZER_KINDS.has(event.kind);
    const calls: Array<string | null> = members.length > 0 ? members : organizerNeeded ? [null] : [];
    const emitted = new Set<string>();
    for (const memberId of calls) {
      const rows = memberId === null ? [] : this.walletRows.get(memberId) ?? [];
      const input = isReversal(event) && memberId !== null ? enrichReversal(event, memberId, rows) : event;
      const base: EngineInput = {
        now,
        rules: this.rules,
        ruleSetVersion: this.ruleSetVersion,
        wallet: memberId === null ? null : this.wallets.get(memberId) ?? null,
        organizer: organizerNeeded ? this.organizers.get(household.householdId) ?? null : undefined,
        householdMemberCount: household.memberCount,
        timeZone: household.timeZone,
        existingKeys: new Set<string>([
          ...(memberId === null ? [] : this.walletKeys.get(memberId) ?? []),
          ...(this.organizerKeys.get(household.householdId) ?? []),
          ...emitted,
        ]),
        creatorUid: household.creatorUid,
      };
      const result = evaluate(input, base);
      if (!isReversal(event)) this.countCapHits(result, evaluate(input, { ...base, rules: this.uncappedRules }));
      this.absorb(result, memberId, household.householdId, emitted);
    }
  }

  private absorb(result: EngineResult, memberId: string | null, householdId: string, emitted: Set<string>): void {
    for (const row of result.walletRows) {
      emitted.add(row.key);
      this.book(row);
      this.ganhos += row.amount;
      addTo(this.walletKeys, row.memberId, row.key);
      const rows = this.walletRows.get(row.memberId) ?? [];
      rows.push({ key: row.key, amount: row.amount, createdAt: row.createdAt });
      this.walletRows.set(row.memberId, rows);
    }
    for (const row of result.zeloRows) {
      emitted.add(row.key);
      this.book(row);
      this.zelo += row.amount;
      addTo(this.organizerKeys, householdId, row.key);
    }
    if (result.wallet !== null && memberId !== null) this.wallets.set(memberId, result.wallet);
    if (result.organizer !== null) this.organizers.set(householdId, result.organizer);
  }

  private book(row: LedgerRowDraft): void {
    this.members.add(row.memberId);
    const tally = this.tallyFor(row.ruleId, row.track);
    tally.total += row.amount;
    tally.members.add(row.memberId);
  }

  private tallyFor(ruleId: string, track: 'ganhos' | 'zelo'): RuleTally {
    const existing = this.tallies.get(ruleId);
    if (existing !== undefined) return existing;
    const created: RuleTally = { track, total: 0, members: new Set(), capHits: 0 };
    this.tallies.set(ruleId, created);
    return created;
  }

  private countCapHits(capped: EngineResult, uncapped: EngineResult): void {
    const sums = (result: EngineResult) => {
      const out = new Map<string, { track: 'ganhos' | 'zelo'; amount: number }>();
      for (const row of [...result.walletRows, ...result.zeloRows]) {
        out.set(row.ruleId, { track: row.track, amount: (out.get(row.ruleId)?.amount ?? 0) + row.amount });
      }
      return out;
    };
    const cappedSums = sums(capped);
    for (const [ruleId, free] of sums(uncapped)) {
      if (free.amount > (cappedSums.get(ruleId)?.amount ?? 0)) {
        this.tallyFor(ruleId, free.track).capHits += 1;
        this.capHits += 1;
      }
    }
  }

  totals(): SimSideTotals {
    const affected = this.members.size;
    return {
      ganhos: this.ganhos,
      zelo: this.zelo,
      membersAffected: affected,
      capHits: this.capHits,
      averagePerMember: affected === 0 ? 0 : round1((this.ganhos + this.zelo) / affected),
    };
  }

  ruleSide(ruleId: string): SimRuleSide | null {
    if (!this.defines(ruleId) && !this.tallies.has(ruleId)) return null;
    const tally = this.tallies.get(ruleId);
    const affected = tally?.members.size ?? 0;
    return {
      total: tally?.total ?? 0,
      membersAffected: affected,
      capHits: tally?.capHits ?? 0,
      averagePerMember: affected === 0 ? 0 : round1((tally?.total ?? 0) / affected),
    };
  }

  trackOf(ruleId: string): 'ganhos' | 'zelo' | null {
    return this.rules.earnRules.find((rule) => rule.id === ruleId)?.track ?? this.tallies.get(ruleId)?.track ?? null;
  }

  ruleIds(): string[] {
    return [...new Set([...this.rules.earnRules.map((rule) => rule.id), ...this.tallies.keys()])];
  }
}

function addTo(map: Map<string, Set<string>>, key: string, value: string): void {
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
}

/** The per-rule table over both sides, sorted by rule id; a side that does not define the rule is null. */
export function perRuleTable(published: SimulationSide, draft: SimulationSide): SimPerRule[] {
  const ids = [...new Set([...published.ruleIds(), ...draft.ruleIds()])].sort();
  return ids.flatMap((ruleId) => {
    const track = published.trackOf(ruleId) ?? draft.trackOf(ruleId);
    if (track === null) return [];
    return [{ ruleId, track, published: published.ruleSide(ruleId), draft: draft.ruleSide(ruleId) }];
  });
}
