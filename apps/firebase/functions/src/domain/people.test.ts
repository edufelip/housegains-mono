import { describe, expect, it } from 'vitest';
import {
  weekShameBody,
  weekShameTitle,
  weekTopBody,
  weekTopTitle,
} from './people';

// Weekly standings push copy (contract Part B): six locales, en and pt-BR names fixed
// by the contract, natural copy for the rest.

const ALL_LOCALES = ['en-US', 'pt-BR', 'es-ES', 'fr-FR', 'de-DE', 'it-IT'] as const;

describe('weekly standings copy', () => {
  it('gives every locale its own title and body', () => {
    expect(new Set(ALL_LOCALES.map((locale) => weekTopTitle(locale))).size).toBe(ALL_LOCALES.length);
    expect(new Set(ALL_LOCALES.map((locale) => weekShameTitle(locale))).size).toBe(ALL_LOCALES.length);
    expect(new Set(ALL_LOCALES.map((locale) => weekTopBody(locale, 'Sam', 40))).size).toBe(ALL_LOCALES.length);
    expect(new Set(ALL_LOCALES.map((locale) => weekShameBody(locale, 'Sam', 3))).size).toBe(ALL_LOCALES.length);
  });

  it('uses the contract names for en-US and pt-BR', () => {
    expect(weekTopTitle('en-US')).toBe('Top member of the week');
    expect(weekShameTitle('en-US')).toBe('Wall of shame');
    expect(weekTopTitle('pt-BR')).toBe('Destaque da semana');
    expect(weekShameTitle('pt-BR')).toBe('Mural da vergonha');
  });

  it('interpolates the member name, xp and missed count', () => {
    expect(weekTopBody('en-US', 'Sam', 40)).toBe('Sam earned 40 XP this week.');
    expect(weekTopBody('pt-BR', 'Sam', 40)).toBe('Sam ganhou 40 XP nesta semana.');
    expect(weekShameBody('en-US', 'Sam', 3)).toBe('Sam missed 3 of their chores this week.');
    expect(weekShameBody('pt-BR', 'Sam', 3)).toBe('Sam deixou 3 tarefa(s) para trás nesta semana.');
  });

  it('falls back to en-US for unknown locales', () => {
    expect(weekTopTitle('ja-JP')).toBe(weekTopTitle('en-US'));
    expect(weekTopBody(undefined, 'Sam', 40)).toBe('Sam earned 40 XP this week.');
    expect(weekShameTitle(null)).toBe('Wall of shame');
    expect(weekShameBody(7, 'Sam', 3)).toBe('Sam missed 3 of their chores this week.');
  });
});
