import { Platform } from 'react-native';
import { DsFontFamily } from '@/constants/design-system';
import type { AppearanceTokens, ThemeId } from './types';

const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

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
      body: DsFontFamily.body,
      heading: DsFontFamily.bold,
      bold: DsFontFamily.bold,
      medium: DsFontFamily.medium,
      mono: DsFontFamily.mono,
    },
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
      body: DsFontFamily.body,
      heading: DsFontFamily.bold,
      bold: DsFontFamily.bold,
      medium: DsFontFamily.medium,
      mono: DsFontFamily.mono,
    },
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
      body: DsFontFamily.body,
      heading: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) ?? 'serif',
      bold: DsFontFamily.bold,
      medium: DsFontFamily.medium,
      mono: DsFontFamily.mono,
    },
  },
};

export function getThemeTokens(themeId: ThemeId): AppearanceTokens {
  return THEME_TOKENS[themeId];
}

export { THEME_TOKENS };
