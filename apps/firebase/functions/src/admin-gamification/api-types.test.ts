import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The callables implement apps/admin/src/api-types.ts; functions cannot import across packages
// (rootDir), so api-types.ts here is a copy. This fails when they drift.

const IMPORT_ADMIN = "import type { RuleSet, Track } from './engine-types';";
const IMPORT_COPY = "import type { RuleSet, Track } from '../domain/gamification';";
const HEADER_END = '\n\n';

describe('admin api-types copy', () => {
  it('matches apps/admin/src/api-types.ts apart from the engine import and the header', () => {
    const admin = readFileSync(join(__dirname, '../../../../admin/src/api-types.ts'), 'utf8');
    const copy = readFileSync(join(__dirname, 'api-types.ts'), 'utf8');
    expect(admin).toContain(IMPORT_ADMIN);
    const body = copy.slice(copy.indexOf(HEADER_END, copy.indexOf('api-types.test.ts')) + HEADER_END.length);
    expect(body).toBe(admin.replace(IMPORT_ADMIN, IMPORT_COPY));
  });
});
