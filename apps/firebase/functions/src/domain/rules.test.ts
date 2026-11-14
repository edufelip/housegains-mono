import { describe, expect, it } from 'vitest';
import { DomainError } from './errors';
import { colorFor, initialsFor, pickSuccessor, reminderBody, resolveLocale } from './people';
import {
  createInviteCode,
  INVITE_ALPHABET,
  inviteProblem,
  isValidInviteCode,
  normalizeInviteCode,
} from './invites';
import {
  parseAssigneeIds,
  parseChoreFields,
  parseHouseholdCreate,
  parseProfileInput,
} from './validate';

const members = ['A', 'B'];
const goodChore = {
  name: 'Kitchen reset',
  icon: 'sparkle',
  category: 'kitchen',
  subtasks: [
    { id: 'wash', name: 'Wash', xp: 10, position: 1 },
    { id: 'wipe', name: 'Wipe', xp: 15, position: 0 },
  ],
  bonusXp: 5,
  assigneeIds: ['A', 'A', 'B'],
  recurrence: 'daily',
  dueTime: '08:00',
};

describe('invite codes', () => {
  it('generates six characters from the unambiguous alphabet', () => {
    let calls = 0;
    const code = createInviteCode(() => (calls += 1) % INVITE_ALPHABET.length);
    expect(code).toHaveLength(6);
    expect(isValidInviteCode(code)).toBe(true);
    expect(isValidInviteCode('A2B3C4')).toBe(true);
    expect(isValidInviteCode('A0B1C4')).toBe(false); // 0 and 1 are excluded
    expect(isValidInviteCode('AIB3C4')).toBe(false); // I is excluded
    expect(normalizeInviteCode('  a2b3c4 ')).toBe('A2B3C4');
  });

  it('reports revoked, expired, and full invites in that order', () => {
    const now = new Date('2026-01-05T00:00:00.000Z');
    const live = { revoked: false, expiresAt: new Date('2026-01-06T00:00:00.000Z'), uses: 0, maxUses: 8 };
    expect(inviteProblem(live, now)).toBeNull();
    expect(inviteProblem({ ...live, revoked: true }, now)).toBe('revoked');
    expect(inviteProblem({ ...live, expiresAt: new Date('2026-01-04T00:00:00.000Z') }, now)).toBe('expired');
    expect(inviteProblem({ ...live, uses: 8 }, now)).toBe('full');
  });
});

describe('validation guards', () => {
  it('accepts a valid chore and normalizes it', () => {
    const chore = parseChoreFields(goodChore, members);
    expect(chore.subtasks.map((s) => s.id)).toEqual(['wipe', 'wash']); // sorted by position
    expect(chore.assigneeIds).toEqual(['A', 'B']); // deduped
    expect(chore.isActive).toBe(true);
  });

  it('rejects out-of-range and malformed chore input', () => {
    const bad = (patch: Record<string, unknown>) => () => parseChoreFields({ ...goodChore, ...patch }, members);
    expect(bad({ bonusXp: 201 })).toThrow(DomainError);
    expect(bad({ subtasks: [] })).toThrow(DomainError);
    expect(bad({ subtasks: Array.from({ length: 13 }, (_, i) => ({ id: `s${i}`, name: 'x', xp: 1, position: i })) })).toThrow(
      DomainError,
    );
    expect(bad({ subtasks: [{ id: 'wash', name: 'Wash', xp: 0, position: 0 }] })).toThrow(DomainError);
    expect(bad({ subtasks: [{ id: 'wash', name: 'a', xp: 1, position: 0 }, { id: 'wash', name: 'b', xp: 1, position: 1 }] })).toThrow(
      /unique/,
    );
    expect(bad({ assigneeIds: ['C'] })).toThrow(/household members/);
    expect(bad({ dueTime: '8:00' })).toThrow(DomainError);
    expect(bad({ recurrence: 'monthly' })).toThrow(DomainError);
  });

  it('checks assignees against the household member list', () => {
    expect(parseAssigneeIds(['A', 'A'], members)).toEqual(['A']);
    expect(() => parseAssigneeIds('A', members)).toThrow(DomainError);
  });

  it('validates household and profile input', () => {
    expect(parseHouseholdCreate({ name: ' Apto ', icon: 'house', color: '#76ff03', timeZone: 'UTC' }).name).toBe('Apto');
    expect(() => parseHouseholdCreate({ name: 'x', icon: 'h', color: 'red', timeZone: 'UTC' })).toThrow(DomainError);
    expect(() => parseHouseholdCreate({ name: 'x', icon: 'h', color: '#76ff03', timeZone: 'Mars/Base' })).toThrow(DomainError);
    expect(() => parseProfileInput({ displayName: 'Eduardo', locale: 'ja-JP', themeId: 'arcade' })).toThrow(DomainError);
    expect(() => parseProfileInput({ displayName: '', locale: 'en-US', themeId: 'arcade' })).toThrow(DomainError);
  });
});

describe('people helpers', () => {
  it('derives up to three initials and a stable color per uid', () => {
    expect(initialsFor('Eduardo Felipe')).toBe('EF');
    expect(initialsFor('ana maria da silva')).toBe('AMD');
    expect(initialsFor('   ')).toBe('?');
    expect(colorFor('uid-1')).toBe(colorFor('uid-1'));
  });

  it('picks the longest-standing remaining member as successor', () => {
    const successor = pickSuccessor([
      { uid: 'late', joinedAt: new Date('2026-03-01T00:00:00Z') },
      { uid: 'early', joinedAt: new Date('2026-01-01T00:00:00Z') },
    ]);
    expect(successor).toBe('early');
    expect(pickSuccessor([])).toBeNull();
  });

  it('has reminder copy in all six locales and falls back to en-US', () => {
    for (const locale of ['en-US', 'pt-BR', 'es-ES', 'fr-FR', 'de-DE', 'it-IT']) {
      const body = reminderBody(locale, 'Lavar louça', '08:00');
      expect(body).toContain('Lavar louça');
      expect(body).toContain('08:00');
    }
    expect(reminderBody('en-US', 'Trash', '8:00 AM')).toBe('Your turn: Trash is due at 8:00 AM');
    expect(resolveLocale('ja-JP')).toBe('en-US');
  });
});
