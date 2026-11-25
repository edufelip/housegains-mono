import { describe, expect, it } from 'vitest';
import {
  emptyCapForm,
  needsSecondAdmin,
  parseAdjustmentForm,
  parseConfigForm,
  parseDays,
  parseEarnRuleForm,
  toEarnRuleForm,
  type EarnRuleForm,
} from './validation';
import type { EarnRule } from './engine-types';
import { sampleRulesV1 } from './test/api-mock';

describe('parseConfigForm', () => {
  it('accepts valid percents', () => {
    const { value, errors } = parseConfigForm('shadow', '10', '5');
    expect(errors).toEqual([]);
    expect(value).toEqual({ mode: 'shadow', livePercent: 10, controlPercent: 5 });
  });

  it('accepts 100 total but rejects 101', () => {
    expect(parseConfigForm('live', '60', '40').errors).toEqual([]);
    const over = parseConfigForm('live', '60', '41');
    expect(over.value).toBeNull();
    expect(over.errors).toContain('livePercent + controlPercent must be at most 100.');
  });

  it('rejects out-of-range and non-integer percents', () => {
    expect(parseConfigForm('live', '101', '0').errors[0]).toMatch(/between 0 and 100/);
    expect(parseConfigForm('live', '12.5', '0').errors[0]).toMatch(/whole number/);
    expect(parseConfigForm('live', '', '0').errors[0]).toMatch(/whole number/);
  });

  it('rejects an unknown mode', () => {
    expect(parseConfigForm('turbo', '10', '5').errors).toContain(
      'Mode must be off, shadow or live.',
    );
  });
});

describe('parseDays', () => {
  it('accepts 1..28', () => {
    expect(parseDays('1').value).toBe(1);
    expect(parseDays('28').value).toBe(28);
  });

  it('rejects 0, 29 and garbage', () => {
    expect(parseDays('0').error).toMatch(/between 1 and 28/);
    expect(parseDays('29').error).toMatch(/between 1 and 28/);
    expect(parseDays('week').error).toMatch(/whole number/);
  });
});

describe('needsSecondAdmin', () => {
  it('is false at exactly ±500 and true above', () => {
    expect(needsSecondAdmin(500)).toBe(false);
    expect(needsSecondAdmin(-500)).toBe(false);
    expect(needsSecondAdmin(501)).toBe(true);
    expect(needsSecondAdmin(-501)).toBe(true);
    expect(needsSecondAdmin(0)).toBe(false);
  });
});

describe('parseAdjustmentForm', () => {
  it('accepts a signed amount with reason and note', () => {
    const { value, errors } = parseAdjustmentForm('-25', 'abuse', '  farmed XP  ');
    expect(errors).toEqual([]);
    expect(value).toEqual({ amount: -25, reasonCode: 'abuse', note: 'farmed XP' });
  });

  it('rejects zero, a missing reason and an empty note', () => {
    const { value, errors } = parseAdjustmentForm('0', '', '');
    expect(value).toBeNull();
    expect(errors).toContain('Amount must not be zero.');
    expect(errors).toContain('Pick a reason code.');
    expect(errors).toContain('A note is required.');
  });

  it('rejects non-integer amounts', () => {
    expect(parseAdjustmentForm('10.5', 'correction', 'note').errors[0]).toMatch(
      /whole number/,
    );
  });
});

function validForm(): EarnRuleForm {
  return {
    id: 'earn.subtask',
    track: 'ganhos',
    status: 'active',
    ref: '',
    eventKind: 'ledger.subtask',
    where: '',
    amount: '1',
    perXp: true,
    awardExtras: '',
    caps: [{ ...emptyCapForm(), max: '400', pool: 'dailyGanhos' }],
    clawback: [{ on: 'ledger.undo-subtask' }],
    spendableAfterHours: '24',
    celebrateMoment: 'toast',
    celebrateCopyKey: 'gami.earn.chore',
    minHouseholdMembers: '',
    activeFrom: '',
    activeTo: '',
  };
}

describe('parseEarnRuleForm', () => {
  it('round-trips a default rule through the form', () => {
    const rule = sampleRulesV1().earnRules[0];
    const parsed = parseEarnRuleForm(toEarnRuleForm(rule));
    expect(parsed.errors).toEqual([]);
    expect(parsed.value).toEqual(rule);
  });

  it('round-trips rules with extras: where, overrides, tiers, audience, ref', () => {
    const rule: EarnRule = {
      ...sampleRulesV1().earnRules[1],
      on: { kind: 'ledger.subtask', where: { isAssist: true } },
      award: {
        amount: 30,
        overrides: [{ where: { minOnTimeRatePercent: 90 }, amount: 60 }],
        tiers: { bronze: 20, gold: 120 },
        milestones: { '4': 50 },
      },
      ref: 'chore' as const,
      audience: { minHouseholdMembers: 2 },
      activeFrom: '2026-01-01',
      activeTo: '2026-06-01',
    };
    const parsed = parseEarnRuleForm(toEarnRuleForm(rule));
    expect(parsed.errors).toEqual([]);
    expect(parsed.value).toEqual(rule);
  });

  it('flags a bad id, negative amount and a member+target cap without target', () => {
    const form = validForm();
    form.id = 'Earn Rule!';
    form.amount = '-1';
    form.caps = [{ ...emptyCapForm(), scope: 'member+target', max: '2' }];
    const { value, errors } = parseEarnRuleForm(form);
    expect(value).toBeNull();
    expect(errors).toContain(
      'id must start with a letter and use only a-z, 0-9, ".", "_" or "-".',
    );
    expect(errors).toContain('amount must be between 0 and 1000000.');
    expect(errors).toContain('caps[0]: a member+target cap needs a target.');
  });

  it('reports invalid JSON in where and award extras', () => {
    const form = validForm();
    form.where = '{oops';
    form.awardExtras = '[]';
    const { errors } = parseEarnRuleForm(form);
    expect(errors.join(' ')).toMatch(/where: invalid JSON/);
    expect(errors).toContain('award extras must be a JSON object.');
  });

  it('rejects a celebrate moment without a copyKey', () => {
    const form = validForm();
    form.celebrateCopyKey = '';
    expect(parseEarnRuleForm(form).errors).toContain('celebrate needs a copyKey.');
  });

  it('rejects activeTo before activeFrom and invalid dates', () => {
    const form = validForm();
    form.activeFrom = '2026-05-02';
    form.activeTo = '2026-05-01';
    expect(parseEarnRuleForm(form).errors).toContain('activeTo must not be before activeFrom.');

    const badDate = validForm();
    badDate.activeFrom = '2026-02-30';
    expect(parseEarnRuleForm(badDate).errors).toContain(
      'activeFrom must be a valid YYYY-MM-DD date.',
    );
  });

  it('rejects malformed award extras shapes', () => {
    const form = validForm();
    form.awardExtras = '{"overrides": [{"amount": "many"}]}';
    const { errors } = parseEarnRuleForm(form);
    expect(errors).toContain(
      'award extras: overrides must be [{ where: {}, amount: number }].',
    );
  });
});
