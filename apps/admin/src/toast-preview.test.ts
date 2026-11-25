import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SAMPLE_ACTION,
  activeCampaignFor,
  previewToast,
} from './toast-preview';
import { sampleRulesV1, sampleRulesV2 } from './test/api-mock';

const shareRule = sampleRulesV1().earnRules[1];
const subtaskRule = sampleRulesV1().earnRules[0];

describe('previewToast', () => {
  it('renders the toast line for a flat rule', () => {
    const preview = previewToast(shareRule, sampleRulesV1(), { today: '2026-11-24' });
    expect(preview).toEqual({
      amount: 2,
      label: 'gami.earn.share',
      line: `${DEFAULT_SAMPLE_ACTION} · +2 Ganhos`,
      turboMultiplier: null,
    });
  });

  it('multiplies by the sample XP for perXp rules', () => {
    const preview = previewToast(subtaskRule, sampleRulesV1(), { today: '2026-11-24' });
    expect(preview.amount).toBe(20);
    expect(preview.line).toBe(`${DEFAULT_SAMPLE_ACTION} · +20 Ganhos`);
  });

  it('honours a custom sample action and XP', () => {
    const preview = previewToast(subtaskRule, sampleRulesV1(), {
      sampleXp: 7,
      sampleAction: 'Organizar o armário',
      today: '2026-11-24',
    });
    expect(preview.line).toBe('Organizar o armário · +7 Ganhos');
  });

  it('applies an active Turbo campaign and rounds', () => {
    // sampleRulesV2 has a ×2 campaign covering earn.subtask, open-ended.
    const preview = previewToast(subtaskRule, sampleRulesV2(), { today: '2026-11-24' });
    expect(preview.turboMultiplier).toBe(2);
    expect(preview.amount).toBe(40);
    expect(preview.line).toBe(`${DEFAULT_SAMPLE_ACTION} · +40 Ganhos`);
  });

  it('ignores expired campaigns', () => {
    const rules = {
      ...sampleRulesV2(),
      campaigns: sampleRulesV2().campaigns.map((c) => ({
        ...c,
        activeFrom: '2026-01-01',
        activeTo: '2026-02-01',
      })),
    };
    const preview = previewToast(subtaskRule, rules, { today: '2026-11-24' });
    expect(preview.turboMultiplier).toBeNull();
    expect(preview.amount).toBe(20);
  });

  it('labels zelo rules with Zelo', () => {
    const zeloRule = { ...shareRule, track: 'zelo' as const };
    const preview = previewToast(zeloRule, sampleRulesV1(), { today: '2026-11-24' });
    expect(preview.line.endsWith('+2 Zelo')).toBe(true);
  });

  it('falls back to the rule id as label when there is no celebrate', () => {
    const bareRule = { ...shareRule, celebrate: undefined };
    const preview = previewToast(bareRule, sampleRulesV1(), { today: '2026-11-24' });
    expect(preview.label).toBe('earn.share');
  });
});

describe('activeCampaignFor', () => {
  it('finds the campaign covering the rule on the day', () => {
    const campaign = activeCampaignFor(sampleRulesV2(), 'earn.subtask', '2026-11-24');
    expect(campaign?.id).toBe('turbo-launch');
    expect(activeCampaignFor(sampleRulesV2(), 'earn.share', '2026-11-24')).toBeNull();
  });
});
