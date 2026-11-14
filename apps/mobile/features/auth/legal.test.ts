import assert from 'node:assert/strict';
import test from 'node:test';
import { legalUrl } from './legal';

test('English legal pages live at the root path', () => {
  assert.equal(legalUrl('en-US', 'privacy'), 'https://housegains.app/privacy');
  assert.equal(legalUrl('en-US', 'terms'), 'https://housegains.app/terms');
});

test('every other locale has its own path prefix', () => {
  assert.equal(legalUrl('pt-BR', 'privacy'), 'https://housegains.app/pt-BR/privacy');
  assert.equal(legalUrl('es-ES', 'terms'), 'https://housegains.app/es-ES/terms');
  assert.equal(legalUrl('fr-FR', 'privacy'), 'https://housegains.app/fr-FR/privacy');
  assert.equal(legalUrl('de-DE', 'terms'), 'https://housegains.app/de-DE/terms');
  assert.equal(legalUrl('it-IT', 'privacy'), 'https://housegains.app/it-IT/privacy');
});
