import assert from 'node:assert/strict';
import { FontFamily, getThemeTokens, THEME_TOKENS } from '@/features/appearance/tokens';
import { THEME_IDS, TYPE_ROLES, type AppearanceTokens } from '@/features/appearance/types';

function relativeLuminance(hex: string): number {
  const channels = hex
    .match(/[a-f\d]{2}/gi)
    ?.slice(0, 3)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));

  assert.equal(channels?.length, 3, `Expected a six-digit hex color, received ${hex}`);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

type ColorRole = keyof Pick<
  AppearanceTokens,
  | 'canvas'
  | 'surface'
  | 'text'
  | 'muted'
  | 'primary'
  | 'onPrimary'
  | 'border'
  | 'accent'
  | 'success'
  | 'danger'
>;

type Pair = { fg: ColorRole; bg: ColorRole };

/** Pairs that carry readable text. WCAG 2.2 AA requires 4.5:1 for normal text. */
const TEXT_PAIRS: Pair[] = [
  { fg: 'text', bg: 'canvas' },
  { fg: 'text', bg: 'surface' },
  { fg: 'muted', bg: 'canvas' },
  { fg: 'muted', bg: 'surface' },
  { fg: 'onPrimary', bg: 'primary' },
];

/**
 * Known gaps against the AA text threshold, recorded so they cannot get worse
 * silently. Each entry's floor is its measured ratio, rounded down. Fixing a
 * color means raising it above 4.5 and deleting its entry here and in
 * docs/design-system/accessibility.md.
 */
const KNOWN_TEXT_GAPS: Partial<Record<(typeof THEME_IDS)[number], Record<string, number>>> = {
  soft: { 'onPrimary/primary': 4.4 },
};

/**
 * Status colors (accent, success, danger) are intentionally not asserted
 * against a text threshold: they are fills, outlines, or icons that always
 * travel with a text label (see docs/design-system/accessibility.md), and
 * Sticker's pastel values sit below 3:1 on white by design, relying on its
 * black outline instead (asserted below).
 */
describe('theme tokens: contrast', () => {
  for (const themeId of THEME_IDS) {
    const tokens = THEME_TOKENS[themeId];

    for (const { fg, bg } of TEXT_PAIRS) {
      const floor = KNOWN_TEXT_GAPS[themeId]?.[`${fg}/${bg}`] ?? 4.5;
      it(`${themeId}: ${fg} on ${bg} is at least ${floor}:1`, () => {
        const ratio = contrastRatio(tokens[fg], tokens[bg]);
        assert.ok(ratio >= floor, `${fg}/${bg} is ${ratio.toFixed(2)}:1, expected >= ${floor}:1`);
      });
    }

    it(`${themeId}: primary on surface is at least 3:1 for icons and focus`, () => {
      assert.ok(contrastRatio(tokens.primary, tokens.surface) >= 3);
    });
  }

  it('sticker: borders are high contrast, so pastel fills stay delimited', () => {
    const tokens = THEME_TOKENS.sticker;
    assert.ok(contrastRatio(tokens.border, tokens.surface) >= 7);
    assert.ok(tokens.borderWidth >= 2);
  });

  it('arcade and soft: borders are decorative hairlines, never the only boundary cue', () => {
    // Documented in docs/design-system/accessibility.md: below 3:1 by design.
    for (const themeId of ['arcade', 'soft'] as const) {
      const tokens = THEME_TOKENS[themeId];
      assert.ok(contrastRatio(tokens.border, tokens.surface) < 3);
      assert.ok(tokens.borderWidth === 1);
    }
  });
});

describe('theme tokens: structure', () => {
  it('exposes a token set for every theme id', () => {
    for (const themeId of THEME_IDS) {
      assert.equal(getThemeTokens(themeId), THEME_TOKENS[themeId]);
    }
  });

  it('defines every type role with a positive size and a line height above the size', () => {
    for (const themeId of THEME_IDS) {
      for (const role of TYPE_ROLES) {
        const style = THEME_TOKENS[themeId].type[role];
        assert.ok(style.fontSize > 0);
        assert.ok(style.lineHeight > style.fontSize, `${themeId}.${role}`);
        assert.ok(style.fontFamily.length > 0);
      }
    }
  });

  it('keeps body text at or above 16 and meaningful text at or above 12', () => {
    for (const themeId of THEME_IDS) {
      const { type } = THEME_TOKENS[themeId];
      assert.ok(type.body.fontSize >= 16);
      for (const role of TYPE_ROLES) assert.ok(type[role].fontSize >= 12, `${themeId}.${role}`);
    }
  });

  it('keeps the same type scale across themes; only the heading family differs', () => {
    const reference = THEME_TOKENS.arcade.type;
    for (const themeId of THEME_IDS) {
      for (const role of TYPE_ROLES) {
        const { fontFamily, ...rest } = THEME_TOKENS[themeId].type[role];
        const { fontFamily: _ignored, ...expected } = reference[role];
        assert.deepEqual(rest, expected, `${themeId}.${role}`);
        assert.ok(fontFamily.length > 0);
      }
    }
  });

  it('uses the serif heading family only in Soft Home', () => {
    assert.notEqual(THEME_TOKENS.soft.type.heading.fontFamily, FontFamily.bold);
    assert.equal(THEME_TOKENS.arcade.type.heading.fontFamily, FontFamily.bold);
    assert.equal(THEME_TOKENS.sticker.type.heading.fontFamily, FontFamily.bold);
  });

  it('keeps the spacing scale and touch targets identical across themes', () => {
    for (const themeId of THEME_IDS) {
      const tokens = THEME_TOKENS[themeId];
      assert.deepEqual(Object.values(tokens.spacing), [4, 8, 12, 16, 20, 24, 32]);
      assert.ok(tokens.touchTarget.min >= 44);
      assert.ok(tokens.touchTarget.comfortable >= tokens.touchTarget.min);
    }
  });
});
