import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE_SET } from './default-rule-set';
import { validateRuleSet } from './validate-rule-set';

/** Deep clone via JSON keeps the rule set literal-shaped for patching. */
function base(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(DEFAULT_RULE_SET)) as Record<string, unknown>;
}

describe('validateRuleSet', () => {
  it('accepts the built-in DEFAULT_RULE_SET', () => {
    const result = validateRuleSet(DEFAULT_RULE_SET);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rules).toEqual(DEFAULT_RULE_SET);
  });

  it('accepts a JSON round-trip of the default set (Firestore shape)', () => {
    expect(validateRuleSet(base()).ok).toBe(true);
  });

  it('rejects non-objects and wrong schema versions', () => {
    expect(validateRuleSet('nope').ok).toBe(false);
    expect(validateRuleSet(null).ok).toBe(false);
    expect(validateRuleSet([]).ok).toBe(false);
    const badVersion = base();
    badVersion.schemaVersion = 2;
    const result = validateRuleSet(badVersion);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('schemaVersion'))).toBe(true);
  });

  it('collects every structural error instead of stopping at the first', () => {
    const broken = base();
    const rules = broken.earnRules as Record<string, unknown>[];
    rules.push({ ...rules[0], id: 'earn.subtask' }); // duplicate id
    rules.push({ id: 'earn.bad', award: { amount: -1 }, caps: [{ scope: 'member', window: 'day', max: 0 }] });
    const result = validateRuleSet(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('requires unique rule ids', () => {
    const broken = base();
    const rules = broken.earnRules as Record<string, unknown>[];
    rules[1] = { ...rules[1], id: (rules[0] as { id: string }).id };
    expect(validateRuleSet(broken).ok).toBe(false);
  });

  it('rejects non-finite and negative amounts', () => {
    const broken = base();
    (broken.earnRules as Record<string, unknown>[])[0] = {
      ...(broken.earnRules as Record<string, unknown>[])[0],
      award: { amount: Number.NaN },
    };
    expect(validateRuleSet(broken).ok).toBe(false);

    const broken2 = base();
    (broken2.earnRules as Record<string, unknown>[])[0] = {
      ...(broken2.earnRules as Record<string, unknown>[])[0],
      award: { amount: -5 },
    };
    expect(validateRuleSet(broken2).ok).toBe(false);
  });

  it('rejects non-integer or non-positive cap maxima and bad scopes/windows', () => {
    const broken = base();
    (broken.earnRules as Record<string, unknown>[])[0] = {
      ...(broken.earnRules as Record<string, unknown>[])[0],
      caps: [{ scope: 'member', window: 'day', max: 1.5 }],
    };
    expect(validateRuleSet(broken).ok).toBe(false);

    const broken2 = base();
    (broken2.earnRules as Record<string, unknown>[])[0] = {
      ...(broken2.earnRules as Record<string, unknown>[])[0],
      caps: [{ scope: 'world', window: 'day', max: 1 }],
    };
    expect(validateRuleSet(broken2).ok).toBe(false);

    const broken3 = base();
    (broken3.earnRules as Record<string, unknown>[])[0] = {
      ...(broken3.earnRules as Record<string, unknown>[])[0],
      caps: [{ scope: 'member', window: 'month', max: 1 }],
    };
    expect(validateRuleSet(broken3).ok).toBe(false);
  });

  it('rejects unknown event kinds, tracks, statuses and spendable hours', () => {
    const broken = base();
    (broken.earnRules as Record<string, unknown>[])[0] = {
      ...(broken.earnRules as Record<string, unknown>[])[0],
      on: { kind: 'ledger.typo' },
    };
    expect(validateRuleSet(broken).ok).toBe(false);

    const broken2 = base();
    (broken2.earnRules as Record<string, unknown>[])[0] = {
      ...(broken2.earnRules as Record<string, unknown>[])[0],
      track: 'xp',
    };
    expect(validateRuleSet(broken2).ok).toBe(false);

    const broken3 = base();
    (broken3.earnRules as Record<string, unknown>[])[0] = {
      ...(broken3.earnRules as Record<string, unknown>[])[0],
      status: 'draft',
    };
    expect(validateRuleSet(broken3).ok).toBe(false);

    const broken4 = base();
    (broken4.earnRules as Record<string, unknown>[])[0] = {
      ...(broken4.earnRules as Record<string, unknown>[])[0],
      spendableAfterHours: -1,
    };
    expect(validateRuleSet(broken4).ok).toBe(false);
  });

  it('rejects non-ISO or inverted active windows', () => {
    const broken = base();
    (broken.earnRules as Record<string, unknown>[])[0] = {
      ...(broken.earnRules as Record<string, unknown>[])[0],
      activeFrom: '2026-13-40',
    };
    expect(validateRuleSet(broken).ok).toBe(false);

    const inverted = base();
    (inverted.earnRules as Record<string, unknown>[])[0] = {
      ...(inverted.earnRules as Record<string, unknown>[])[0],
      activeFrom: '2026-11-25',
      activeTo: '2026-11-24',
    };
    expect(validateRuleSet(inverted).ok).toBe(false);
  });

  it('requires ascending achievement tiers and unique achievement ids', () => {
    const broken = base();
    (broken.achievements as Record<string, unknown>[])[0] = {
      ...(broken.achievements as Record<string, unknown>[])[0],
      tiers: { bronze: 100, silver: 25, gold: 50 },
    };
    expect(validateRuleSet(broken).ok).toBe(false);

    const broken2 = base();
    const achievements = broken2.achievements as Record<string, unknown>[];
    achievements[1] = { ...achievements[1], id: (achievements[0] as { id: string }).id };
    expect(validateRuleSet(broken2).ok).toBe(false);

    const broken3 = base();
    (broken3.achievements as Record<string, unknown>[])[0] = {
      ...(broken3.achievements as Record<string, unknown>[])[0],
      tiers: { silver: 25, gold: 50 }, // no bronze
    };
    expect(validateRuleSet(broken3).ok).toBe(false);
  });

  it('rejects bad level titles and organizer thresholds', () => {
    const broken = base();
    const levels = broken.levels as Record<string, Record<string, unknown>>;
    levels.member = { base: 0, titles: [] };
    const result = validateRuleSet(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('levels.member.base'))).toBe(true);

    const broken2 = base();
    const levels2 = broken2.levels as Record<string, Record<string, unknown>>;
    levels2.organizer = { thresholds: [{ zelo: 600, key: 'a' }, { zelo: 200, key: 'b' }] };
    expect(validateRuleSet(broken2).ok).toBe(false);

    const broken3 = base();
    const levels3 = broken3.levels as Record<string, Record<string, unknown>>;
    levels3.member = {
      base: 50,
      titles: [
        { fromLevel: 3, key: 'helper' },
        { fromLevel: 1, key: 'rookie' },
      ],
    };
    expect(validateRuleSet(broken3).ok).toBe(false);
  });

  it('rejects bad streak rules and global caps', () => {
    const broken = base();
    (broken.streak as Record<string, Record<string, unknown>>).member = { minWeekCredits: 0, folgaEveryWeeks: 4, folgaMax: 1, folgaHighLevelFrom: 8, folgaMaxHighLevel: 2 };
    expect(validateRuleSet(broken).ok).toBe(false);

    const broken2 = base();
    (broken2.caps as Record<string, unknown>).dailyGanhos = 400.5;
    expect(validateRuleSet(broken2).ok).toBe(false);

    const broken3 = base();
    (broken3.caps as Record<string, unknown>).newChoreCooldownHours = -1;
    expect(validateRuleSet(broken3).ok).toBe(false);
  });

  it('validates campaigns: multiplier in {1.5, 2}, real rule ids, ISO window', () => {
    const ok = base();
    ok.campaigns = [
      {
        id: 'turbo',
        multiplier: 1.5,
        ruleIds: ['earn.subtask'],
        activeFrom: '2026-11-23',
        activeTo: '2026-11-29',
      },
    ];
    expect(validateRuleSet(ok).ok).toBe(true);

    const badMultiplier = base();
    badMultiplier.campaigns = [{ id: 'turbo', multiplier: 3, ruleIds: ['earn.subtask'], activeFrom: '2026-11-23', activeTo: null }];
    expect(validateRuleSet(badMultiplier).ok).toBe(false);

    const badRule = base();
    badRule.campaigns = [{ id: 'turbo', multiplier: 2, ruleIds: ['earn.nope'], activeFrom: '2026-11-23', activeTo: null }];
    expect(validateRuleSet(badRule).ok).toBe(false);

    const badDate = base();
    badDate.campaigns = [{ id: 'turbo', multiplier: 2, ruleIds: ['earn.subtask'], activeFrom: 'nope', activeTo: null }];
    expect(validateRuleSet(badDate).ok).toBe(false);
  });

  it('validates quests: unique ids, steps and rewards reference real rules', () => {
    const ok = base();
    ok.quests = [
      {
        id: 'q1',
        titleKey: 'gami.quest.welcome',
        steps: [{ ruleId: 'earn.subtask', count: 5 }],
        reward: { track: 'ganhos', amount: 10, copyKey: 'gami.quest.done' },
      },
    ];
    expect(validateRuleSet(ok).ok).toBe(true);

    const badStep = base();
    badStep.quests = [{ id: 'q1', titleKey: 'k', steps: [{ ruleId: 'earn.nope', count: 1 }], reward: { track: 'ganhos', amount: 1, copyKey: 'c' } }];
    expect(validateRuleSet(badStep).ok).toBe(false);

    const badCount = base();
    badCount.quests = [{ id: 'q1', titleKey: 'k', steps: [{ ruleId: 'earn.subtask', count: 0 }], reward: { track: 'ganhos', amount: 1, copyKey: 'c' } }];
    expect(validateRuleSet(badCount).ok).toBe(false);
  });
});
