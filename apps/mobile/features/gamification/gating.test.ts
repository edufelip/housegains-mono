import assert from 'node:assert/strict';
import test from 'node:test';
import { GAMIFICATION_FLAG_PARAM, isGamificationVisible, parseCohort } from './gating';

test('the Remote Config parameter is gamification_enabled', () => {
  assert.equal(GAMIFICATION_FLAG_PARAM, 'gamification_enabled');
});

test('visible only when the flag is true AND the household cohort is live', () => {
  assert.equal(isGamificationVisible({ flagEnabled: true, cohort: 'live' }), true);
  assert.equal(isGamificationVisible({ flagEnabled: false, cohort: 'live' }), false);
  assert.equal(isGamificationVisible({ flagEnabled: true, cohort: 'control' }), false);
  assert.equal(isGamificationVisible({ flagEnabled: true, cohort: 'shadow' }), false);
  assert.equal(isGamificationVisible({ flagEnabled: false, cohort: 'shadow' }), false);
});

test('anything that is not exactly true/live stays hidden', () => {
  assert.equal(isGamificationVisible({ flagEnabled: null, cohort: 'live' }), false);
  assert.equal(isGamificationVisible({ flagEnabled: undefined, cohort: 'live' }), false);
  assert.equal(isGamificationVisible({ flagEnabled: true, cohort: undefined }), false);
  assert.equal(isGamificationVisible({ flagEnabled: true, cohort: null }), false);
  assert.equal(isGamificationVisible({ flagEnabled: true, cohort: 'LIVE' }), false);
  assert.equal(isGamificationVisible({ flagEnabled: true, cohort: 1 }), false);
  assert.equal(
    isGamificationVisible({ flagEnabled: 'true' as unknown as boolean, cohort: 'live' }),
    false,
  );
});

test('parseCohort accepts the three known values only', () => {
  assert.equal(parseCohort('live'), 'live');
  assert.equal(parseCohort('control'), 'control');
  assert.equal(parseCohort('shadow'), 'shadow');
  assert.equal(parseCohort('other'), null);
  assert.equal(parseCohort(undefined), null);
});
