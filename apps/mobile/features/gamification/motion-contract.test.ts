import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

// Source-level guards for the Ganhos & Zelo UI (docs/design-system/motion-and-haptics.md).

const MOBILE_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function sources(directory: string): string[] {
  return readdirSync(resolve(MOBILE_ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });
}

const FILES = [
  ...sources('features/gamification'),
  ...sources('components/housegains/gamification'),
];

/** The text of each `withTiming(...)` / `withSpring(...)` call up to its balanced closing parenthesis. */
function calls(source: string, name: string): string[] {
  const found: string[] = [];
  let from = source.indexOf(`${name}(`);
  while (from !== -1) {
    let depth = 0;
    let end = from + name.length;
    for (; end < source.length; end += 1) {
      if (source[end] === '(') depth += 1;
      if (source[end] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    found.push(source.slice(from, end + 1));
    from = source.indexOf(`${name}(`, end);
  }
  return found;
}

test('every withTiming and withSpring passes reduceMotion: ReduceMotion.System', () => {
  let checked = 0;
  for (const file of FILES) {
    const source = readFileSync(resolve(MOBILE_ROOT, file), 'utf8');
    for (const name of ['withTiming', 'withSpring']) {
      for (const call of calls(source, name)) {
        // an import list or a type position is not a call
        if (/^\w+\(\)?$/.test(call)) continue;
        checked += 1;
        assert.match(call, /reduceMotion:\s*ReduceMotion\.System/, `${file}: ${call.slice(0, 80)}`);
      }
    }
  }
  assert.ok(checked >= 3, 'the scan found the animation helpers');
});

test('animated components read the system reduced-motion setting', () => {
  for (const file of FILES.filter((path) => path.endsWith('.tsx'))) {
    const source = readFileSync(resolve(MOBILE_ROOT, file), 'utf8');
    if (!/useAnimatedStyle|useAnimatedProps|useSharedValue/.test(source)) continue;
    assert.match(
      source,
      /useMotionReduced|useReducedMotion|useCountUp|reduceMotion|timed\(|springed\(/,
      file,
    );
  }
});

test('no haptics in the gamification UI', () => {
  for (const file of FILES) {
    const source = readFileSync(resolve(MOBILE_ROOT, file), 'utf8');
    assert.doesNotMatch(source, /expo-haptics|Haptics\./, file);
  }
});
