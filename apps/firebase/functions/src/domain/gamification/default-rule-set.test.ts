import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE_SET } from './default-rule-set';
import type { EarnRule } from './types';

function rule(id: string): EarnRule {
  const found = DEFAULT_RULE_SET.earnRules.find((r) => r.id === id);
  if (!found) throw new Error(`missing rule ${id}`);
  return found;
}

describe('DEFAULT_RULE_SET shape', () => {
  it('is schema version 1 with no quests or campaigns', () => {
    expect(DEFAULT_RULE_SET.schemaVersion).toBe(1);
    expect(DEFAULT_RULE_SET.quests).toEqual([]);
    expect(DEFAULT_RULE_SET.campaigns).toEqual([]);
  });

  it('encodes the global caps from C4/C5', () => {
    expect(DEFAULT_RULE_SET.caps).toEqual({
      dailyGanhos: 400,
      perInstanceGanhos: 150,
      weeklyZelo: 200,
      newChoreCooldownHours: 24,
    });
  });

  it('has unique rule ids', () => {
    const ids = DEFAULT_RULE_SET.earnRules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Ganhos earn rules (C4)', () => {
  it('earn.subtask: 1 per XP, daily + per-instance pools, subtask clawbacks', () => {
    const r = rule('earn.subtask');
    expect(r.on).toEqual({ kind: 'ledger.subtask' });
    expect(r.award.amount).toBe(1);
    expect(r.award.perXp).toBe(true);
    expect(r.caps).toEqual([
      { scope: 'member', window: 'day', max: 400, pool: 'dailyGanhos' },
      { scope: 'member+target', window: 'day', max: 150, pool: 'perInstanceGanhos', target: 'instance' },
    ]);
    expect(r.clawback).toEqual([
      { on: 'ledger.undo-subtask', match: 'sourceRef' },
      { on: 'ledger.revoke-subtask', match: 'sourceRef' },
    ]);
    expect(r.spendableAfterHours).toBe(24);
  });

  it('earn.bonus: 1 per XP, counts toward the daily pool, bonus clawbacks', () => {
    const r = rule('earn.bonus');
    expect(r.on.kind).toBe('ledger.bonus');
    expect(r.award.perXp).toBe(true);
    expect(r.caps).toEqual([
      { scope: 'member', window: 'day', max: 400, pool: 'dailyGanhos' },
      { scope: 'member+target', window: 'day', max: 150, pool: 'perInstanceGanhos', target: 'instance' },
    ]);
    expect(r.clawback).toEqual([
      { on: 'ledger.undo-bonus', match: 'sourceRef' },
      { on: 'ledger.revoke-bonus', match: 'sourceRef' },
    ]);
  });

  it('earn.assist: 5 with 3/day and 2/day per assignee target', () => {
    const r = rule('earn.assist');
    expect(r.on).toEqual({ kind: 'ledger.subtask', where: { isAssist: true } });
    expect(r.award.amount).toBe(5);
    expect(r.caps).toEqual([
      { scope: 'member', window: 'day', max: 3 },
      { scope: 'member+target', window: 'day', max: 2, target: 'assignee' },
      { scope: 'member+target', window: 'day', max: 150, pool: 'perInstanceGanhos', target: 'instance' },
    ]);
  });

  it('earn.on_time: 10 with 3/day, reversed on the subtask clawback kinds', () => {
    const r = rule('earn.on_time');
    expect(r.on.kind).toBe('instance.completed_on_time');
    expect(r.award.amount).toBe(10);
    expect(r.caps).toEqual([{ scope: 'member', window: 'day', max: 3 }]);
    expect(r.clawback).toEqual([
      { on: 'ledger.undo-subtask', match: 'sourceRef' },
      { on: 'ledger.revoke-subtask', match: 'sourceRef' },
    ]);
  });

  it('earn.share: 2 with 1/day and no clawback', () => {
    const r = rule('earn.share');
    expect(r.on.kind).toBe('feed.post');
    expect(r.award.amount).toBe(2);
    expect(r.caps).toEqual([{ scope: 'member', window: 'day', max: 1 }]);
    expect(r.clawback).toBeUndefined();
  });

  it('earn.week_goal: 30 once per week when the goal is reached and the member carried 10%', () => {
    const r = rule('earn.week_goal');
    expect(r.on).toEqual({ kind: 'household.week_closed', where: { goalReached: true, minMemberGoalSharePercent: 10 } });
    expect(r.award.amount).toBe(30);
    expect(r.caps).toEqual([{ scope: 'member', window: 'week', max: 1 }]);
  });

  it('earn.streak_milestone: pays the C4 ladder once per milestone per run', () => {
    const r = rule('earn.streak_milestone');
    expect(r.award.milestones).toEqual({ '2': 25, '4': 50, '8': 100, '12': 150, '26': 250 });
    expect(r.celebrate?.moment).toBe('streak');
  });

  it('earn.achievement: pays per tier bronze/silver/gold', () => {
    const r = rule('earn.achievement');
    expect(r.award.tiers).toEqual({ bronze: 20, silver: 50, gold: 120 });
    expect(r.celebrate?.moment).toBe('badge');
  });

  it('earn.welcome: 50 once per life, paid at the first subtask credit', () => {
    const r = rule('earn.welcome');
    expect(r.on).toEqual({ kind: 'member.joined', where: { paidAtFirstSubtaskCredit: true } });
    expect(r.award.amount).toBe(50);
    expect(r.caps).toEqual([{ scope: 'member', window: 'life', max: 1 }]);
  });

  it('every Ganhos rule is spendable after 24 hours', () => {
    for (const r of DEFAULT_RULE_SET.earnRules) {
      if (r.track === 'ganhos') expect(r.spendableAfterHours, r.id).toBe(24);
    }
  });
});

describe('Zelo rules (C5)', () => {
  it('zelo.setup: 50 once per household', () => {
    const r = rule('zelo.setup');
    expect(r.on.kind).toBe('household.setup_finished');
    expect(r.award.amount).toBe(50);
    expect(r.caps).toEqual([
      { scope: 'household', window: 'life', max: 1 },
      { scope: 'member', window: 'week', max: 200, pool: 'weeklyZelo' },
    ]);
  });

  it('zelo.chore_done: 5, 10/week, once per chore, reversed by chore.deleted', () => {
    const r = rule('zelo.chore_done');
    expect(r.on).toEqual({ kind: 'ledger.subtask', where: { firstNonCreatorCompletion: true } });
    expect(r.ref).toBe('chore');
    expect(r.caps).toEqual([
      { scope: 'member+target', window: 'life', max: 1, target: 'chore' },
      { scope: 'member', window: 'week', max: 10 },
      { scope: 'member', window: 'week', max: 200, pool: 'weeklyZelo' },
    ]);
    expect(r.clawback).toEqual([{ on: 'chore.deleted', match: 'sourceRef' }]);
  });

  it('zelo.member_activated: 40, max 11 per household, reversed by member.removed', () => {
    const r = rule('zelo.member_activated');
    expect(r.on).toEqual({
      kind: 'ledger.subtask',
      where: { newMemberActivation: true, joinedWithinDays: 14, requiredCredits: 3 },
    });
    expect(r.ref).toBe('member');
    expect(r.award.amount).toBe(40);
    expect(r.caps).toEqual([
      { scope: 'household', window: 'life', max: 11 },
      { scope: 'member', window: 'week', max: 200, pool: 'weeklyZelo' },
    ]);
    expect(r.clawback).toEqual([{ on: 'member.removed', match: 'sourceRef' }]);
  });

  it('zelo.on_time: 30 at >=70%, 60 at >=90%, once per week', () => {
    const r = rule('zelo.on_time');
    expect(r.on).toEqual({ kind: 'household.week_closed', where: { minInstancesDue: 5, minOnTimeRatePercent: 70 } });
    expect(r.award.amount).toBe(30);
    expect(r.award.overrides).toEqual([{ where: { minOnTimeRatePercent: 90 }, amount: 60 }]);
    expect(r.caps).toEqual([
      { scope: 'member', window: 'week', max: 1 },
      { scope: 'member', window: 'week', max: 200, pool: 'weeklyZelo' },
    ]);
  });

  it('zelo.even_split: 20 once per week when nobody holds more than 60%', () => {
    const r = rule('zelo.even_split');
    expect(r.on).toEqual({ kind: 'household.week_closed', where: { minMembersWithXp: 2, maxTopSharePercent: 60 } });
    expect(r.award.amount).toBe(20);
    expect(r.caps).toEqual([
      { scope: 'member', window: 'week', max: 1 },
      { scope: 'member', window: 'week', max: 200, pool: 'weeklyZelo' },
    ]);
  });

  it('zelo.streak_milestone: pays the C5 ladder within the weekly zelo pool', () => {
    const r = rule('zelo.streak_milestone');
    expect(r.award.milestones).toEqual({ '4': 20, '12': 60, '26': 120 });
    expect(r.caps).toEqual([{ scope: 'member', window: 'week', max: 200, pool: 'weeklyZelo' }]);
  });

  it('Zelo rules are immediately effective (0 spendable hours)', () => {
    for (const r of DEFAULT_RULE_SET.earnRules) {
      if (r.track === 'zelo') expect(r.spendableAfterHours, r.id).toBe(0);
    }
  });
});

describe('streaks, levels and achievements (C6/C7)', () => {
  it('encodes the member streak rule', () => {
    expect(DEFAULT_RULE_SET.streak.member).toEqual({
      minWeekCredits: 3,
      folgaEveryWeeks: 4,
      folgaMax: 1,
      folgaHighLevelFrom: 8,
      folgaMaxHighLevel: 2,
    });
  });

  it('encodes the organizer streak rule', () => {
    expect(DEFAULT_RULE_SET.streak.organizer).toEqual({
      minOnTimeRatePercent: 60,
      minWeekInstancesDue: 5,
      folgaEveryWeeks: 6,
      folgaMax: 1,
    });
  });

  it('encodes the member level curve and title bands', () => {
    expect(DEFAULT_RULE_SET.levels.member.base).toBe(50);
    expect(DEFAULT_RULE_SET.levels.member.titles).toEqual([
      { fromLevel: 1, key: 'rookie' },
      { fromLevel: 3, key: 'helper' },
      { fromLevel: 5, key: 'tidyTitan' },
      { fromLevel: 8, key: 'cleanMaster' },
      { fromLevel: 12, key: 'homeLegend' },
      { fromLevel: 16, key: 'houseGuardian' },
    ]);
  });

  it('encodes the organizer zelo thresholds', () => {
    expect(DEFAULT_RULE_SET.levels.organizer.thresholds).toEqual([
      { zelo: 0, key: 'organizer' },
      { zelo: 200, key: 'sindico' },
      { zelo: 600, key: 'sindicoExperiente' },
      { zelo: 1500, key: 'sindicoMor' },
      { zelo: 3000, key: 'sindicoLendario' },
    ]);
  });

  it('defines exactly the 15 contract achievements with tiers', () => {
    expect(DEFAULT_RULE_SET.achievements.map((a) => a.id)).toEqual([
      'helper',
      'closer',
      'ontime',
      'kitchen',
      'pets',
      'marathon',
      'fit',
      'pillar',
      'spring',
      'yearend',
      'host',
      'maestro',
      'architect',
      'fair',
      'order',
    ]);
    const byId = new Map(DEFAULT_RULE_SET.achievements.map((a) => [a.id, a]));
    expect(byId.get('helper')?.tiers).toEqual({ bronze: 5, silver: 25, gold: 100 });
    expect(byId.get('closer')?.tiers).toEqual({ bronze: 10, silver: 50, gold: 200 });
    expect(byId.get('ontime')?.tiers).toEqual({ bronze: 10, silver: 50, gold: 200 });
    expect(byId.get('kitchen')?.tiers).toEqual({ bronze: 20, silver: 100, gold: 400 });
    expect(byId.get('pets')?.tiers).toEqual({ bronze: 20, silver: 100, gold: 400 });
    expect(byId.get('marathon')?.tiers).toEqual({ bronze: 4, silver: 12, gold: 52 });
    expect(byId.get('fit')?.tiers).toEqual({ bronze: 3 });
    expect(byId.get('fit')?.active).toBe(true);
    expect(byId.get('pillar')?.tiers).toEqual({ bronze: 25 });
    expect(byId.get('pillar')?.active).toBe(true);
    expect(byId.get('spring')?.tiers).toEqual({ bronze: 30 });
    expect(byId.get('spring')?.seasonal).toBe(true);
    expect(byId.get('yearend')?.tiers).toEqual({ bronze: 2 });
    expect(byId.get('yearend')?.seasonal).toBe(true);
    expect(byId.get('host')?.tiers).toEqual({ bronze: 1, silver: 3, gold: 6 });
    expect(byId.get('maestro')?.tiers).toEqual({ bronze: 4, silver: 12, gold: 26 });
    expect(byId.get('architect')?.tiers).toEqual({ bronze: 3, silver: 10, gold: 25 });
    expect(byId.get('fair')?.tiers).toEqual({ bronze: 4, silver: 12, gold: 26 });
    expect(byId.get('order')?.tiers).toEqual({ bronze: 80 });
    expect(byId.get('order')?.active).toBe(true);
    expect(byId.get('host')?.track).toBe('organizer');
    expect(byId.get('helper')?.track).toBe('member');
  });
});
