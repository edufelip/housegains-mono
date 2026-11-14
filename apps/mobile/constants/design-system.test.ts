import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DsFontFamily,
  DsRadius,
  DsTypography,
  getDsTheme,
  type DsColorScheme,
} from './design-system';

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
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function expectReadable(
  scheme: DsColorScheme,
  name: string,
  foreground: string,
  background: string,
): void {
  const ratio = contrastRatio(foreground, background);
  assert.ok(ratio >= 4.5, `${scheme} ${name} contrast ${ratio.toFixed(2)}:1 is below 4.5:1`);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme} design-system text and control pairs meet WCAG AA contrast`, () => {
    const { color } = getDsTheme(scheme);

    expectReadable(scheme, 'primary pill label', color.onActionPrimary, color.actionPrimary);
    expectReadable(scheme, 'accent label on accent fill', color.onAccent, color.accentPrimary);
    expectReadable(scheme, 'accent link on canvas', color.accentPrimary, color.canvas);
    expectReadable(scheme, 'accent link on surface', color.accentPrimary, color.surface);
    expectReadable(scheme, 'tertiary text on canvas', color.textTertiary, color.canvas);
    expectReadable(scheme, 'tertiary text on surface', color.textTertiary, color.surface);
    expectReadable(
      scheme,
      'tertiary text on muted surface',
      color.textTertiary,
      color.surfaceMuted,
    );
    expectReadable(scheme, 'disabled label', color.disabledText, color.disabledSurface);
  });
}

test('Night training grounds, cards and panels match the spec in both schemes', () => {
  const light = getDsTheme('light').color;
  const dark = getDsTheme('dark').color;

  assert.deepEqual(
    [dark.canvas, dark.surface, dark.surfaceMuted, dark.textPrimary, dark.accentPrimary],
    ['#0e0d0c', '#181716', '#242322', '#ffffff', '#4ade80'],
  );
  assert.deepEqual(
    [light.canvas, light.surface, light.surfaceMuted, light.textPrimary, light.accentPrimary],
    ['#f6f4f1', '#ffffff', '#efece7', '#14110f', '#1f7a4c'],
  );
  assert.equal(dark.actionPrimary, '#ffffff');
  assert.equal(dark.onActionPrimary, '#0e0d0c');
  assert.equal(light.actionPrimary, '#14110f');
  assert.equal(light.onActionPrimary, '#ffffff');
  assert.deepEqual(
    [DsRadius.sm, DsRadius.md, DsRadius.lg, DsRadius.xl, DsRadius.pill],
    [12, 12, 16, 16, 22],
  );
});

const TABULAR_ROLES = ['figure', 'micro', 'caption'];

test('type uses Geist families and tabular figures on numeric roles', () => {
  for (const family of Object.values(DsFontFamily)) {
    assert.match(family, /^Geist(Mono)?_\d{3}/);
  }
  for (const [role, style] of Object.entries(DsTypography)) {
    assert.deepEqual(
      style.fontVariant,
      TABULAR_ROLES.includes(role) ? ['tabular-nums'] : undefined,
      `${role} tabular-nums`,
    );
    assert.notEqual(style.textTransform, 'uppercase', `${role} must not be uppercase`);
    assert.equal(style.letterSpacing, undefined, `${role} must not track letters`);
  }
  assert.equal(DsTypography.figure.fontSize, 32);
});
