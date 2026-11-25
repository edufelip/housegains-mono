// Structural JSON diff for rule sets: lists added / removed / changed paths.
// shortcut: arrays are compared index-wise, so a reordering shows as changes;
// fine for hand-edited rule JSON, upgrade to keyed diff if rules get long.

export type DiffEntryType = 'added' | 'removed' | 'changed';

export interface DiffEntry {
  path: string;
  type: DiffEntryType;
  before?: unknown;
  after?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function joinKey(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

function joinIndex(path: string, index: number): string {
  return `${path}[${index}]`;
}

export function structuralDiff(before: unknown, after: unknown, path = ''): DiffEntry[] {
  if (before === after) return [];

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
    return keys.flatMap((key) =>
      structuralDiff(before[key], after[key], joinKey(path, key)),
    );
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const entries: DiffEntry[] = [];
    const length = Math.max(before.length, after.length);
    for (let i = 0; i < length; i++) {
      const child = joinIndex(path, i);
      if (i >= before.length) {
        entries.push({ path: child, type: 'added', after: after[i] });
      } else if (i >= after.length) {
        entries.push({ path: child, type: 'removed', before: before[i] });
      } else {
        entries.push(...structuralDiff(before[i], after[i], child));
      }
    }
    return entries;
  }

  if (before === undefined) return [{ path, type: 'added', after }];
  if (after === undefined) return [{ path, type: 'removed', before }];
  return [{ path, type: 'changed', before, after }];
}

export function formatDiffValue(value: unknown): string {
  return JSON.stringify(value) ?? 'undefined';
}
