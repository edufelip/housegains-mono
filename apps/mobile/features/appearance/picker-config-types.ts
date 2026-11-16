import type { AppearanceTokens, ThemeId } from './types';
import type { HouseGainsLocale } from '@/localization/housegains/catalog';

/**
 * Style picker config contract v1.
 * See docs/superpowers/plans/2026-11-16-style-picker-pager.md and
 * docs/implementation/firebase-contract.md ("Remote Config").
 */
export const PICKER_CONFIG_SCHEMA_VERSION = 1;

/** Sample layouts shipped in the app. A style reuses one of them. Same values as THEME_IDS. */
export const COMPOSITIONS = ['arcade', 'sticker', 'soft'] as const satisfies readonly ThemeId[];
export type Composition = ThemeId;

/** How the style name is drawn on its picker page. */
export const NAME_TREATMENTS = ['accent', 'sticker', 'serif'] as const;
export type NameTreatment = (typeof NAME_TREATMENTS)[number];

export const HEADING_FONTS = ['sans', 'serif'] as const;
export type HeadingFont = (typeof HEADING_FONTS)[number];

/** A style id: bundled ('sticker' | 'arcade' | 'soft') or defined by a config. */
export type StyleId = string;
export const STYLE_ID_PATTERN = /^[a-z][a-z0-9-]{1,23}$/;

export const PICKER_COLOR_TOKENS = [
  'canvas',
  'surface',
  'text',
  'muted',
  'primary',
  'onPrimary',
  'border',
  'accent',
  'success',
  'danger',
] as const;
export type PickerColorToken = (typeof PICKER_COLOR_TOKENS)[number];

/** Copy is either an existing localization key, or literal text for all six locales. */
export type PickerCopy = { key: string } | { text: Record<HouseGainsLocale, string> };

export type PickerStyleTokens = Record<PickerColorToken, string> & {
  radius: number;
  borderWidth: number;
};

/** One style as written in the config JSON. */
export type PickerStyleConfig = {
  id: StyleId;
  enabled?: boolean;
  order: number;
  composition: Composition;
  nameTreatment: NameTreatment;
  headingFont: HeadingFont;
  copy: { name: PickerCopy; description: PickerCopy };
  tokens: PickerStyleTokens;
};

export type PickerConfig = {
  schemaVersion: typeof PICKER_CONFIG_SCHEMA_VERSION;
  styles: PickerStyleConfig[];
};

/** A validated style with full app tokens (config colours merged over the composition's bundled tokens). */
export type PickerStyle = {
  id: StyleId;
  enabled: boolean;
  order: number;
  composition: Composition;
  nameTreatment: NameTreatment;
  headingFont: HeadingFont;
  copy: { name: PickerCopy; description: PickerCopy };
  tokens: AppearanceTokens;
};

export type PickerValidation = {
  /** false when the whole config must be ignored (R1, R3). */
  ok: boolean;
  /** Valid styles, in input order, including disabled ones. Empty when ok is false. */
  styles: PickerStyleConfig[];
  errors: string[];
  warnings: string[];
};

export type PickerConfigSource = 'bundled' | 'remote' | 'bundled-fallback';

export type ResolvedPickerStyles = {
  source: PickerConfigSource;
  /** Every valid style (enabled or not), used to resolve a saved choice. */
  all: PickerStyle[];
  /** Enabled styles sorted by order, then id. These are the picker pages. */
  visible: PickerStyle[];
  errors: string[];
  warnings: string[];
};
