// Pure client-side validation for the admin forms. Every exported function is
// synchronous and unit-tested; screens render the returned strings as-is.

import type {
  AdjustReasonCode,
} from './api-types';
import type {
  AwardOverride,
  CapPool,
  CapRule,
  CapScope,
  CapWindow,
  ClawbackRule,
  EarnRule,
  EventKind,
  RolloutMode,
  Tier,
  Track,
} from './engine-types';
import { EVENT_KINDS } from './engine-types';

export const ADJUST_REASON_CODES: readonly AdjustReasonCode[] = [
  'correction',
  'abuse',
  'support-goodwill',
];

// ---- Rollout config (C1) -------------------------------------------------------

export interface ConfigFormValue {
  mode: RolloutMode;
  livePercent: number;
  controlPercent: number;
}

const ROLLOUT_MODES: readonly RolloutMode[] = ['off', 'shadow', 'live'];

function parseWholeNumber(label: string, raw: string, min: number, max: number): { value: number | null; error: string | null } {
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    return { value: null, error: `${label} must be a whole number.` };
  }
  const value = Number(trimmed);
  if (value < min || value > max) {
    return { value: null, error: `${label} must be between ${min} and ${max}.` };
  }
  return { value, error: null };
}

export function parseConfigForm(
  mode: string,
  livePercent: string,
  controlPercent: string,
): { value: ConfigFormValue | null; errors: string[] } {
  const errors: string[] = [];
  if (!ROLLOUT_MODES.includes(mode as RolloutMode)) {
    errors.push('Mode must be off, shadow or live.');
  }
  const live = parseWholeNumber('livePercent', livePercent, 0, 100);
  if (live.error) errors.push(live.error);
  const control = parseWholeNumber('controlPercent', controlPercent, 0, 100);
  if (control.error) errors.push(control.error);
  if (live.value !== null && control.value !== null && live.value + control.value > 100) {
    errors.push('livePercent + controlPercent must be at most 100.');
  }
  if (errors.length > 0) return { value: null, errors };
  return {
    value: {
      mode: mode as RolloutMode,
      livePercent: live.value as number,
      controlPercent: control.value as number,
    },
    errors: [],
  };
}

// ---- Simulator days ------------------------------------------------------------

export function parseDays(raw: string): { value: number | null; error: string | null } {
  return parseWholeNumber('Days', raw, 1, 28);
}

// ---- Adjustments (C10) ---------------------------------------------------------

/** |amount| > 500 needs a second admin's approval (contract C10). */
export function needsSecondAdmin(amount: number): boolean {
  return Math.abs(amount) > 500;
}

export interface AdjustmentFormValue {
  amount: number;
  reasonCode: AdjustReasonCode;
  note: string;
}

export function parseAdjustmentForm(
  amount: string,
  reasonCode: string,
  note: string,
): { value: AdjustmentFormValue | null; errors: string[] } {
  const errors: string[] = [];
  const parsed = parseWholeNumber('Amount', amount, -1_000_000, 1_000_000);
  if (parsed.error) {
    errors.push(parsed.error);
  } else if (parsed.value === 0) {
    errors.push('Amount must not be zero.');
  }
  if (!ADJUST_REASON_CODES.includes(reasonCode as AdjustReasonCode)) {
    errors.push('Pick a reason code.');
  }
  if (note.trim().length === 0) {
    errors.push('A note is required.');
  }
  if (errors.length > 0) return { value: null, errors };
  return {
    value: {
      amount: parsed.value as number,
      reasonCode: reasonCode as AdjustReasonCode,
      note: note.trim(),
    },
    errors: [],
  };
}

// ---- Earn rule editor (C2 EarnRule) -------------------------------------------

export interface CapForm {
  scope: CapScope | '';
  window: CapWindow | '';
  max: string;
  pool: CapPool | '';
  target: 'instance' | 'assignee' | 'chore' | '';
}

export interface ClawbackForm {
  on: EventKind | '';
}

export interface EarnRuleForm {
  id: string;
  track: Track | '';
  status: 'active' | 'paused' | '';
  ref: 'action' | 'chore' | 'member' | 'instance' | '';
  eventKind: EventKind | '';
  where: string;
  amount: string;
  perXp: boolean;
  awardExtras: string;
  caps: CapForm[];
  clawback: ClawbackForm[];
  spendableAfterHours: string;
  celebrateMoment: 'toast' | 'badge' | 'streak' | 'level' | '';
  celebrateCopyKey: string;
  minHouseholdMembers: string;
  activeFrom: string;
  activeTo: string;
}

export function toEarnRuleForm(rule: EarnRule): EarnRuleForm {
  const extras: Record<string, unknown> = {};
  if (rule.award.overrides) extras.overrides = rule.award.overrides;
  if (rule.award.milestones) extras.milestones = rule.award.milestones;
  if (rule.award.tiers) extras.tiers = rule.award.tiers;
  return {
    id: rule.id,
    track: rule.track,
    status: rule.status,
    ref: rule.ref ?? '',
    eventKind: rule.on.kind,
    where: rule.on.where ? JSON.stringify(rule.on.where, null, 2) : '',
    amount: String(rule.award.amount),
    perXp: rule.award.perXp === true,
    awardExtras: Object.keys(extras).length > 0 ? JSON.stringify(extras, null, 2) : '',
    caps: rule.caps.map((cap) => ({
      scope: cap.scope,
      window: cap.window,
      max: String(cap.max),
      pool: cap.pool ?? '',
      target: cap.target ?? '',
    })),
    clawback: (rule.clawback ?? []).map((c) => ({ on: c.on })),
    spendableAfterHours: String(rule.spendableAfterHours),
    celebrateMoment: rule.celebrate?.moment ?? '',
    celebrateCopyKey: rule.celebrate?.copyKey ?? '',
    minHouseholdMembers:
      rule.audience?.minHouseholdMembers !== undefined
        ? String(rule.audience.minHouseholdMembers)
        : '',
    activeFrom: rule.activeFrom ?? '',
    activeTo: rule.activeTo ?? '',
  };
}

export function emptyCapForm(): CapForm {
  return { scope: 'member', window: 'day', max: '', pool: '', target: '' };
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseJsonField(label: string, raw: string): { value: unknown | null; error: string | null } {
  const trimmed = raw.trim();
  if (trimmed === '') return { value: null, error: null };
  try {
    return { value: JSON.parse(trimmed), error: null };
  } catch (e) {
    return { value: null, error: `${label}: invalid JSON — ${e instanceof Error ? e.message : String(e)}` };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Semantic checks on an assembled EarnRule; the parse step reports its own. */
export function validateEarnRule(rule: EarnRule): string[] {
  const errors: string[] = [];
  if (!/^[a-z][a-z0-9._-]*$/.test(rule.id)) {
    errors.push('id must start with a letter and use only a-z, 0-9, ".", "_" or "-".');
  }
  if (rule.track !== 'ganhos' && rule.track !== 'zelo') {
    errors.push('track must be ganhos or zelo.');
  }
  if (rule.status !== 'active' && rule.status !== 'paused') {
    errors.push('status must be active or paused.');
  }
  if (!EVENT_KINDS.includes(rule.on.kind)) {
    errors.push('event kind is not a known EventKind.');
  }
  if (!Number.isInteger(rule.award.amount) || rule.award.amount < 0) {
    errors.push('amount must be a whole number of 0 or more.');
  }
  if (!Number.isInteger(rule.spendableAfterHours) || rule.spendableAfterHours < 0) {
    errors.push('spendableAfterHours must be a whole number of 0 or more.');
  }
  if (rule.celebrate && !rule.celebrate.copyKey.trim()) {
    errors.push('celebrate needs a copyKey.');
  }
  if (
    rule.audience?.minHouseholdMembers !== undefined &&
    (!Number.isInteger(rule.audience.minHouseholdMembers) || rule.audience.minHouseholdMembers < 1)
  ) {
    errors.push('audience.minHouseholdMembers must be a whole number of 1 or more.');
  }
  if (rule.activeFrom !== undefined && !isValidIsoDate(rule.activeFrom)) {
    errors.push('activeFrom must be a valid YYYY-MM-DD date.');
  }
  if (rule.activeTo != null && !isValidIsoDate(rule.activeTo)) {
    errors.push('activeTo must be a valid YYYY-MM-DD date.');
  }
  if (
    rule.activeFrom !== undefined &&
    rule.activeTo != null &&
    rule.activeTo < rule.activeFrom
  ) {
    errors.push('activeTo must not be before activeFrom.');
  }
  return errors;
}

export function parseEarnRuleForm(
  form: EarnRuleForm,
): { value: EarnRule | null; errors: string[] } {
  const errors: string[] = [];

  if (!/^[a-z][a-z0-9._-]*$/.test(form.id.trim())) {
    errors.push('id must start with a letter and use only a-z, 0-9, ".", "_" or "-".');
  }

  const amount = parseWholeNumber('amount', form.amount, 0, 1_000_000);
  if (amount.error) errors.push(amount.error);
  const spendable = parseWholeNumber('spendableAfterHours', form.spendableAfterHours, 0, 100_000);
  if (spendable.error) errors.push(spendable.error);

  const where = parseJsonField('where', form.where);
  if (where.error) errors.push(where.error);
  else if (where.value !== null && !isRecord(where.value)) {
    errors.push('where must be a JSON object.');
  }

  const extras = parseJsonField('award extras', form.awardExtras);
  if (extras.error) errors.push(extras.error);
  else if (extras.value !== null && !isRecord(extras.value)) {
    errors.push('award extras must be a JSON object.');
  }

  const caps: CapRule[] = [];
  form.caps.forEach((cap, index) => {
    const label = `caps[${index}]`;
    if (!cap.scope || !cap.window) {
      errors.push(`${label}: scope and window are required.`);
      return;
    }
    const max = parseWholeNumber(`${label}.max`, cap.max, 0, 1_000_000);
    if (max.error) {
      errors.push(max.error);
      return;
    }
    if (cap.scope === 'member+target' && !cap.target) {
      errors.push(`${label}: a member+target cap needs a target.`);
      return;
    }
    caps.push({
      scope: cap.scope,
      window: cap.window,
      max: max.value as number,
      ...(cap.pool ? { pool: cap.pool } : {}),
      ...(cap.target ? { target: cap.target } : {}),
    });
  });

  const clawback: ClawbackRule[] = [];
  form.clawback.forEach((entry, index) => {
    if (!entry.on) {
      errors.push(`clawback[${index}]: event kind is required.`);
      return;
    }
    clawback.push({ on: entry.on, match: 'sourceRef' });
  });

  let minHouseholdMembers: number | undefined;
  if (form.minHouseholdMembers.trim() !== '') {
    const parsed = parseWholeNumber(
      'audience.minHouseholdMembers',
      form.minHouseholdMembers,
      1,
      1000,
    );
    if (parsed.error) errors.push(parsed.error);
    else minHouseholdMembers = parsed.value as number;
  }

  let awardExtras: {
    overrides?: AwardOverride[];
    milestones?: Record<string, number>;
    tiers?: Partial<Record<Tier, number>>;
  } = {};
  if (isRecord(extras.value)) {
    const raw = extras.value as Record<string, unknown>;
    if (raw.overrides !== undefined) {
      if (
        !Array.isArray(raw.overrides) ||
        !raw.overrides.every((o) => {
          if (!isRecord(o) || !isRecord(o.where)) return false;
          const amount = (o as { amount: unknown }).amount;
          return Number.isInteger(amount) && (amount as number) >= 0;
        })
      ) {
        errors.push('award extras: overrides must be [{ where: {}, amount: number }].');
      } else {
        awardExtras.overrides = raw.overrides as AwardOverride[];
      }
    }
    if (raw.milestones !== undefined) {
      if (
        !isRecord(raw.milestones) ||
        !Object.values(raw.milestones).every((v) => Number.isInteger(v) && (v as number) >= 0)
      ) {
        errors.push('award extras: milestones must map milestone keys to non-negative numbers.');
      } else {
        awardExtras.milestones = raw.milestones as Record<string, number>;
      }
    }
    if (raw.tiers !== undefined) {
      if (
        !isRecord(raw.tiers) ||
        !Object.entries(raw.tiers).every(
          ([key, v]) =>
            (key === 'bronze' || key === 'silver' || key === 'gold') &&
            Number.isInteger(v) &&
            (v as number) >= 0,
        )
      ) {
        errors.push('award extras: tiers must map bronze/silver/gold to non-negative numbers.');
      } else {
        awardExtras.tiers = raw.tiers as Partial<Record<Tier, number>>;
      }
    }
  }

  if (
    !form.track ||
    !form.status ||
    !form.eventKind ||
    (form.celebrateMoment !== '' && !form.celebrateCopyKey.trim())
  ) {
    if (!form.track) errors.push('track is required.');
    if (!form.status) errors.push('status is required.');
    if (!form.eventKind) errors.push('event kind is required.');
    if (form.celebrateMoment !== '' && !form.celebrateCopyKey.trim()) {
      errors.push('celebrate needs a copyKey.');
    }
    return { value: null, errors };
  }

  if (errors.length > 0) return { value: null, errors };

  const rule: EarnRule = {
    id: form.id.trim(),
    track: form.track,
    status: form.status,
    on: {
      kind: form.eventKind,
      ...(where.value !== null && isRecord(where.value)
        ? { where: where.value as Record<string, unknown> }
        : {}),
    },
    award: {
      amount: amount.value as number,
      ...(form.perXp ? { perXp: true } : {}),
      ...(awardExtras.overrides !== undefined ? { overrides: awardExtras.overrides } : {}),
      ...(awardExtras.milestones !== undefined ? { milestones: awardExtras.milestones } : {}),
      ...(awardExtras.tiers !== undefined ? { tiers: awardExtras.tiers } : {}),
    },
    caps,
    ...(clawback.length > 0 ? { clawback } : {}),
    spendableAfterHours: spendable.value as number,
    ...(form.celebrateMoment !== ''
      ? {
          celebrate: {
            moment: form.celebrateMoment,
            copyKey: form.celebrateCopyKey.trim(),
          },
        }
      : {}),
    ...(minHouseholdMembers !== undefined
      ? { audience: { minHouseholdMembers } }
      : {}),
    ...(form.ref ? { ref: form.ref } : {}),
    ...(form.activeFrom ? { activeFrom: form.activeFrom } : {}),
    ...(form.activeTo ? { activeTo: form.activeTo } : {}),
  };

  const semanticErrors = validateEarnRule(rule);
  if (semanticErrors.length > 0) return { value: null, errors: semanticErrors };
  return { value: rule, errors: [] };
}
