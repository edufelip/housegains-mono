import { describe, expect, it } from 'vitest';
import { DomainError } from './errors';
import type { Completion } from './instances';
import {
  assertNoConflict,
  assertWithinDisputeWindow,
  DISPUTE_WINDOW_MS,
  hasAdminRights,
  moderateTargets,
  pickAdminSuccessor,
  reportTargets,
  resolveTargets,
} from './moderation';
import { completionReviewedBody, reportReviewBody } from './people';

// Part A rules (gamification-moderation-contract.md). Pure functions; every rule in A1–A3.

const NOW = new Date('2026-06-15T12:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

function completion(subtaskId: string, memberId: string, completedAt: Date): Completion {
  return { id: `${subtaskId}-${memberId}`, instanceId: 'i1', subtaskId, memberId, xp: 10, completedAt, isAssist: false };
}

function expectCode(code: string, run: () => unknown) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    return;
  }
  expect.unreachable(`expected ${code}`);
}

describe('roles (A1)', () => {
  it('grants admin rights to creator and admin only', () => {
    expect(hasAdminRights('creator')).toBe(true);
    expect(hasAdminRights('admin')).toBe(true);
    expect(hasAdminRights('member')).toBe(false);
    expect(hasAdminRights(undefined)).toBe(false);
  });

  it('picks the longest-standing remaining admin, else the longest-standing member', () => {
    const early = { uid: 'early', role: 'member' as const, joinedAt: new Date('2026-01-01T00:00:00Z') };
    const lateAdmin = { uid: 'late-admin', role: 'admin' as const, joinedAt: new Date('2026-03-01T00:00:00Z') };
    expect(pickAdminSuccessor([early, lateAdmin])).toBe('late-admin');
    const firstAdmin = { uid: 'first-admin', role: 'admin' as const, joinedAt: new Date('2026-02-01T00:00:00Z') };
    expect(pickAdminSuccessor([lateAdmin, firstAdmin, early])).toBe('first-admin');
    expect(pickAdminSuccessor([early])).toBe('early');
    expect(pickAdminSuccessor([])).toBeNull();
  });

  it('breaks succession ties by uid', () => {
    const sameDay = new Date('2026-01-01T00:00:00Z');
    expect(
      pickAdminSuccessor([
        { uid: 'b', role: 'admin', joinedAt: sameDay },
        { uid: 'a', role: 'member', joinedAt: sameDay },
      ]),
    ).toBe('b');
  });
});

describe('report target selection (A2)', () => {
  const completions = [
    completion('wash', 'A', minutesAgo(10)),
    completion('wipe', 'B', minutesAgo(20)),
  ];

  it('defaults to every completed subtask the caller did not complete', () => {
    expect(reportTargets(completions, 'A', undefined, NOW)).toEqual(['wipe']);
    expect(reportTargets(completions, 'C', undefined, NOW)).toEqual(['wash', 'wipe']);
  });

  it('fails when the caller completed everything themselves', () => {
    const ownOnly = [completion('wash', 'A', minutesAgo(10)), completion('wipe', 'A', minutesAgo(5))];
    expectCode('failed-precondition', () => reportTargets(ownOnly, 'A', undefined, NOW));
  });

  it('validates an explicit list: unknown or own completions are rejected', () => {
    expect(reportTargets(completions, 'C', ['wash'], NOW)).toEqual(['wash']);
    expectCode('failed-precondition', () => reportTargets(completions, 'C', ['trash'], NOW));
    expectCode('invalid-argument', () => reportTargets(completions, 'A', ['wash'], NOW));
    expectCode('invalid-argument', () => reportTargets(completions, 'C', 'wash', NOW));
    expectCode('failed-precondition', () => reportTargets(completions, 'C', [], NOW));
  });

  it('rejects completions older than the 72-hour dispute window', () => {
    const stale = [completion('wash', 'B', minutesAgo(72 * 60 + 1))];
    expectCode('failed-precondition', () => reportTargets(stale, 'A', undefined, NOW));
    const fresh = [completion('wipe', 'B', minutesAgo(72 * 60))];
    expect(reportTargets(fresh, 'A', undefined, NOW)).toEqual(['wipe']);
  });

  it('uses a 72-hour window constant', () => {
    expect(DISPUTE_WINDOW_MS).toBe(72 * 60 * 60 * 1000);
  });
});

describe('resolve target selection (A2)', () => {
  const dispute = { subtaskIds: ['wash', 'wipe'] };

  it('revokes nothing for done, everything for not_done', () => {
    expect(resolveTargets(dispute, 'done', undefined)).toEqual([]);
    expect(resolveTargets(dispute, 'not_done', undefined)).toEqual(['wash', 'wipe']);
  });

  it('partial takes a strict subset of the disputed subtasks', () => {
    expect(resolveTargets(dispute, 'partial', ['wipe'])).toEqual(['wipe']);
    expectCode('invalid-argument', () => resolveTargets(dispute, 'partial', ['wash', 'wipe']));
    expectCode('invalid-argument', () => resolveTargets(dispute, 'partial', ['trash']));
    expectCode('invalid-argument', () => resolveTargets(dispute, 'partial', []));
    expectCode('invalid-argument', () => resolveTargets(dispute, 'partial', undefined));
  });

  it('partial is impossible when a single subtask is disputed', () => {
    expectCode('invalid-argument', () => resolveTargets({ subtaskIds: ['wash'] }, 'partial', ['wash']));
  });
});

describe('moderate target selection (A2)', () => {
  const completions = [completion('wash', 'A', NOW), completion('wipe', 'B', NOW)];

  it('not_done targets every completed subtask by default, or the given list', () => {
    expect(moderateTargets(completions, 'not_done', undefined)).toEqual(['wash', 'wipe']);
    expect(moderateTargets(completions, 'not_done', ['wash'])).toEqual(['wash']);
    expectCode('failed-precondition', () => moderateTargets([], 'not_done', undefined));
    expectCode('invalid-argument', () => moderateTargets(completions, 'not_done', ['trash']));
  });

  it('partial requires a strict subset of the completed subtasks', () => {
    expect(moderateTargets(completions, 'partial', ['wipe'])).toEqual(['wipe']);
    expectCode('invalid-argument', () => moderateTargets(completions, 'partial', ['wash', 'wipe']));
    expectCode('invalid-argument', () => moderateTargets(completions, 'partial', []));
    expectCode('invalid-argument', () => moderateTargets([completions[0]!], 'partial', ['wash']));
  });
});

describe('conflict of interest (A2)', () => {
  it('blocks an admin judging their own completion unless they are the only admin', () => {
    const completions = [completion('wash', 'A', NOW)];
    expectCode('permission-denied', () => assertNoConflict(completions, ['wash'], 'A', false));
    expect(() => assertNoConflict(completions, ['wash'], 'A', true)).not.toThrow();
    expect(() => assertNoConflict(completions, ['wash'], 'B', false)).not.toThrow();
    expect(() => assertNoConflict(completions, ['wipe'], 'A', false)).not.toThrow();
  });
});

describe('dispute window guard', () => {
  it('passes fresh completions and rejects stale ones', () => {
    const fresh = [completion('wash', 'B', minutesAgo(10))];
    const stale = [completion('wipe', 'B', minutesAgo(72 * 60 + 1))];
    expect(() => assertWithinDisputeWindow([...fresh, ...stale], ['wash'], NOW)).not.toThrow();
    expectCode('failed-precondition', () => assertWithinDisputeWindow([...fresh, ...stale], ['wipe'], NOW));
    expect(() => assertWithinDisputeWindow([], ['wash'], NOW)).not.toThrow();
  });
});

describe('moderation copy', () => {
  it('has report and review copy in all six locales with en-US fallback', () => {
    for (const locale of ['en-US', 'pt-BR', 'es-ES', 'fr-FR', 'de-DE', 'it-IT']) {
      expect(reportReviewBody(locale, 'Sam', 'Kitchen reset')).toContain('Sam');
      expect(reportReviewBody(locale, 'Sam', 'Kitchen reset')).toContain('Kitchen reset');
      expect(completionReviewedBody(locale).length).toBeGreaterThan(0);
    }
    expect(reportReviewBody('ja-JP', 'Sam', 'Kitchen reset')).toBe("Sam says Kitchen reset wasn't done. Review it.");
    expect(reportReviewBody('en-US', 'Sam', 'Kitchen reset')).toContain("wasn't done");
    expect(completionReviewedBody('ja-JP')).toBe('An admin reviewed your chore.');
  });
});
