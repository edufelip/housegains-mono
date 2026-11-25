import { describe, expect, it } from 'vitest';
import { structuralDiff } from './diff';
import { sampleRulesV1, sampleRulesV2 } from './test/api-mock';

// Guards the copy in engine-types.ts against the real engine types: every
// exported type name below must still exist in the functions source file, and
// the EventKind union must match character-for-character (it drives the form's
// event-kind options).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(
  here,
  '../../firebase/functions/src/domain/gamification/types.ts',
);
const copyPath = resolve(here, './engine-types.ts');

const source = readFileSync(sourcePath, 'utf8');
const copy = readFileSync(copyPath, 'utf8');

const copiedNames = [...copy.matchAll(/export (?:type|interface) (\w+)/g)].map((m) => m[1]);

describe('engine-types stays in sync with the functions source', () => {
  it('copies a non-empty set of exported types', () => {
    expect(copiedNames.length).toBeGreaterThan(10);
  });

  it.each(copiedNames)('exported name %s still exists in the source file', (name) => {
    expect(source).toMatch(new RegExp(`export (?:type|interface) ${name}\\b`));
  });

  it('keeps the EventKind union identical to the source', () => {
    const extract = (text: string): string => {
      const match = text.match(/export type EventKind =([^;]+);/);
      if (!match) throw new Error('EventKind union not found');
      return match[1]
        .split('|')
        .map((part) => part.trim())
        .filter(Boolean)
        .join('|');
    };
    expect(extract(copy)).toBe(extract(source));
  });

  it('renders a real published/draft rule pair as a diff (sanity)', () => {
    const entries = structuralDiff(sampleRulesV1(), sampleRulesV2());
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.path === 'earnRules[1].award.amount')).toBe(true);
  });
});
