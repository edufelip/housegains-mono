export const THEME_IDS = ['arcade', 'sticker', 'soft'] as const;

export type ThemeId = (typeof THEME_IDS)[number];
export type HouseGainsTheme = ThemeId;

export type AppearanceTokens = {
  canvas: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  onPrimary: string;
  border: string;
  accent: string;
  success: string;
  danger: string;
  radius: number;
  borderWidth: number;
  shadow: {
    color: string;
    offset: { width: number; height: number };
    opacity: number;
    radius: number;
    elevation: number;
  };
  spacing: {
    xxs: number;
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  typography: {
    body: string;
    heading: string;
    bold: string;
    medium: string;
    mono: string;
  };
};

/**
 * Saved choice. `themeId` is a style id (bundled or config-defined, see picker-config-types.ts);
 * `composition` records the style's layout so a later-hidden style can still be resolved (rule R6).
 */
export type AppearancePreference = {
  version: 1;
  themeId: string;
  composition?: ThemeId;
};
