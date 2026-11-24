import assert from 'node:assert/strict';
import test from 'node:test';
import { HOUSEGAINS_DICTIONARIES } from '@/localization/housegains/catalog';
import {
  ACHIEVEMENTS,
  achievementEntry,
  amountKey,
  ledgerRowLabel,
  ruleLabelKey,
  toastTitleKey,
  tierPips,
} from './gamification-catalog';

test('every catalogued achievement has copy in all six locales', () => {
  assert.equal(ACHIEVEMENTS.length, 15);
  for (const locale of Object.keys(
    HOUSEGAINS_DICTIONARIES,
  ) as (keyof typeof HOUSEGAINS_DICTIONARIES)[]) {
    for (const achievement of ACHIEVEMENTS) {
      for (const suffix of ['name', 'description']) {
        const key = `housegains.gamification.achievement.${achievement.id}.${suffix}`;
        assert.ok(HOUSEGAINS_DICTIONARIES[locale][key]?.trim(), `${locale} ${key}`);
      }
    }
  }
});

test('catalog separates member and organizer badges and flags active / seasonal ones', () => {
  const byId = (id: string) => achievementEntry(id);
  assert.equal(byId('helper')?.track, 'member');
  assert.equal(byId('host')?.track, 'organizer');
  assert.equal(byId('fit')?.kind, 'active');
  assert.equal(byId('pillar')?.kind, 'active');
  assert.equal(byId('order')?.kind, 'active');
  assert.equal(byId('spring')?.kind, 'seasonal');
  assert.equal(byId('yearend')?.kind, 'seasonal');
  assert.equal(byId('kitchen')?.kind, 'standard');
  assert.equal(achievementEntry('nonsense'), null);
  assert.equal(ACHIEVEMENTS.filter((a) => a.track === 'member').length, 10);
  assert.equal(ACHIEVEMENTS.filter((a) => a.track === 'organizer').length, 5);
});

test('copy keys map to toast titles, with a generic fallback', () => {
  assert.equal(
    toastTitleKey('gami.earn.chore', 'ganhos'),
    'housegains.gamification.toast.title.chore',
  );
  assert.equal(
    toastTitleKey('gami.earn.on_time', 'ganhos'),
    'housegains.gamification.toast.title.on_time',
  );
  assert.equal(
    toastTitleKey('gami.earn.welcome', 'ganhos'),
    'housegains.gamification.toast.title.welcome',
  );
  assert.equal(
    toastTitleKey('gami.zelo.earned', 'zelo'),
    'housegains.gamification.toast.title.zelo',
  );
  assert.equal(
    toastTitleKey('gami.achievement.unlocked', 'ganhos'),
    'housegains.gamification.toast.title.badge',
  );
  assert.equal(
    toastTitleKey('gami.something.new', 'ganhos'),
    'housegains.gamification.toast.title.generic',
  );
  assert.equal(
    toastTitleKey('gami.something.new', 'zelo'),
    'housegains.gamification.toast.title.zelo',
  );
});

test('every rule id the engine writes has a readable label, others get the generic one', () => {
  for (const id of [
    'earn.subtask',
    'earn.bonus',
    'earn.assist',
    'earn.on_time',
    'earn.share',
    'earn.week_goal',
    'earn.streak_milestone',
    'earn.achievement',
    'earn.welcome',
    'zelo.setup',
    'zelo.chore_done',
    'zelo.member_activated',
    'zelo.on_time',
    'zelo.even_split',
    'zelo.streak_milestone',
  ]) {
    assert.equal(ruleLabelKey(id), `housegains.gamification.rule.${id}`);
    assert.ok(HOUSEGAINS_DICTIONARIES['pt-BR'][ruleLabelKey(id)], id);
  }
  assert.equal(ruleLabelKey('earn.future_rule'), 'housegains.gamification.rule.unknown');
});

test('ledgerRowLabel marks reversals', () => {
  assert.deepEqual(
    ledgerRowLabel({ ruleId: 'earn.subtask', amount: 20, reversesEntryId: undefined }),
    { key: 'housegains.gamification.rule.earn.subtask' },
  );
  assert.deepEqual(
    ledgerRowLabel({ ruleId: 'earn.subtask', amount: -20, reversesEntryId: 'earn.subtask:x' }),
    {
      key: 'housegains.gamification.ledger.reversal',
      ruleKey: 'housegains.gamification.rule.earn.subtask',
    },
  );
});

test('amount and tier helpers', () => {
  assert.equal(amountKey('ganhos'), 'housegains.gamification.amount.ganhos');
  assert.equal(amountKey('zelo'), 'housegains.gamification.amount.zelo');
  assert.equal(tierPips('bronze'), 1);
  assert.equal(tierPips('silver'), 2);
  assert.equal(tierPips('gold'), 3);
});
