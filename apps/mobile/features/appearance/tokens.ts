import { Platform } from 'react-native';
import type { AppearanceTokens, ThemeId, TypeRole, TypeStyle } from './types';

/**
 * Geist is the app typeface, loaded in app/_layout.tsx. Each role maps to a
 * specific static weight file (React Native does not reliably interpolate
 * variable-font weight), so `fontWeight` in the type scale always matches the
 * loaded cut. Geist Mono is reserved for codes (for example the invite code).
 */
export const FontFamily = {
  bold: 'Geist_700Bold',
  medium: 'Geist_500Medium',
  body: 'Geist_400Regular',
  mono: 'GeistMono_500Medium',
} as const;

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) ?? 'serif';

const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

/** Shared across all themes: spacing and sizing never change with the theme. */
const touchTarget = { min: 44, comfortable: 48 } as const;
const iconSize = { sm: 16, md: 22, lg: 28 } as const;
const stateOpacity = { pressed: 0.9, disabled: 0.52 } as const;
const layout = { gutter: 16, maxContentWidth: 720 } as const;
const scrim = 'rgba(0, 0, 0, 0.4)';

/** Sizes and line heights are shared; only the heading family varies by theme (Soft is serif). */
function buildType(heading: string): Record<TypeRole, TypeStyle> {
  return {
    display: { fontFamily: heading, fontSize: 32, lineHeight: 38, fontWeight: '700' },
    title: { fontFamily: heading, fontSize: 26, lineHeight: 32, fontWeight: '700' },
    heading: { fontFamily: heading, fontSize: 21, lineHeight: 27, fontWeight: '700' },
    body: { fontFamily: FontFamily.body, fontSize: 16, lineHeight: 23, fontWeight: '400' },
    caption: { fontFamily: FontFamily.body, fontSize: 13, lineHeight: 18, fontWeight: '400' },
    eyebrow: { fontFamily: FontFamily.medium, fontSize: 12, lineHeight: 16, fontWeight: '500' },
    button: { fontFamily: FontFamily.medium, fontSize: 16, lineHeight: 22, fontWeight: '600' },
    code: { fontFamily: FontFamily.mono, fontSize: 20, lineHeight: 26, fontWeight: '500' },
  };
}

const THEME_TOKENS: Record<ThemeId, AppearanceTokens> = {
  arcade: {
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
    scrim,
    radius: 14,
    borderWidth: 1,
    shadow: {
      color: '#76FF03',
      offset: { width: 0, height: 0 },
      opacity: 0.16,
      radius: 5,
      elevation: 1,
    },
    spacing,
    typography: {
      body: FontFamily.body,
      heading: FontFamily.bold,
      bold: FontFamily.bold,
      medium: FontFamily.medium,
      mono: FontFamily.mono,
    },
    type: buildType(FontFamily.bold),
    touchTarget,
    iconSize,
    stateOpacity,
    layout,
  },
  sticker: {
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
    scrim,
    radius: 18,
    borderWidth: 2.5,
    shadow: {
      color: '#111111',
      offset: { width: 4, height: 4 },
      opacity: 1,
      radius: 0,
      elevation: 4,
    },
    spacing,
    typography: {
      body: FontFamily.body,
      heading: FontFamily.bold,
      bold: FontFamily.bold,
      medium: FontFamily.medium,
      mono: FontFamily.mono,
    },
    type: buildType(FontFamily.bold),
    touchTarget,
    iconSize,
    stateOpacity,
    layout,
  },
  soft: {
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
    scrim,
    radius: 24,
    borderWidth: 1,
    shadow: {
      color: '#2F2454',
      offset: { width: 0, height: 5 },
      opacity: 0.08,
      radius: 14,
      elevation: 2,
    },
    spacing,
    typography: {
      body: FontFamily.body,
      heading: SERIF,
      bold: FontFamily.bold,
      medium: FontFamily.medium,
      mono: FontFamily.mono,
    },
    type: buildType(SERIF),
    touchTarget,
    iconSize,
    stateOpacity,
    layout,
  },
};

export function getThemeTokens(themeId: ThemeId): AppearanceTokens {
  return THEME_TOKENS[themeId];
}

export { THEME_TOKENS };
