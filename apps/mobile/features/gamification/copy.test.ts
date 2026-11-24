import assert from 'node:assert/strict';
import test from 'node:test';
import { SUPPORTED_LOCALES } from '@/localization/core';
import { HOUSEGAINS_DICTIONARIES } from '@/localization/housegains/catalog';

// Ganhos and Zelo are never called XP or points (contract Part C). The level progress line is the one
// place that names XP, because the member level is still driven by XP.
const XP_ALLOWED = new Set(['housegains.gamification.wallet.levelProgress']);
const FORBIDDEN = /\bXP\b|\bpoints?\b|\bpontos?\b|\bpuntos?\b|\bpunkte?\b|\bpunti\b|\bpunto\b/i;

test('gamification copy never calls Ganhos or Zelo XP or points, in any locale', () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const [key, value] of Object.entries(HOUSEGAINS_DICTIONARIES[locale])) {
      if (!key.startsWith('housegains.gamification.') || XP_ALLOWED.has(key)) continue;
      assert.doesNotMatch(value, FORBIDDEN, `${locale} ${key}: ${value}`);
    }
  }
});

test('the track names are the agreed ones', () => {
  assert.equal(HOUSEGAINS_DICTIONARIES['pt-BR']['housegains.gamification.ganhos.name'], 'Ganhos');
  assert.equal(HOUSEGAINS_DICTIONARIES['en-US']['housegains.gamification.zelo.name'], 'Care');
  assert.equal(HOUSEGAINS_DICTIONARIES['es-ES']['housegains.gamification.zelo.name'], 'Esmero');
  assert.equal(HOUSEGAINS_DICTIONARIES['fr-FR']['housegains.gamification.zelo.name'], 'Soin');
  assert.equal(HOUSEGAINS_DICTIONARIES['de-DE']['housegains.gamification.zelo.name'], 'Fürsorge');
  assert.equal(HOUSEGAINS_DICTIONARIES['it-IT']['housegains.gamification.zelo.name'], 'Cura');
});

test('the Portuguese catalog uses the product names and the required streak copy', () => {
  const pt = HOUSEGAINS_DICTIONARIES['pt-BR'];
  assert.equal(pt['housegains.gamification.streak.countOther'], '{count} semanas seguidas');
  assert.equal(
    pt['housegains.gamification.streak.brokenOther'],
    'Sua sequência descansou. Recorde: {count} semanas.',
  );
  assert.equal(pt['housegains.gamification.streak.weekSecured'], 'Semana garantida');
  assert.equal(pt['housegains.gamification.organizer.streakLabel'], 'Casa em dia');
  const names: Record<string, string> = {
    helper: 'Mão amiga',
    closer: 'Fecha-tarefa',
    ontime: 'Pontual',
    kitchen: 'Rei da cozinha',
    pets: 'Melhor amigo',
    marathon: 'Maratonista',
    fit: 'Em forma',
    pillar: 'Pilar da casa',
    spring: 'Faxina de primavera',
    yearend: 'Casa pronta pro ano novo',
    host: 'Anfitrião',
    maestro: 'Maestro',
    architect: 'Arquiteto de tarefas',
    fair: 'Divisão justa',
    order: 'Casa em ordem',
  };
  for (const [id, name] of Object.entries(names)) {
    assert.equal(pt[`housegains.gamification.achievement.${id}.name`], name, id);
  }
});
