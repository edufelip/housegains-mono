import { describe, expect, it } from 'vitest';
import { formatDiffValue, structuralDiff } from './diff';

describe('structuralDiff', () => {
  it('returns nothing for equal values', () => {
    expect(structuralDiff({ a: 1 }, { a: 1 })).toEqual([]);
    expect(structuralDiff('x', 'x')).toEqual([]);
  });

  it('reports a changed primitive with its path', () => {
    const entries = structuralDiff({ amount: 2 }, { amount: 3 });
    expect(entries).toEqual([{ path: 'amount', type: 'changed', before: 2, after: 3 }]);
  });

  it('reports added and removed keys with dot paths', () => {
    const added = structuralDiff({ a: 1 }, { a: 1, b: 2 });
    expect(added).toEqual([{ path: 'b', type: 'added', after: 2 }]);

    const removed = structuralDiff({ a: 1, b: 2 }, { a: 1 });
    expect(removed).toEqual([{ path: 'b', type: 'removed', before: 2 }]);
  });

  it('builds nested dot paths through objects and index paths through arrays', () => {
    const entries = structuralDiff(
      { earnRules: [{ id: 'a', award: { amount: 1 } }] },
      { earnRules: [{ id: 'a', award: { amount: 5 } }] },
    );
    expect(entries).toEqual([
      { path: 'earnRules[0].award.amount', type: 'changed', before: 1, after: 5 },
    ]);
  });

  it('reports extra array entries as added and missing ones as removed', () => {
    const added = structuralDiff([1], [1, 2]);
    expect(added).toEqual([{ path: '[1]', type: 'added', after: 2 }]);

    const removed = structuralDiff([1, 2], [1]);
    expect(removed).toEqual([{ path: '[1]', type: 'removed', before: 2 }]);
  });

  it('keeps a caller-provided path prefix', () => {
    const entries = structuralDiff({ a: 1 }, { a: 2 }, 'rules');
    expect(entries[0]?.path).toBe('rules.a');
  });

  it('diffs a real-ish rule set change into one row', () => {
    const before = {
      schemaVersion: 1,
      earnRules: [{ id: 'earn.share', award: { amount: 2 }, caps: [{ max: 1 }] }],
    };
    const after = {
      schemaVersion: 1,
      earnRules: [{ id: 'earn.share', award: { amount: 3 }, caps: [{ max: 1 }] }],
    };
    const entries = structuralDiff(before, after);
    expect(entries).toEqual([
      { path: 'earnRules[0].award.amount', type: 'changed', before: 2, after: 3 },
    ]);
  });
});

describe('formatDiffValue', () => {
  it('renders JSON for objects and plain text for primitives', () => {
    expect(formatDiffValue(2)).toBe('2');
    expect(formatDiffValue('gami.earn.chore')).toBe('"gami.earn.chore"');
    expect(formatDiffValue({ a: 1 })).toBe('{"a":1}');
    expect(formatDiffValue(undefined)).toBe('undefined');
  });
});
