// Structural validation for rule sets stored in gamification/ruleSets (C2/C10).
// Collects every error: adminSaveDraft shows them all at once.

import type {
  AchievementDef,
  CampaignDef,
  CapPool,
  CapScope,
  CapWindow,
  ClawbackRule,
  EarnRule,
  EventKind,
  QuestDef,
  RuleSet,
  Tier,
  Track,
} from './types';

export type ValidateResult = { ok: true; rules: RuleSet } | { ok: false; errors: string[] };

const EVENT_KINDS: EventKind[] = [
  'ledger.subtask',
  'ledger.bonus',
  'ledger.undo-subtask',
  'ledger.undo-bonus',
  'ledger.revoke-subtask',
  'ledger.revoke-bonus',
  'feed.post',
  'instance.completed_on_time',
  'member.joined',
  'member.activated',
  'member.removed',
  'household.setup_finished',
  'chore.created',
  'chore.deleted',
  'household.week_closed',
];
const TRACKS: Track[] = ['ganhos', 'zelo'];
const SCOPES: CapScope[] = ['member', 'member+target', 'household', 'lifetime'];
const WINDOWS: CapWindow[] = ['day', 'week', 'life'];
const POOLS: CapPool[] = ['dailyGanhos', 'perInstanceGanhos', 'weeklyZelo'];
const TARGETS = ['instance', 'assignee', 'chore'];
const TIERS: Tier[] = ['bronze', 'silver', 'gold'];
const REFS = ['action', 'chore', 'member', 'instance'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isIsoDate(value: unknown): value is string {
  // Local check: the shared isDateKey throws on impossible dates, which a
  // validator must not do on untrusted input.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateRuleSet(raw: unknown): ValidateResult {
  const errors: string[] = [];
  if (!isRecord(raw)) return { ok: false, errors: ['rule set must be an object'] };
  if (raw.schemaVersion !== 1) errors.push('schemaVersion must be 1.');

  const earnRules = validateEarnRules(raw.earnRules, errors);
  const achievements = validateAchievements(raw.achievements, errors);
  const levels = validateLevels(raw.levels, errors);
  const streak = validateStreak(raw.streak, errors);
  const caps = validateCapsConfig(raw.caps, errors);
  const quests = validateQuests(raw.quests, earnRules, errors);
  const campaigns = validateCampaigns(raw.campaigns, earnRules, errors);

  if (errors.length > 0 || !earnRules || !achievements || !levels || !streak || !caps || !quests || !campaigns) {
    return { ok: false, errors: errors.length > 0 ? errors : ['rule set is incomplete'] };
  }
  return { ok: true, rules: { ...raw, earnRules, achievements, levels, streak, caps, quests, campaigns } as RuleSet };
}

function validateEarnRules(raw: unknown, errors: string[]): EarnRule[] | null {
  if (!Array.isArray(raw)) {
    errors.push('earnRules must be a list.');
    return null;
  }
  const seen = new Set<string>();
  const rules: EarnRule[] = [];
  raw.forEach((entry: unknown, index: number) => {
    if (!isRecord(entry)) {
      errors.push(`earnRules[${index}] must be an object.`);
      return;
    }
    const where = `earnRules[${index}]`;
    if (!isNonEmptyString(entry.id)) {
      errors.push(`${where}.id must be a non-empty string.`);
      return;
    }
    if (seen.has(entry.id)) errors.push(`${where}.id '${entry.id}' is duplicated.`);
    seen.add(entry.id);
    if (!TRACKS.includes(entry.track as Track)) errors.push(`${where}.track must be 'ganhos' or 'zelo'.`);
    if (entry.status !== 'active' && entry.status !== 'paused') {
      errors.push(`${where}.status must be 'active' or 'paused'.`);
    }
    const on = entry.on;
    if (!isRecord(on) || !EVENT_KINDS.includes(on.kind as EventKind)) {
      errors.push(`${where}.on.kind must be a known EventKind.`);
    } else if (on.where !== undefined && !isRecord(on.where)) {
      errors.push(`${where}.on.where must be an object.`);
    }
    const award = entry.award;
    if (!isRecord(award) || !isAmount(award.amount)) {
      errors.push(`${where}.award.amount must be a finite number >= 0.`);
    } else {
      if (award.perXp !== undefined && typeof award.perXp !== 'boolean') {
        errors.push(`${where}.award.perXp must be a boolean.`);
      }
      if (award.overrides !== undefined) {
        if (!Array.isArray(award.overrides)) errors.push(`${where}.award.overrides must be a list.`);
        else {
          award.overrides.forEach((override: unknown, oIndex: number) => {
            if (!isRecord(override) || !isRecord(override.where) || !isAmount(override.amount)) {
              errors.push(`${where}.award.overrides[${oIndex}] needs where and a finite amount >= 0.`);
            }
          });
        }
      }
      if (award.milestones !== undefined) {
        if (!isRecord(award.milestones)) errors.push(`${where}.award.milestones must be an object.`);
        else {
          for (const [key, value] of Object.entries(award.milestones)) {
            if (!/^\d+$/.test(key) || !isAmount(value)) {
              errors.push(`${where}.award.milestones['${key}'] needs a numeric key and a finite amount >= 0.`);
            }
          }
        }
      }
      if (award.tiers !== undefined) {
        if (!isRecord(award.tiers)) errors.push(`${where}.award.tiers must be an object.`);
        else {
          for (const tier of TIERS) {
            const value = award.tiers[tier];
            if (value !== undefined && !isAmount(value)) {
              errors.push(`${where}.award.tiers.${tier} must be a finite number >= 0.`);
            }
          }
        }
      }
    }
    if (!Array.isArray(entry.caps)) {
      errors.push(`${where}.caps must be a list.`);
    } else {
      entry.caps.forEach((cap: unknown, cIndex: number) => {
        const at = `${where}.caps[${cIndex}]`;
        if (!isRecord(cap)) {
          errors.push(`${at} must be an object.`);
          return;
        }
        if (!SCOPES.includes(cap.scope as CapScope)) errors.push(`${at}.scope is unknown.`);
        if (!WINDOWS.includes(cap.window as CapWindow)) errors.push(`${at}.window must be day, week or life.`);
        if (!isCount(cap.max)) errors.push(`${at}.max must be a whole number >= 1.`);
        if (cap.pool !== undefined && !POOLS.includes(cap.pool as CapPool)) errors.push(`${at}.pool is unknown.`);
        if (cap.target !== undefined && !TARGETS.includes(cap.target as string)) {
          errors.push(`${at}.target must be instance, assignee or chore.`);
        }
      });
    }
    if (entry.clawback !== undefined) {
      if (!Array.isArray(entry.clawback)) errors.push(`${where}.clawback must be a list.`);
      else {
        entry.clawback.forEach((rule: unknown, kIndex: number) => {
          const at = `${where}.clawback[${kIndex}]`;
          if (!isRecord(rule) || !EVENT_KINDS.includes(rule.on as EventKind) || rule.match !== 'sourceRef') {
            errors.push(`${at} must name a known EventKind and match 'sourceRef'.`);
          }
        });
      }
    }
    if (typeof entry.spendableAfterHours !== 'number' || !Number.isFinite(entry.spendableAfterHours) || entry.spendableAfterHours < 0) {
      errors.push(`${where}.spendableAfterHours must be a finite number >= 0.`);
    }
    if (entry.celebrate !== undefined) {
      const c = entry.celebrate;
      if (
        !isRecord(c) ||
        !['toast', 'badge', 'streak', 'level'].includes(c.moment as string) ||
        !isNonEmptyString(c.copyKey)
      ) {
        errors.push(`${where}.celebrate needs a moment and a copyKey.`);
      }
    }
    if (entry.audience !== undefined) {
      if (
        !isRecord(entry.audience) ||
        (entry.audience.minHouseholdMembers !== undefined && !isCount(entry.audience.minHouseholdMembers))
      ) {
        errors.push(`${where}.audience.minHouseholdMembers must be a whole number >= 1.`);
      }
    }
    if (entry.activeFrom !== undefined && !isIsoDate(entry.activeFrom)) {
      errors.push(`${where}.activeFrom must be an ISO date (YYYY-MM-DD).`);
    }
    if (entry.activeTo !== undefined && entry.activeTo !== null && !isIsoDate(entry.activeTo)) {
      errors.push(`${where}.activeTo must be null or an ISO date (YYYY-MM-DD).`);
    }
    if (isIsoDate(entry.activeFrom) && isIsoDate(entry.activeTo as string) && entry.activeFrom > (entry.activeTo as string)) {
      errors.push(`${where}.activeFrom must not be after activeTo.`);
    }
    if (entry.ref !== undefined && !REFS.includes(entry.ref as string)) {
      errors.push(`${where}.ref must be action, chore, member or instance.`);
    }
    rules.push(entry as unknown as EarnRule);
  });
  return rules;
}

function validateAchievements(raw: unknown, errors: string[]): AchievementDef[] | null {
  if (!Array.isArray(raw)) {
    errors.push('achievements must be a list.');
    return null;
  }
  const seen = new Set<string>();
  const achievements: AchievementDef[] = [];
  raw.forEach((entry: unknown, index: number) => {
    if (!isRecord(entry)) {
      errors.push(`achievements[${index}] must be an object.`);
      return;
    }
    const where = `achievements[${index}]`;
    if (!isNonEmptyString(entry.id)) {
      errors.push(`${where}.id must be a non-empty string.`);
      return;
    }
    if (seen.has(entry.id)) errors.push(`${where}.id '${entry.id}' is duplicated.`);
    seen.add(entry.id);
    if (entry.track !== 'member' && entry.track !== 'organizer') {
      errors.push(`${where}.track must be 'member' or 'organizer'.`);
    }
    if (!isNonEmptyString(entry.metric)) errors.push(`${where}.metric must be a non-empty string.`);
    const tiers = entry.tiers;
    if (!isRecord(tiers) || !isCount(tiers.bronze)) {
      errors.push(`${where}.tiers.bronze must be a whole number >= 1.`);
    } else {
      const bronze = tiers.bronze as number;
      const silver = tiers.silver;
      const gold = tiers.gold;
      if (silver !== undefined && !isCount(silver)) errors.push(`${where}.tiers.silver must be a whole number >= 1.`);
      if (gold !== undefined && !isCount(gold)) errors.push(`${where}.tiers.gold must be a whole number >= 1.`);
      if (typeof silver === 'number' && Number.isInteger(silver) && silver <= bronze) {
        errors.push(`${where}.tiers must ascend: silver > bronze.`);
      }
      if (typeof gold === 'number' && Number.isInteger(gold) && typeof silver === 'number' && gold <= silver) {
        errors.push(`${where}.tiers must ascend: gold > silver.`);
      }
    }
    if (entry.active !== undefined && typeof entry.active !== 'boolean') {
      errors.push(`${where}.active must be a boolean.`);
    }
    if (entry.seasonal !== undefined && typeof entry.seasonal !== 'boolean') {
      errors.push(`${where}.seasonal must be a boolean.`);
    }
    achievements.push(entry as unknown as AchievementDef);
  });
  return achievements;
}

function validateLevels(
  raw: unknown,
  errors: string[],
): RuleSet['levels'] | null {
  if (!isRecord(raw) || !isRecord(raw.member) || !isRecord(raw.organizer)) {
    errors.push('levels must have member and organizer sections.');
    return null;
  }
  const member = raw.member;
  if (typeof member.base !== 'number' || !Number.isInteger(member.base) || member.base < 1) {
    errors.push('levels.member.base must be a whole number >= 1.');
  }
  if (!Array.isArray(member.titles) || member.titles.length === 0) {
    errors.push('levels.member.titles must be a non-empty list.');
  } else {
    let previous = 0;
    member.titles.forEach((title: unknown, index: number) => {
      if (!isRecord(title) || !isCount(title.fromLevel) || !isNonEmptyString(title.key)) {
        errors.push(`levels.member.titles[${index}] needs fromLevel and key.`);
        return;
      }
      if (title.fromLevel <= previous) {
        errors.push(`levels.member.titles[${index}].fromLevel must ascend.`);
      }
      previous = title.fromLevel as number;
    });
  }
  const organizer = raw.organizer;
  if (!Array.isArray(organizer.thresholds) || organizer.thresholds.length === 0) {
    errors.push('levels.organizer.thresholds must be a non-empty list.');
  } else {
    let previous = -1;
    organizer.thresholds.forEach((threshold: unknown, index: number) => {
      if (
        !isRecord(threshold) ||
        typeof threshold.zelo !== 'number' ||
        !Number.isInteger(threshold.zelo) ||
        threshold.zelo < 0 ||
        !isNonEmptyString(threshold.key)
      ) {
        errors.push(`levels.organizer.thresholds[${index}] needs zelo and key.`);
        return;
      }
      if (threshold.zelo <= previous) {
        errors.push(`levels.organizer.thresholds[${index}].zelo must ascend.`);
      }
      previous = threshold.zelo as number;
    });
  }
  return raw as RuleSet['levels'];
}

function validateStreak(raw: unknown, errors: string[]): RuleSet['streak'] | null {
  if (!isRecord(raw) || !isRecord(raw.member) || !isRecord(raw.organizer)) {
    errors.push('streak must have member and organizer sections.');
    return null;
  }
  const member = raw.member;
  for (const field of ['minWeekCredits', 'folgaEveryWeeks', 'folgaMax', 'folgaHighLevelFrom', 'folgaMaxHighLevel'] as const) {
    if (!isCount(member[field])) errors.push(`streak.member.${field} must be a whole number >= 1.`);
  }
  const organizer = raw.organizer;
  for (const field of ['minOnTimeRatePercent', 'minWeekInstancesDue', 'folgaEveryWeeks', 'folgaMax'] as const) {
    if (!isCount(organizer[field])) errors.push(`streak.organizer.${field} must be a whole number >= 1.`);
  }
  return raw as RuleSet['streak'];
}

function validateCapsConfig(raw: unknown, errors: string[]): RuleSet['caps'] | null {
  if (!isRecord(raw)) {
    errors.push('caps must be an object.');
    return null;
  }
  for (const field of ['dailyGanhos', 'perInstanceGanhos', 'weeklyZelo'] as const) {
    if (!isCount(raw[field])) errors.push(`caps.${field} must be a whole number >= 1.`);
  }
  if (
    typeof raw.newChoreCooldownHours !== 'number' ||
    !Number.isInteger(raw.newChoreCooldownHours) ||
    raw.newChoreCooldownHours < 0
  ) {
    errors.push('caps.newChoreCooldownHours must be a whole number >= 0.');
  }
  return raw as RuleSet['caps'];
}

function validateQuests(raw: unknown, rules: EarnRule[] | null, errors: string[]): QuestDef[] | null {
  if (raw === undefined) {
    errors.push('quests must be a list.');
    return null;
  }
  if (!Array.isArray(raw)) {
    errors.push('quests must be a list.');
    return null;
  }
  const known = new Set((rules ?? []).map((rule) => rule.id));
  const seen = new Set<string>();
  const quests: QuestDef[] = [];
  raw.forEach((entry: unknown, index: number) => {
    if (!isRecord(entry)) {
      errors.push(`quests[${index}] must be an object.`);
      return;
    }
    const where = `quests[${index}]`;
    if (!isNonEmptyString(entry.id)) {
      errors.push(`${where}.id must be a non-empty string.`);
      return;
    }
    if (seen.has(entry.id)) errors.push(`${where}.id '${entry.id}' is duplicated.`);
    seen.add(entry.id);
    if (!isNonEmptyString(entry.titleKey)) errors.push(`${where}.titleKey must be a non-empty string.`);
    if (!Array.isArray(entry.steps) || entry.steps.length === 0) {
      errors.push(`${where}.steps must be a non-empty list.`);
    } else {
      entry.steps.forEach((step: unknown, sIndex: number) => {
        if (!isRecord(step) || !known.has(step.ruleId as string) || !isCount(step.count)) {
          errors.push(`${where}.steps[${sIndex}] needs a known ruleId and a count >= 1.`);
        }
      });
    }
    const reward = entry.reward;
    if (
      !isRecord(reward) ||
      !TRACKS.includes(reward.track as Track) ||
      !isAmount(reward.amount) ||
      !isNonEmptyString(reward.copyKey)
    ) {
      errors.push(`${where}.reward needs a track, an amount >= 0 and a copyKey.`);
    }
    quests.push(entry as unknown as QuestDef);
  });
  return quests;
}

function validateCampaigns(raw: unknown, rules: EarnRule[] | null, errors: string[]): CampaignDef[] | null {
  if (raw === undefined) {
    errors.push('campaigns must be a list.');
    return null;
  }
  if (!Array.isArray(raw)) {
    errors.push('campaigns must be a list.');
    return null;
  }
  const known = new Set((rules ?? []).map((rule) => rule.id));
  const seen = new Set<string>();
  const campaigns: CampaignDef[] = [];
  raw.forEach((entry: unknown, index: number) => {
    if (!isRecord(entry)) {
      errors.push(`campaigns[${index}] must be an object.`);
      return;
    }
    const where = `campaigns[${index}]`;
    if (!isNonEmptyString(entry.id)) {
      errors.push(`${where}.id must be a non-empty string.`);
      return;
    }
    if (seen.has(entry.id)) errors.push(`${where}.id '${entry.id}' is duplicated.`);
    seen.add(entry.id);
    if (entry.multiplier !== 1.5 && entry.multiplier !== 2) {
      errors.push(`${where}.multiplier must be 1.5 or 2.`);
    }
    if (!Array.isArray(entry.ruleIds) || entry.ruleIds.length === 0) {
      errors.push(`${where}.ruleIds must be a non-empty list.`);
    } else {
      for (const ruleId of entry.ruleIds) {
        if (!known.has(ruleId as string)) errors.push(`${where}.ruleIds references unknown rule '${String(ruleId)}'.`);
      }
    }
    if (!isIsoDate(entry.activeFrom)) errors.push(`${where}.activeFrom must be an ISO date (YYYY-MM-DD).`);
    if (entry.activeTo !== undefined && entry.activeTo !== null && !isIsoDate(entry.activeTo)) {
      errors.push(`${where}.activeTo must be null or an ISO date (YYYY-MM-DD).`);
    }
    if (isIsoDate(entry.activeFrom) && isIsoDate(entry.activeTo as string) && entry.activeFrom > (entry.activeTo as string)) {
      errors.push(`${where}.activeFrom must not be after activeTo.`);
    }
    if (entry.audience !== undefined) {
      if (!isRecord(entry.audience) || (entry.audience.minHouseholdMembers !== undefined && !isCount(entry.audience.minHouseholdMembers))) {
        errors.push(`${where}.audience.minHouseholdMembers must be a whole number >= 1.`);
      }
    }
    campaigns.push(entry as unknown as CampaignDef);
  });
  return campaigns;
}
