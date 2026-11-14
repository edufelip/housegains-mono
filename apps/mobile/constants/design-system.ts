import type { TextStyle, ViewStyle } from 'react-native';

export type DsColorScheme = 'light' | 'dark';

export type DsTheme = {
  color: {
    canvas: string;
    shell: string;
    surface: string;
    surfaceMuted: string;
    surfaceElevated: string;
    surfaceWarning: string;
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    accentPrimary: string;
    actionPrimary: string;
    onActionPrimary: string;
    accentPrimaryHover: string;
    accentPrimarySoft: string;
    accentWarm: string;
    accentWarmSoft: string;
    disabledSurface: string;
    disabledText: string;
    disabledBorder: string;
    success: string;
    successSoft: string;
    warning: string;
    warningSoft: string;
    danger: string;
    dangerSoft: string;
    dangerBorder: string;
    readOnlyText: string;
    border: string;
    borderStrong: string;
    accentCyan: string;
    accentCyanSoft: string;
    onAccent: string;
    overlayNeutral: string;
    overlaySoft: string;
    overlayStrong: string;
  };
  blob: {
    topLeft: string;
    bottomRight: string;
  };
};

const THEME_BY_SCHEME: Record<DsColorScheme, DsTheme> = {
  light: {
    color: {
      canvas: '#f6f4f1',
      shell: '#ffffffb3',
      surface: '#ffffff',
      surfaceMuted: '#efece7',
      surfaceElevated: '#ffffff',
      surfaceWarning: '#fff3e0',
      textPrimary: '#14110f',
      textSecondary: '#5c5852',
      textTertiary: '#6b665f',
      accentPrimary: '#1f7a4c',
      actionPrimary: '#14110f',
      onActionPrimary: '#ffffff',
      accentPrimaryHover: '#175f3b',
      accentPrimarySoft: '#1f7a4c1a',
      accentWarm: '#a06813',
      accentWarmSoft: '#a068131a',
      disabledSurface: '#e4e0d9',
      disabledText: '#5c5852',
      disabledBorder: '#d3cec5',
      success: '#1f7a4c',
      successSoft: '#e3efe6',
      warning: '#b45309',
      warningSoft: '#ffedd5',
      danger: '#b3261e',
      dangerSoft: '#fee2e2',
      dangerBorder: '#fecaca',
      readOnlyText: '#9a3412',
      border: '#e4e0d9',
      borderStrong: '#d3cec5',
      accentCyan: '#06b6d4',
      accentCyanSoft: '#06b6d420',
      onAccent: '#fbf9f5',
      overlayNeutral: 'rgba(20, 17, 15, 0.32)',
      overlaySoft: 'rgba(31,122,76,0.4)',
      overlayStrong: 'rgba(31,122,76,0.85)',
    },
    blob: {
      topLeft: '#dcfce7',
      bottomRight: '#dbeafe',
    },
  },
  dark: {
    color: {
      canvas: '#0e0d0c',
      shell: '#00000066',
      surface: '#181716',
      surfaceMuted: '#242322',
      surfaceElevated: '#181716',
      surfaceWarning: '#3a2610',
      textPrimary: '#ffffff',
      textSecondary: '#b4b4b4',
      textTertiary: '#949494',
      accentPrimary: '#4ade80',
      actionPrimary: '#ffffff',
      onActionPrimary: '#0e0d0c',
      accentPrimaryHover: '#86efac',
      accentPrimarySoft: '#4ade8029',
      accentWarm: '#e0a838',
      accentWarmSoft: '#e0a83829',
      disabledSurface: '#242322',
      disabledText: '#b4b4b4',
      disabledBorder: '#2e2d2b',
      success: '#4ade80',
      successSoft: '#16301f',
      warning: '#f59e0b',
      warningSoft: '#3a2610',
      danger: '#ef4444',
      dangerSoft: '#7f1d1d66',
      dangerBorder: '#7f1d1d',
      readOnlyText: '#fdba74',
      border: '#2e2d2b',
      borderStrong: '#3d3b39',
      accentCyan: '#22d3ee',
      accentCyanSoft: '#22d3ee29',
      onAccent: '#0e1a12',
      overlayNeutral: 'rgba(8, 8, 8, 0.48)',
      overlaySoft: 'rgba(74,222,128,0.3)',
      overlayStrong: 'rgba(74,222,128,0.7)',
    },
    blob: {
      topLeft: '#16301f',
      bottomRight: '#12315f',
    },
  },
};

export const DsRadius = {
  sm: 12,
  md: 12,
  lg: 16,
  xl: 16,
  pill: 22,
} as const;

export const DsSpace = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

/**
 * "Night training" type system (D-219): Geist throughout, loaded via
 * @expo-google-fonts/geist and gated in app/_layout.tsx. Each role maps to a
 * specific static weight file (React Native doesn't reliably interpolate
 * variable-font weight), so fontWeight below always matches the loaded cut.
 * Geist Mono is reserved for the invite code.
 */
export const DsFontFamily = {
  display: 'Geist_700Bold',
  bold: 'Geist_700Bold',
  semibold: 'Geist_500Medium',
  medium: 'Geist_500Medium',
  body: 'Geist_400Regular',
  mono: 'GeistMono_500Medium',
} as const;

const TABULAR: TextStyle['fontVariant'] = ['tabular-nums'];

export const DsTypography: Record<
  'title' | 'screenTitle' | 'cardTitle' | 'body' | 'caption' | 'button' | 'micro' | 'figure',
  TextStyle
> = {
  title: {
    fontFamily: DsFontFamily.display,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
  screenTitle: {
    fontFamily: DsFontFamily.bold,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  cardTitle: {
    fontFamily: DsFontFamily.bold,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  body: {
    fontFamily: DsFontFamily.body,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  caption: {
    fontFamily: DsFontFamily.body,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    fontVariant: TABULAR,
  },
  button: {
    fontFamily: DsFontFamily.medium,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  micro: {
    fontFamily: DsFontFamily.medium,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    fontVariant: TABULAR,
  },
  // The one headline number per screen.
  figure: {
    fontFamily: DsFontFamily.bold,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
    fontVariant: TABULAR,
  },
} as const;

/**
 * "Night training" lifts surfaces by lightness only: `soft` (cards, groups,
 * icon buttons) carries no shadow. `floating` stays reserved for true overlays
 * (modals, the bulk-action tray), toned down.
 */
export const DsShadow: Record<'none' | 'soft' | 'floating', ViewStyle> = {
  none: {},
  soft: {},
  floating: {
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
};

export function getDsTheme(scheme: DsColorScheme): DsTheme {
  return THEME_BY_SCHEME[scheme];
}
