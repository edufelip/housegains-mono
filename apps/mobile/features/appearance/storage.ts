import AsyncStorage from '@react-native-async-storage/async-storage';
import { STYLE_ID_PATTERN, type StyleId } from './picker-config-types';
import { THEME_IDS, type AppearancePreference, type ThemeId } from './types';

export const APPEARANCE_STORAGE_KEY = 'housegains.appearance.v1';

export type AppearanceReadResult =
  { status: 'present'; themeId: StyleId; composition?: ThemeId } | { status: 'absent' | 'invalid' };

function isStyleId(value: unknown): value is StyleId {
  return typeof value === 'string' && STYLE_ID_PATTERN.test(value);
}

function isComposition(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

function parsePreference(value: string | null): AppearanceReadResult {
  if (value === null) return { status: 'absent' };

  try {
    const record: unknown = JSON.parse(value);
    if (typeof record !== 'object' || record === null) return { status: 'invalid' };
    const preference = record as Partial<AppearancePreference>;
    if (preference.version !== 1 || !isStyleId(preference.themeId)) return { status: 'invalid' };
    return isComposition(preference.composition)
      ? { status: 'present', themeId: preference.themeId, composition: preference.composition }
      : { status: 'present', themeId: preference.themeId };
  } catch {
    return { status: 'invalid' };
  }
}

/** Reads and validates the device-local style selection. Storage errors propagate for retry UI. */
export async function readAppearancePreference(): Promise<AppearanceReadResult> {
  const value = await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY);
  return parsePreference(value);
}

/** Writes a validated choice to the versioned, device-local storage key. */
export async function writeAppearancePreference(
  themeId: StyleId,
  composition?: ThemeId,
): Promise<void> {
  if (!isStyleId(themeId)) throw new TypeError('Unsupported HouseGains style id.');
  const preference: AppearancePreference = isComposition(composition)
    ? { version: 1, themeId, composition }
    : { version: 1, themeId };
  await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(preference));
}
