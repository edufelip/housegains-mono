import { SUPPORTED_LOCALES } from '@/localization/core';
import { HOUSEGAINS_DICTIONARIES, type HouseGainsLocale } from '@/localization/housegains/catalog';
import {
  COMPOSITIONS,
  HEADING_FONTS,
  NAME_TREATMENTS,
  PICKER_COLOR_TOKENS,
  PICKER_CONFIG_SCHEMA_VERSION,
  STYLE_ID_PATTERN,
  type Composition,
  type HeadingFont,
  type NameTreatment,
  type PickerConfig,
  type PickerCopy,
  type PickerStyleConfig,
  type PickerStyleTokens,
  type PickerValidation,
} from './picker-config-types';

/**
 * The config shipped in the app. Token values match features/appearance/tokens.ts (copied, not imported,
 * so this module stays loadable by Bun unit tests).
 */
export const BUNDLED_PICKER_CONFIG: PickerConfig = {
  schemaVersion: 1,
  styles: [
    {
      id: 'sticker',
      order: 1,
      composition: 'sticker',
      nameTreatment: 'sticker',
      headingFont: 'sans',
      copy: {
        name: { key: 'housegains.theme.sticker.name' },
        description: { key: 'housegains.theme.sticker.description' },
      },
      tokens: {
        canvas: '#FFFDF0',
        surface: '#FFFFFF',
        text: '#141414',
        muted: '#414141',
        primary: '#2563EB',
        onPrimary: '#FFFFFF',
        border: '#111111',
        accent: '#FBBF24',
        success: '#10B981',
        danger: '#F87171',
        radius: 18,
        borderWidth: 2.5,
      },
    },
    {
      id: 'arcade',
      order: 2,
      composition: 'arcade',
      nameTreatment: 'accent',
      headingFont: 'sans',
      copy: {
        name: { key: 'housegains.theme.arcade.name' },
        description: { key: 'housegains.theme.arcade.description' },
      },
      tokens: {
        canvas: '#0D1117',
        surface: '#161B22',
        text: '#F0F6FC',
        muted: '#8B949E',
        primary: '#76FF03',
        onPrimary: '#0D1117',
        border: '#30363D',
        accent: '#FF8A4C',
        success: '#76FF03',
        danger: '#FF6B63',
        radius: 14,
        borderWidth: 1,
      },
    },
    {
      id: 'soft',
      order: 3,
      composition: 'soft',
      nameTreatment: 'serif',
      headingFont: 'serif',
      copy: {
        name: { key: 'housegains.theme.soft.name' },
        description: { key: 'housegains.theme.soft.description' },
      },
      tokens: {
        canvas: '#F5F2FB',
        surface: '#FFFFFF',
        text: '#241E37',
        muted: '#5D566F',
        primary: '#6366F1',
        onPrimary: '#FFFFFF',
        border: '#E4DFF0',
        accent: '#F4B38E',
        success: '#167F6A',
        danger: '#B4233B',
        radius: 24,
        borderWidth: 1,
      },
    },
  ],
};

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, rounded to 2 decimals. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  return Math.round(ratio * 100) / 100;
}

export function isDarkColor(hex: string): boolean {
  return relativeLuminance(hex) < 0.2;
}

/** Status bar content style for a background colour: light text on dark canvases. */
export function statusBarStyleFor(canvas: string): 'light' | 'dark' {
  return isDarkColor(canvas) ? 'light' : 'dark';
}

const defaultHasKey = (key: string): boolean =>
  SUPPORTED_LOCALES.every((locale) =>
    Object.prototype.hasOwnProperty.call(HOUSEGAINS_DICTIONARIES[locale], key),
  );

function parseCopy(
  raw: unknown,
  field: 'name' | 'description',
  hasKey: (key: string) => boolean,
): { copy: PickerCopy | null; problems: string[] } {
  if (!isRecord(raw)) {
    return { copy: null, problems: [`copy.${field} is missing`] };
  }
  if (raw.key !== undefined) {
    if (typeof raw.key !== 'string' || !hasKey(raw.key)) {
      return {
        copy: null,
        problems: [`copy.${field} key ${JSON.stringify(raw.key)} is not in all six locale bundles`],
      };
    }
    return { copy: { key: raw.key }, problems: [] };
  }
  if (!isRecord(raw.text)) {
    return { copy: null, problems: [`copy.${field} needs a key or text`] };
  }
  const text = {} as Record<HouseGainsLocale, string>;
  const missing: string[] = [];
  for (const locale of SUPPORTED_LOCALES) {
    const value = raw.text[locale];
    if (typeof value === 'string' && value.trim() !== '') {
      text[locale] = value;
    } else {
      missing.push(locale);
    }
  }
  if (missing.length > 0) {
    return { copy: null, problems: [`copy.${field} text is missing ${missing.join(', ')}`] };
  }
  return { copy: { text }, problems: [] };
}

function parseTokens(raw: unknown): { tokens: PickerStyleTokens | null; problems: string[] } {
  if (!isRecord(raw)) {
    return { tokens: null, problems: ['tokens is missing'] };
  }
  const problems: string[] = [];
  const colours: Record<string, string> = {};
  for (const token of PICKER_COLOR_TOKENS) {
    const value = raw[token];
    if (typeof value === 'string' && HEX_PATTERN.test(value)) {
      colours[token] = value;
    } else {
      problems.push(`tokens.${token} must be #RRGGBB`);
    }
  }
  const { radius, borderWidth } = raw;
  if (!isFiniteInRange(radius, 0, 32)) problems.push('tokens.radius must be 0-32');
  if (!isFiniteInRange(borderWidth, 0, 4)) problems.push('tokens.borderWidth must be 0-4');
  if (problems.length > 0 || typeof radius !== 'number' || typeof borderWidth !== 'number') {
    return { tokens: null, problems };
  }
  return {
    tokens: {
      canvas: colours.canvas,
      surface: colours.surface,
      text: colours.text,
      muted: colours.muted,
      primary: colours.primary,
      onPrimary: colours.onPrimary,
      border: colours.border,
      accent: colours.accent,
      success: colours.success,
      danger: colours.danger,
      radius,
      borderWidth,
    },
    problems: [],
  };
}

const CONTRAST_PAIRS: [label: string, fg: keyof PickerStyleTokens, bg: keyof PickerStyleTokens][] =
  [
    ['text/canvas', 'text', 'canvas'],
    ['text/surface', 'text', 'surface'],
    ['muted/canvas', 'muted', 'canvas'],
    ['onPrimary/primary', 'onPrimary', 'primary'],
  ];

function findBundled(id: string): PickerStyleConfig | undefined {
  return BUNDLED_PICKER_CONFIG.styles.find((style) => style.id === id);
}

type StyleCheck = { style: PickerStyleConfig | null; errors: string[]; warnings: string[] };

function checkStyle(
  raw: unknown,
  index: number,
  hasKey: (key: string) => boolean,
  acceptedIds: Set<string>,
): StyleCheck {
  if (!isRecord(raw)) {
    return { style: null, errors: [`styles[${index}]: not an object`], warnings: [] };
  }

  const id = raw.id;
  const label = `styles[${index}] "${String(id)}"`;
  const problems: string[] = [];
  const warnings: string[] = [];

  // R2a
  if (typeof id !== 'string' || !STYLE_ID_PATTERN.test(id)) {
    problems.push('id does not match the style id pattern');
  } else if (acceptedIds.has(id)) {
    problems.push('duplicate id');
  }

  // R2b
  const { enabled, order, composition, nameTreatment, headingFont } = raw;
  if (enabled !== undefined && typeof enabled !== 'boolean')
    problems.push('enabled must be a boolean');
  if (typeof order !== 'number' || !Number.isFinite(order))
    problems.push('order must be a finite number');
  if (!isOneOf<Composition>(COMPOSITIONS, composition))
    problems.push(`composition must be one of ${COMPOSITIONS.join(', ')}`);
  if (!isOneOf<NameTreatment>(NAME_TREATMENTS, nameTreatment)) {
    problems.push(`nameTreatment must be one of ${NAME_TREATMENTS.join(', ')}`);
  }
  if (!isOneOf<HeadingFont>(HEADING_FONTS, headingFont)) {
    problems.push(`headingFont must be one of ${HEADING_FONTS.join(', ')}`);
  }

  // R2c
  const tokenResult = parseTokens(raw.tokens);
  problems.push(...tokenResult.problems);

  // R5
  const copyRaw = isRecord(raw.copy) ? raw.copy : {};
  const name = parseCopy(copyRaw.name, 'name', hasKey);
  const description = parseCopy(copyRaw.description, 'description', hasKey);
  problems.push(...name.problems, ...description.problems);

  // R4 (only meaningful when the tokens are valid)
  const tokens = tokenResult.tokens;
  if (tokens) {
    for (const [pairLabel, fg, bg] of CONTRAST_PAIRS) {
      const ratio = contrastRatio(tokens[fg] as string, tokens[bg] as string);
      if (ratio < 3) {
        problems.push(`${pairLabel} contrast ${ratio}:1 is below 3:1`);
      } else if (ratio < 4.5) {
        warnings.push(`${label}: ${pairLabel} contrast ${ratio}:1 is below 4.5:1`);
      }
    }
  }

  if (problems.length > 0 || !tokens || !name.copy || !description.copy) {
    return { style: null, errors: [`${label}: ${problems.join('; ')}`], warnings: [] };
  }

  const style: PickerStyleConfig = {
    id: id as string,
    enabled: enabled as boolean | undefined,
    order: order as number,
    composition: composition as Composition,
    nameTreatment: nameTreatment as NameTreatment,
    headingFont: headingFont as HeadingFont,
    copy: { name: name.copy, description: description.copy },
    tokens,
  };

  // R10: a bundled id whose look changed while its description key stayed the same.
  const bundled = findBundled(style.id);
  if (
    bundled &&
    description.copy !== null &&
    'key' in description.copy &&
    'key' in bundled.copy.description &&
    description.copy.key === bundled.copy.description.key &&
    (['canvas', 'primary', 'accent'] as const).some(
      (token) => tokens[token].toUpperCase() !== bundled.tokens[token].toUpperCase(),
    )
  ) {
    warnings.push(`${label}: description may no longer match`);
  }

  return { style, errors: [], warnings };
}

function failed(message: string): PickerValidation {
  return { ok: false, styles: [], errors: [message], warnings: [] };
}

/**
 * Validates a raw style picker config (contract v1, rules R1-R5 and R10).
 * Invalid styles are dropped with one error line each; the whole config is rejected when R1 or R3 applies.
 */
export function validatePickerConfig(
  raw: unknown,
  hasKey: (key: string) => boolean = defaultHasKey,
): PickerValidation {
  if (!isRecord(raw)) {
    return failed('config is not an object');
  }
  if (raw.schemaVersion !== PICKER_CONFIG_SCHEMA_VERSION) {
    return failed(`schemaVersion must be ${PICKER_CONFIG_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(raw.styles)) {
    return failed('styles must be an array');
  }

  const styles: PickerStyleConfig[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const acceptedIds = new Set<string>();

  raw.styles.forEach((item: unknown, index: number) => {
    const result = checkStyle(item, index, hasKey, acceptedIds);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    if (result.style) {
      styles.push(result.style);
      acceptedIds.add(result.style.id);
    }
  });

  // R3
  const enabledCount = styles.filter((style) => style.enabled !== false).length;
  if (enabledCount < 2) {
    return {
      ok: false,
      styles: [],
      errors: [...errors, `fewer than 2 valid enabled styles (found ${enabledCount})`],
      warnings,
    };
  }

  return { ok: true, styles, errors, warnings };
}

/** Enabled styles only, sorted by order ascending, then id. */
export function visibleStyleConfigs(styles: PickerStyleConfig[]): PickerStyleConfig[] {
  return styles
    .filter((style) => style.enabled !== false)
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Literal text falls back to English when a locale is missing. Keys go through `t`. */
export function resolvePickerCopy(
  copy: PickerCopy,
  locale: HouseGainsLocale,
  t: (key: string) => string,
): string {
  if ('key' in copy) {
    return t(copy.key);
  }
  return copy.text[locale] ?? copy.text['en-US'];
}
