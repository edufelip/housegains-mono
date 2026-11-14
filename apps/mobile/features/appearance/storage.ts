import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEME_IDS, type AppearancePreference, type ThemeId } from './types';

export const APPEARANCE_STORAGE_KEY = 'housegains.appearance.v1';

export type AppearanceReadResult =
  { status: 'present'; themeId: ThemeId } | { status: 'absent' | 'invalid' };

function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

function parsePreference(value: string | null): AppearanceReadResult {
  if (value === null) return { status: 'absent' };

  try {
    const record: unknown = JSON.parse(value);
    if (typeof record !== 'object' || record === null) return { status: 'invalid' };
    const preference = record as Partial<AppearancePreference>;
    if (preference.version !== 1 || !isThemeId(preference.themeId)) return { status: 'invalid' };
    return { status: 'present', themeId: preference.themeId };
  } catch {
    return { status: 'invalid' };
  }
}

/** Reads and validates the device-local theme selection. Storage errors propagate for retry UI. */
export async function readAppearancePreference(): Promise<AppearanceReadResult> {
  const value = await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY);
  return parsePreference(value);
}

/** Writes a validated choice to the versioned, device-local storage key. */
export async function writeAppearancePreference(themeId: ThemeId): Promise<void> {
  if (!isThemeId(themeId)) throw new TypeError('Unsupported HouseGains theme.');
  const preference: AppearancePreference = { version: 1, themeId };
  await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(preference));
}
