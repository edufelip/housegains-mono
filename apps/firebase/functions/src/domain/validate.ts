import { DomainError } from './errors';
import type { ChoreFields, SubtaskDef } from './instances';
import { parseRecurrence } from './recurrence';
import { assertDueTime, assertTimeZone } from './time';

// Hand-written guards. Every callable input goes through these before any write.

export const SUPPORTED_LOCALES = ['en-US', 'pt-BR', 'es-ES', 'fr-FR', 'de-DE', 'it-IT'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const SUPPORTED_THEMES = ['arcade', 'sticker', 'soft'] as const;

const MAX_SUBTASKS = 12;
const MAX_SUBTASK_XP = 100;
const MAX_BONUS_XP = 200;
const MAX_ASSIGNEES = 12;

function invalid(message: string): never {
  throw new DomainError('invalid-argument', message);
}

export function asObject(value: unknown, name = 'input'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(`${name} must be an object.`);
  return value as Record<string, unknown>;
}

export function requireString(value: unknown, name: string, min: number, max: number): string {
  if (typeof value !== 'string') invalid(`${name} must be a string.`);
  const trimmed = (value as string).trim();
  if (trimmed.length < min || trimmed.length > max) invalid(`${name} must be ${min}..${max} characters.`);
  return trimmed;
}

export function requireInt(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    invalid(`${name} must be a whole number from ${min} to ${max}.`);
  }
  return value as number;
}

export function requireBool(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') invalid(`${name} must be true or false.`);
  return value as boolean;
}

export function requireOneOf<T extends string>(value: unknown, name: string, options: readonly T[]): T {
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value)) {
    invalid(`${name} must be one of ${options.join(', ')}.`);
  }
  return value as T;
}

export function requireId(value: unknown, name: string): string {
  return requireString(value, name, 1, 128);
}

export function parseHouseholdCreate(raw: unknown) {
  const input = asObject(raw);
  const color = requireString(input.color, 'color', 7, 7);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) invalid('color must be a #rrggbb hex value.');
  return {
    name: requireString(input.name, 'name', 1, 40),
    icon: requireString(input.icon, 'icon', 1, 16),
    color,
    timeZone: assertTimeZone(input.timeZone),
  };
}

export function parseHouseholdUpdate(raw: unknown) {
  const input = asObject(raw);
  const color = requireString(input.color, 'color', 7, 7);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) invalid('color must be a #rrggbb hex value.');
  const update: { name: string; icon: string; color: string; weeklyGoalXp?: number | null } = {
    name: requireString(input.name, 'name', 1, 40),
    icon: requireString(input.icon, 'icon', 1, 16),
    color,
  };
  if (input.weeklyGoalXp !== undefined) {
    update.weeklyGoalXp = input.weeklyGoalXp === null ? null : requireInt(input.weeklyGoalXp, 'weeklyGoalXp', 1, 100_000);
  }
  return update;
}

export function parseProfileInput(raw: unknown) {
  const input = asObject(raw);
  return {
    displayName: requireString(input.displayName, 'displayName', 1, 40),
    locale: requireOneOf(input.locale, 'locale', SUPPORTED_LOCALES),
    themeId: requireOneOf(input.themeId, 'themeId', SUPPORTED_THEMES),
  };
}

/** Assignees are unique household member ids, at most 12. Duplicates collapse. */
export function parseAssigneeIds(raw: unknown, memberIds: string[]): string[] {
  if (!Array.isArray(raw)) invalid('assigneeIds must be a list.');
  const assigneeIds = [...new Set(raw.map((id: unknown) => requireId(id, 'assignee')))];
  if (assigneeIds.length > MAX_ASSIGNEES) invalid('Too many assignees.');
  const members = new Set(memberIds);
  if (assigneeIds.some((id) => !members.has(id))) invalid('Assignees must be household members.');
  return assigneeIds;
}

/**
 * Validates a chore definition. `memberIds` is the household's member list;
 * assignees must be a subset of it.
 */
export function parseChoreFields(raw: unknown, memberIds: string[]): ChoreFields & { id?: string } {
  const input = asObject(raw, 'chore');
  if (!Array.isArray(input.subtasks) || input.subtasks.length < 1 || input.subtasks.length > MAX_SUBTASKS) {
    invalid(`A chore needs between 1 and ${MAX_SUBTASKS} subtasks.`);
  }
  const seen = new Set<string>();
  const subtasks: SubtaskDef[] = input.subtasks.map((entry: unknown) => {
    const subtask = asObject(entry, 'subtask');
    const id = requireString(subtask.id, 'subtask id', 1, 64);
    if (seen.has(id)) invalid('Subtask ids must be unique.');
    seen.add(id);
    return {
      id,
      name: requireString(subtask.name, 'subtask name', 1, 60),
      xp: requireInt(subtask.xp, 'subtask xp', 1, MAX_SUBTASK_XP),
      position: requireInt(subtask.position, 'subtask position', 0, 99),
      ...(typeof subtask.catalogSubtaskId === 'string' && subtask.catalogSubtaskId
        ? { catalogSubtaskId: subtask.catalogSubtaskId }
        : {}),
    };
  });
  subtasks.sort((a, b) => a.position - b.position);

  const assigneeIds = parseAssigneeIds(input.assigneeIds, memberIds);

  const recurrence = requireString(input.recurrence, 'recurrence', 1, 200);
  parseRecurrence(recurrence, '1970-01-01'); // throws on bad syntax; anchor only resolves bare "weekly"

  const chore: ChoreFields & { id?: string } = {
    name: requireString(input.name, 'name', 1, 60),
    icon: requireString(input.icon, 'icon', 1, 16),
    category: typeof input.category === 'string' ? input.category.trim().slice(0, 40) : '',
    subtasks,
    bonusXp: requireInt(input.bonusXp, 'bonusXp', 0, MAX_BONUS_XP),
    assigneeIds,
    recurrence,
    dueTime: assertDueTime(input.dueTime),
    isActive: input.isActive === undefined ? true : requireBool(input.isActive, 'isActive'),
  };
  if (typeof input.catalogId === 'string' && input.catalogId) chore.catalogId = input.catalogId;
  if (typeof input.id === 'string' && input.id) chore.id = input.id;
  return chore;
}
