import { Platform } from 'react-native';
import { BUNDLED_PICKER_CONFIG, validatePickerConfig, visibleStyleConfigs } from './picker-config';
import { buildType, FontFamily, getThemeTokens } from './tokens';
import type {
  PickerConfigSource,
  PickerStyle,
  PickerStyleConfig,
  ResolvedPickerStyles,
  StyleId,
} from './picker-config-types';
import type { ThemeId } from './types';

const SERIF_FAMILY =
  Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) ?? 'serif';

/** Merges a config style's colours over its composition's bundled tokens (spacing, typography, shadow). */
export function toPickerStyle(config: PickerStyleConfig): PickerStyle {
  const base = getThemeTokens(config.composition);
  const { radius, borderWidth, ...colours } = config.tokens;
  const shadowColor =
    config.composition === 'sticker'
      ? colours.border
      : config.composition === 'arcade'
        ? colours.primary
        : base.shadow.color;
  const heading = config.headingFont === 'serif' ? SERIF_FAMILY : FontFamily.bold;
  return {
    id: config.id,
    enabled: config.enabled !== false,
    order: config.order,
    composition: config.composition,
    nameTreatment: config.nameTreatment,
    headingFont: config.headingFont,
    copy: config.copy,
    tokens: {
      ...base,
      ...colours,
      radius,
      borderWidth,
      shadow: { ...base.shadow, color: shadowColor },
      typography: { ...base.typography, heading },
      // The role scale follows the resolved heading, or Label headings ignore the config.
      type: buildType(heading),
    },
  };
}

function build(
  styles: PickerStyleConfig[],
  source: PickerConfigSource,
  errors: string[],
  warnings: string[],
): ResolvedPickerStyles {
  return {
    source,
    all: styles.map(toPickerStyle),
    visible: visibleStyleConfigs(styles).map(toPickerStyle),
    errors,
    warnings,
  };
}

let bundledCache: ResolvedPickerStyles | null = null;

/** The bundled config, validated once. */
export function bundledPickerStyles(): ResolvedPickerStyles {
  if (!bundledCache) {
    const result = validatePickerConfig(BUNDLED_PICKER_CONFIG);
    bundledCache = build(result.styles, 'bundled', result.errors, result.warnings);
  }
  return bundledCache;
}

/**
 * Resolves the styles to show. `raw` is the activated remote value (null when there is none).
 * A rejected remote config falls back to the bundled one and keeps its errors for logging (R1, R3).
 */
export function resolvePickerStyles(raw: unknown | null): ResolvedPickerStyles {
  if (raw === null || raw === undefined) return bundledPickerStyles();
  const result = validatePickerConfig(raw);
  if (!result.ok) {
    const bundled = bundledPickerStyles();
    return {
      ...bundled,
      source: 'bundled-fallback',
      errors: result.errors,
      warnings: result.warnings,
    };
  }
  return build(result.styles, 'remote', result.errors, result.warnings);
}

/**
 * R6: a saved style keeps working even when the active config hides or drops it.
 * Order: the active config (enabled or not) → the bundled style with that id → the bundled style with the
 * saved composition → the first visible style.
 */
export function findStyleForSelection(
  id: StyleId | null,
  composition: ThemeId | undefined,
  resolved: ResolvedPickerStyles,
): PickerStyle {
  const bundled = bundledPickerStyles();
  if (id) {
    const active = resolved.all.find((style) => style.id === id);
    if (active) return active;
    const bundledById = bundled.all.find((style) => style.id === id);
    if (bundledById) return bundledById;
    if (composition) {
      const bundledByComposition = bundled.all.find((style) => style.composition === composition);
      if (bundledByComposition) return bundledByComposition;
    }
    // A saved id we cannot place: use the first bundled style, never a remote-only one.
    return bundled.visible[0];
  }
  return resolved.visible[0] ?? bundled.visible[0];
}
