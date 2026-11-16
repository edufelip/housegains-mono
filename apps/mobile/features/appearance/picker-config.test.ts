import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SUPPORTED_LOCALES } from '@/localization/core';
import {
  BUNDLED_PICKER_CONFIG,
  contrastRatio,
  isDarkColor,
  resolvePickerCopy,
  validatePickerConfig,
  visibleStyleConfigs,
} from './picker-config';
import type { PickerConfig, PickerStyleConfig } from './picker-config-types';
import type { HouseGainsLocale } from '@/localization/housegains/catalog';

function cloneBundled(): PickerConfig {
  return JSON.parse(JSON.stringify(BUNDLED_PICKER_CONFIG)) as PickerConfig;
}

function styleById(config: PickerConfig, id: string): Record<string, unknown> {
  const style = config.styles.find((item) => item.id === id);
  assert.ok(style, `missing bundled style ${id}`);
  return style;
}

const SIX_TEXT = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [locale, `Mint ${locale}`]),
) as Record<HouseGainsLocale, string>;

describe('bundled picker config', () => {
  it('is valid with no errors and orders visible pages sticker, arcade, soft', () => {
    const result = validatePickerConfig(BUNDLED_PICKER_CONFIG);

    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(
      visibleStyleConfigs(result.styles).map((style) => style.id),
      ['sticker', 'arcade', 'soft'],
    );
  });

  it('gives soft exactly one contrast warning for onPrimary on primary (4.47:1)', () => {
    const result = validatePickerConfig(BUNDLED_PICKER_CONFIG);

    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /^styles\[2\] "soft": onPrimary\/primary contrast 4\.47:1/);
  });
});

describe('R1 whole-config rejection', () => {
  for (const [name, raw] of [
    ['null', null],
    ['an array', []],
    ['a wrong schemaVersion', { schemaVersion: 2, styles: [] }],
    ['a missing styles array', { schemaVersion: 1 }],
  ] as const) {
    it(`rejects ${name}`, () => {
      const result = validatePickerConfig(raw);

      assert.equal(result.ok, false);
      assert.deepEqual(result.styles, []);
      assert.equal(result.errors.length, 1);
    });
  }
});

describe('R2 per-style validation', () => {
  it('drops a style with a bad colour and keeps the rest', () => {
    const config = cloneBundled();
    (styleById(config, 'arcade').tokens as Record<string, unknown>).canvas = 'red';

    const result = validatePickerConfig(config);

    assert.equal(result.ok, true);
    assert.deepEqual(
      result.styles.map((style) => style.id),
      ['sticker', 'soft'],
    );
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /styles\[1\] "arcade"/);
    assert.match(result.errors[0], /tokens\.canvas must be #RRGGBB/);
  });

  it('drops a duplicate id and keeps the first', () => {
    const config = cloneBundled();
    config.styles.push(JSON.parse(JSON.stringify(config.styles[0])) as PickerStyleConfig);

    const result = validatePickerConfig(config);

    assert.equal(result.ok, true);
    assert.equal(result.styles.length, 3);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /duplicate id/);
  });

  it('drops a style with an out-of-range radius', () => {
    const config = cloneBundled();
    (styleById(config, 'soft').tokens as Record<string, unknown>).radius = 40;

    const result = validatePickerConfig(config);

    assert.deepEqual(
      result.styles.map((style) => style.id),
      ['sticker', 'arcade'],
    );
    assert.match(result.errors[0], /tokens\.radius must be 0-32/);
  });
});

describe('R3 minimum enabled styles', () => {
  it('rejects the whole config when fewer than two styles are enabled', () => {
    const config = cloneBundled();
    styleById(config, 'arcade').enabled = false;
    styleById(config, 'soft').enabled = false;

    const result = validatePickerConfig(config);

    assert.equal(result.ok, false);
    assert.deepEqual(result.styles, []);
    assert.ok(result.errors.some((error) => error.includes('fewer than 2 valid enabled styles')));
  });
});

describe('R4 contrast', () => {
  it('drops a style whose text is below 3:1 on the canvas', () => {
    const config = cloneBundled();
    (styleById(config, 'sticker').tokens as Record<string, unknown>).text = '#C9C4B0';

    const result = validatePickerConfig(config);

    assert.equal(result.ok, true);
    assert.deepEqual(
      result.styles.map((style) => style.id),
      ['arcade', 'soft'],
    );
    assert.match(result.errors[0], /text\/canvas contrast .+ is below 3:1/);
  });
});

describe('R5 copy', () => {
  it('drops a style whose literal text is missing a locale', () => {
    const config = cloneBundled();
    const text: Partial<Record<HouseGainsLocale, string>> = { ...SIX_TEXT };
    delete text['it-IT'];
    styleById(config, 'arcade').copy = {
      name: { text },
      description: { key: 'housegains.theme.arcade.description' },
    };

    const result = validatePickerConfig(config);

    assert.deepEqual(
      result.styles.map((style) => style.id),
      ['sticker', 'soft'],
    );
    assert.match(result.errors[0], /copy\.name text is missing it-IT/);
  });

  it('drops a style whose key is not in the locale bundles', () => {
    const result = validatePickerConfig(cloneBundled(), () => false);

    assert.equal(result.ok, false);
    assert.deepEqual(result.styles, []);
    assert.equal(result.errors.length, 4);
  });

  it('drops only the style whose key is unknown when other keys resolve', () => {
    const result = validatePickerConfig(
      cloneBundled(),
      (key) => !key.startsWith('housegains.theme.soft.'),
    );

    assert.equal(result.ok, true);
    assert.deepEqual(
      result.styles.map((style) => style.id),
      ['sticker', 'arcade'],
    );
    assert.match(result.errors[0], /styles\[2\] "soft"/);
  });

  it('accepts a new id with literal copy for all six locales', () => {
    const config = cloneBundled();
    config.styles.push({
      id: 'mint',
      order: 4,
      composition: 'soft',
      nameTreatment: 'serif',
      headingFont: 'serif',
      copy: {
        name: { text: SIX_TEXT },
        description: { text: SIX_TEXT },
      },
      tokens: { ...BUNDLED_PICKER_CONFIG.styles[2].tokens },
    });

    const result = validatePickerConfig(config);

    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
    assert.equal(result.styles.length, 4);
    assert.deepEqual(
      visibleStyleConfigs(result.styles).map((style) => style.id),
      ['sticker', 'arcade', 'soft', 'mint'],
    );
  });
});

describe('R10 description may no longer match', () => {
  it('warns when a bundled style keeps its description key but its primary colour changes', () => {
    const config = cloneBundled();
    (styleById(config, 'arcade').tokens as Record<string, unknown>).primary = '#00E5FF';

    const result = validatePickerConfig(config);

    assert.equal(result.ok, true);
    assert.ok(result.styles.some((style) => style.id === 'arcade'));
    assert.ok(
      result.warnings.some((warning) => warning.includes('description may no longer match')),
    );
  });
});

describe('visibleStyleConfigs', () => {
  it('filters disabled styles and sorts by order, then id', () => {
    const base = BUNDLED_PICKER_CONFIG.styles[0];
    const make = (id: string, order: number, enabled?: boolean): PickerStyleConfig => ({
      ...base,
      id,
      order,
      enabled,
    });

    const visible = visibleStyleConfigs([
      make('b', 1),
      make('a', 1),
      make('c', 0),
      make('d', 2, false),
    ]);

    assert.deepEqual(
      visible.map((style) => style.id),
      ['c', 'a', 'b'],
    );
  });
});

describe('resolvePickerCopy', () => {
  it('uses t for keys and falls back to en-US for missing literal locales', () => {
    const t = (key: string) => `translated:${key}`;

    assert.equal(
      resolvePickerCopy({ key: 'housegains.theme.soft.name' }, 'pt-BR', t),
      'translated:housegains.theme.soft.name',
    );
    assert.equal(
      resolvePickerCopy({ text: { ...SIX_TEXT, 'pt-BR': 'Menta' } }, 'pt-BR', t),
      'Menta',
    );
    assert.equal(
      resolvePickerCopy(
        { text: { 'en-US': 'Mint' } as Record<HouseGainsLocale, string> },
        'de-DE',
        t,
      ),
      'Mint',
    );
  });
});

describe('colour helpers', () => {
  it('computes WCAG contrast rounded to two decimals', () => {
    assert.equal(contrastRatio('#FFFFFF', '#6366F1'), 4.47);
  });

  it('classifies dark and light canvases', () => {
    assert.equal(isDarkColor('#0D1117'), true);
    assert.equal(isDarkColor('#FFFDF0'), false);
  });
});
