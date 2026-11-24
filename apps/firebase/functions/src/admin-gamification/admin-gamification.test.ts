import { HttpsError } from 'firebase-functions/v2/https';
import { describe, expect, it } from 'vitest';
import { DomainError } from '../domain/errors';
import { DEFAULT_RULE_SET, type LedgerSubtaskEvent, type RuleSet } from '../domain/gamification';
import { parseSetConfig } from './config';
import { requireAdmin } from './index';
import { explainRow } from './lookup';
import { perRuleTable, SimulationSide, type SimHousehold } from './simulation-side';

const household: SimHousehold = { householdId: 'h1', creatorUid: 'creator', memberCount: 2, timeZone: 'UTC' };
const day = (hour: number) => new Date(Date.UTC(2026, 5, 10, hour));

function subtask(rowId: string, memberId: string, amount: number, at: Date): LedgerSubtaskEvent {
  return {
    kind: 'ledger.subtask',
    householdId: 'h1',
    ledgerRowId: rowId,
    instanceId: 'i1',
    subtaskId: `s-${rowId}`,
    memberId,
    amount,
    isAssist: false,
    isFinalCompleter: false,
    assigneeIds: [memberId],
    category: 'kitchen',
    choreId: 'c1',
    choreCreatedBy: 'creator',
    choreIsCustom: false,
    choreUpdatedAt: new Date(at.getTime() - 5 * 24 * 3_600_000),
    completedAt: at,
    memberJoinedAt: null,
    xpPeakAfter: null,
  };
}

function withRate(perXp: number): RuleSet {
  const rules = structuredClone(DEFAULT_RULE_SET);
  const rule = rules.earnRules.find((entry) => entry.id === 'earn.subtask');
  if (rule === undefined) throw new Error('missing earn.subtask');
  rule.award.amount = perXp;
  return rules;
}

describe('requireAdmin', () => {
  const auth = (token: Record<string, unknown>) => ({ uid: 'u1', token }) as never;

  it('accepts only admin === true', () => {
    expect(requireAdmin(auth({ admin: true }))).toEqual({ uid: 'u1' });
    for (const token of [{}, { admin: false }, { admin: 'true' }, { admin: 1 }]) {
      expect(() => requireAdmin(auth(token))).toThrow(expect.objectContaining({ code: 'permission-denied' }));
    }
  });

  it('is unauthenticated without auth', () => {
    expect(() => requireAdmin(undefined)).toThrow(HttpsError);
    expect(() => requireAdmin(undefined)).toThrow(expect.objectContaining({ code: 'unauthenticated' }));
  });
});

describe('parseSetConfig', () => {
  it('accepts a valid rollout and rejects bad ones with invalid-argument', () => {
    expect(parseSetConfig({ mode: 'live', livePercent: 60, controlPercent: 40 })).toEqual({
      mode: 'live',
      livePercent: 60,
      controlPercent: 40,
    });
    for (const bad of [
      null,
      { mode: 'x', livePercent: 1, controlPercent: 1 },
      { mode: 'live', livePercent: Number.NaN, controlPercent: 0 },
      { mode: 'live', livePercent: 70, controlPercent: 31 },
    ]) {
      expect(() => parseSetConfig(bad)).toThrow(DomainError);
    }
  });
});

describe('explainRow', () => {
  const base = { ruleSetVersion: null, amount: 10, sourceRef: 'row1', reversesEntryId: null, reason: null, reasonCode: null };

  it('names the rule, the rule set and the source', () => {
    expect(explainRow({ ...base, ruleId: 'earn.subtask' })).toBe(
      'Rule earn.subtask (the built-in default rule set) paid 10 for row1',
    );
    expect(explainRow({ ...base, ruleId: 'earn.subtask', ruleSetVersion: 4 })).toContain('rule set v4');
  });

  it('explains reversals and admin adjustments', () => {
    expect(explainRow({ ...base, ruleId: 'earn.subtask', amount: -10, reversesEntryId: 'earn.subtask:row1:u' })).toContain(
      'Reversal of earn.subtask:row1:u',
    );
    expect(explainRow({ ...base, ruleId: 'admin.adjust', reason: 'late fee', reasonCode: 'correction' })).toBe(
      'Admin adjustment (correction): late fee',
    );
  });
});

describe('SimulationSide', () => {
  it('books the same events differently under a different rule set, with fresh projections each', () => {
    const published = new SimulationSide(DEFAULT_RULE_SET, null);
    const draft = new SimulationSide(withRate(2), null);
    for (const side of [published, draft]) {
      side.apply(subtask('r1', 'alice', 10, day(9)), household, day(9));
      side.apply(subtask('r2', 'bob', 15, day(10)), household, day(10));
    }
    const pub = published.totals();
    const dra = draft.totals();
    // 25 XP of subtasks plus a 50 welcome each (no assists: both are assignees); Zelo 5 once for the creator.
    expect(pub).toMatchObject({ ganhos: 25 + 50 + 50, membersAffected: 3 });
    expect(dra.ganhos).toBe(pub.ganhos + 25);
    expect(dra.zelo).toBe(pub.zelo);
    expect(published.ruleSide('earn.subtask')).toMatchObject({ total: 25, membersAffected: 2, averagePerMember: 12.5 });
    expect(draft.ruleSide('earn.subtask')).toMatchObject({ total: 50, membersAffected: 2 });
    expect(published.ruleSide('not.a.rule')).toBeNull();
  });

  it('counts a cap hit when the daily pool trims an award', () => {
    const tight = structuredClone(DEFAULT_RULE_SET);
    tight.caps.dailyGanhos = 12;
    const side = new SimulationSide(tight, null);
    side.apply(subtask('r1', 'alice', 10, day(9)), household, day(9));
    expect(side.totals().capHits).toBe(0);
    side.apply(subtask('r2', 'alice', 10, day(10)), household, day(10)); // 2 left of the pool, 8 trimmed
    expect(side.totals().capHits).toBe(1);
    expect(side.ruleSide('earn.subtask')).toMatchObject({ total: 12, capHits: 1 });
  });

  it('lists rules from both sides, null where a side does not define them', () => {
    const slim = structuredClone(DEFAULT_RULE_SET);
    slim.earnRules = slim.earnRules.filter((rule) => rule.id !== 'earn.share');
    const table = perRuleTable(new SimulationSide(DEFAULT_RULE_SET, null), new SimulationSide(slim, null));
    const share = table.find((row) => row.ruleId === 'earn.share');
    expect(share).toMatchObject({ track: 'ganhos', draft: null });
    expect(share?.published).toEqual({ total: 0, membersAffected: 0, capHits: 0, averagePerMember: 0 });
    expect(table.map((row) => row.ruleId)).toEqual([...table.map((row) => row.ruleId)].sort());
  });
});
