// Live preview of the Ganhos toast an event would produce, shown in the earn
// rule editor while typing. Mirrors the mobile toast line style:
// "Lavar a louça do jantar · +20 Ganhos". Turbo (campaign) multipliers apply
// when a campaign covering the rule is active on the preview date.

import type { CampaignDef, EarnRule, RuleSet, Track } from './engine-types';

export const DEFAULT_SAMPLE_ACTION = 'Lavar a louça do jantar';
export const DEFAULT_SAMPLE_XP = 20;

export interface ToastPreview {
  amount: number;
  /** celebrate.copyKey when set, else the rule id. */
  label: string;
  /** The toast line the member would see. */
  line: string;
  turboMultiplier: 1.5 | 2 | null;
}

function trackName(track: Track): string {
  return track === 'ganhos' ? 'Ganhos' : 'Zelo';
}

/** The campaign active on `today` that multiplies `ruleId`, if any (C2). */
export function activeCampaignFor(
  rules: Pick<RuleSet, 'campaigns'>,
  ruleId: string,
  today: string,
): CampaignDef | null {
  return (
    rules.campaigns.find(
      (campaign) =>
        campaign.ruleIds.includes(ruleId) &&
        campaign.activeFrom <= today &&
        (campaign.activeTo === null || campaign.activeTo >= today),
    ) ?? null
  );
}

export function previewToast(
  rule: Pick<EarnRule, 'id' | 'track' | 'award' | 'celebrate'>,
  rules: Pick<RuleSet, 'campaigns'>,
  opts?: { sampleXp?: number; sampleAction?: string; today?: string },
): ToastPreview {
  const sampleXp = opts?.sampleXp ?? DEFAULT_SAMPLE_XP;
  const action = opts?.sampleAction ?? DEFAULT_SAMPLE_ACTION;
  const today = opts?.today ?? new Date().toISOString().slice(0, 10);

  const base = rule.award.perXp ? rule.award.amount * sampleXp : rule.award.amount;
  const campaign = activeCampaignFor(rules, rule.id, today);
  const turboMultiplier = campaign ? campaign.multiplier : null;
  const amount = turboMultiplier ? Math.round(base * turboMultiplier) : base;
  const label = rule.celebrate ? rule.celebrate.copyKey : rule.id;

  return {
    amount,
    label,
    line: `${action} · +${amount} ${trackName(rule.track)}`,
    turboMultiplier,
  };
}
