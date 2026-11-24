import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { SUPPORTED_LOCALES } from '../core';
import { HOUSEGAINS_DICTIONARIES, translateHouseGains } from './catalog';
import { THEME_IDS } from '../../features/appearance/types';
import { ACHIEVEMENTS, RULE_IDS } from '../../features/gamification/gamification-catalog';
import { MEMBER_TITLE_KEYS, ORGANIZER_TITLE_KEYS } from '../../features/gamification/levels';
import { CATALOG } from '../../features/household/catalog';

const MOBILE_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function collectTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(path);
    return entry.isFile() && path.endsWith('.tsx') ? [path] : [];
  });
}

function collectScreenTranslationKeys(): Set<string> {
  const sourceFiles = [
    'features/housegains-screens',
    'features/gamification',
    'components/housegains',
    'features/onboarding',
  ].flatMap((directory) => collectTsxFiles(resolve(MOBILE_ROOT, directory)));
  const keys = new Set<string>();
  const translationCalls = /\bt\s*\(([\s\S]*?)\)/g;
  const literalKeys = /['"](housegains\.[^'"]+)['"]/g;

  for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    for (const call of source.matchAll(translationCalls)) {
      for (const match of call[1].matchAll(literalKeys)) keys.add(match[1]);
    }
  }

  // These keys are formed from runtime ids and must stay aligned with their source lists.
  for (const tab of ['today', 'feed', 'add', 'ranks', 'me']) {
    keys.add(`housegains.screens.tabs.${tab}`);
  }
  for (const theme of THEME_IDS) {
    keys.add(`housegains.theme.${theme}.name`);
    keys.add(`housegains.theme.${theme}.description`);
  }
  for (const locale of SUPPORTED_LOCALES) {
    keys.add(`housegains.screens.settings.locale.${locale}`);
  }
  for (const title of MEMBER_TITLE_KEYS) {
    keys.add(`housegains.screens.dashboard.title.${title}`);
  }
  // Ganhos & Zelo program copy built from ids (features/gamification).
  for (const title of ORGANIZER_TITLE_KEYS) {
    keys.add(`housegains.gamification.organizer.rank.${title}`);
  }
  for (const achievement of ACHIEVEMENTS) {
    keys.add(`housegains.gamification.achievement.${achievement.id}.name`);
    keys.add(`housegains.gamification.achievement.${achievement.id}.description`);
  }
  for (const rule of RULE_IDS) keys.add(`housegains.gamification.rule.${rule}`);
  for (const tier of ['bronze', 'silver', 'gold']) {
    keys.add(`housegains.gamification.tier.${tier}`);
  }
  for (const track of ['ganhos', 'zelo']) {
    keys.add(`housegains.gamification.amount.${track}`);
    keys.add(`housegains.gamification.total.${track}`);
  }
  for (const reason of [
    'chore',
    'bonus',
    'assist',
    'on_time',
    'share',
    'week_goal',
    'welcome',
    'zelo',
    'generic',
    'badge',
    'streak',
  ]) {
    keys.add(`housegains.gamification.toast.title.${reason}`);
  }
  for (const plural of [
    'countOne',
    'countOther',
    'recordOne',
    'recordOther',
    'brokenOne',
    'brokenOther',
  ]) {
    keys.add(`housegains.gamification.streak.${plural}`);
  }
  for (const status of ['counted', 'missed', 'away', 'current']) {
    keys.add(`housegains.gamification.streak.week.${status}`);
  }
  for (const error of [
    'notMonday',
    'notFuture',
    'yearLimit',
    'tooMany',
    'noHousehold',
    'network',
    'generic',
  ]) {
    keys.add(`housegains.gamification.away.error.${error}`);
  }
  for (const role of ['creator', 'member', 'admin']) {
    keys.add(`housegains.screens.common.role.${role}`);
  }
  for (const category of ['all', ...new Set(CATALOG.map((chore) => chore.category))]) {
    keys.add(`housegains.screens.catalog.category.${category}`);
  }
  for (const category of [
    'household',
    'kitchen',
    'bathroom',
    'pets',
    'living',
    'plants',
    'other',
  ]) {
    keys.add(`housegains.screens.builder.category.${category}`);
  }
  for (const recurrence of ['daily', 'weekly', 'every']) {
    keys.add(`housegains.screens.builder.recurrence.${recurrence}`);
  }
  for (let day = 0; day < 7; day += 1) {
    keys.add(`housegains.screens.common.weekday.${day}`);
    keys.add(`housegains.screens.builder.weekday.${day}`);
  }
  for (const chore of CATALOG) {
    keys.add(`housegains.catalog.${chore.id}.name`);
    for (const subtask of chore.subtasks) {
      keys.add(`housegains.catalog.subtask.${subtask.id}`);
    }
  }

  return keys;
}

describe('HouseGains locale catalog', () => {
  it('keeps every supported HouseGains language complete and nonempty', () => {
    const keys = Object.keys(HOUSEGAINS_DICTIONARIES['en-US']).sort();
    assert.deepEqual(Object.keys(HOUSEGAINS_DICTIONARIES).sort(), [...SUPPORTED_LOCALES].sort());
    for (const locale of SUPPORTED_LOCALES)
      assert.deepEqual(Object.keys(HOUSEGAINS_DICTIONARIES[locale]).sort(), keys, locale);
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of keys) {
        assert.notEqual(
          HOUSEGAINS_DICTIONARIES[locale][key].trim(),
          '',
          `${locale} is empty for ${key}`,
        );
      }
    }
  });

  it('interpolates localized preview values and humanizes an unknown key', () => {
    assert.equal(
      translateHouseGains('pt-BR', 'housegains.preview.done_count', { done: 2, total: 5 }),
      '2 de 5 concluídas',
    );
    assert.equal(
      translateHouseGains('en-US', 'housegains.unmapped.action_label'),
      'Unmapped action label',
    );
  });

  it('ships every appearance, screen, and curated catalog string in each locale', () => {
    const keys = collectScreenTranslationKeys();
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of keys) {
        assert.ok(
          HOUSEGAINS_DICTIONARIES[locale][key]?.trim(),
          `${locale} is missing a shipped screen string: ${key}`,
        );
      }
    }
  });

  it('documents every shipped locale key in the copy table', () => {
    const copyTable = readFileSync(
      resolve(MOBILE_ROOT, 'docs/screens/v2/localized-copy-table-v2.md'),
      'utf8',
    );
    for (const key of Object.keys(HOUSEGAINS_DICTIONARIES['en-US'])) {
      assert.ok(copyTable.includes(`\`${key}\``), `copy table is missing ${key}`);
    }
  });
});

it('preserves every interpolation placeholder across all supported languages', () => {
  const placeholders = (value: string) =>
    [
      ...new Set([...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1])),
    ].sort();
  for (const locale of SUPPORTED_LOCALES)
    for (const [key, value] of Object.entries(HOUSEGAINS_DICTIONARIES['en-US']))
      assert.deepEqual(
        placeholders(HOUSEGAINS_DICTIONARIES[locale][key]),
        placeholders(value),
        `${locale}: ${key}`,
      );
});

it('new languages contain translated app copy rather than English fallback values', () => {
  for (const locale of ['fr-FR', 'de-DE', 'it-IT'] as const)
    for (const key of [
      'housegains.appearance.subtitle',
      'housegains.screens.onboarding.householdDescription',
      'housegains.screens.builder.error.bonusXp',
    ])
      assert.notEqual(
        HOUSEGAINS_DICTIONARIES[locale][key],
        HOUSEGAINS_DICTIONARIES['en-US'][key],
        `${locale}: ${key}`,
      );
});

it('documents all six languages and every translated value in the generated table', () => {
  const table = readFileSync(
    resolve(MOBILE_ROOT, 'docs/screens/housegains-localized-copy.md'),
    'utf8',
  );
  for (const locale of SUPPORTED_LOCALES) {
    assert.ok(table.includes(locale));
    for (const value of Object.values(HOUSEGAINS_DICTIONARIES[locale]))
      assert.ok(table.includes(value.replaceAll('|', '\\|').replaceAll('\n', '<br>')), locale);
  }
});
