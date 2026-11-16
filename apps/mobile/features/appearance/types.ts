export const THEME_IDS = ['arcade', 'sticker', 'soft'] as const;

export type ThemeId = (typeof THEME_IDS)[number];
export type HouseGainsTheme = ThemeId;

/** Typography roles. Screens pick a role; they never set size, family or weight directly. */
export const TYPE_ROLES = [
  'display',
  'title',
  'heading',
  'body',
  'caption',
  'eyebrow',
  'button',
  'code',
] as const;

export type TypeRole = (typeof TYPE_ROLES)[number];

export type TypeStyle = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700';
};

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
  /** Backdrop behind modals and sheets. */
  scrim: string;
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
  /** Role-based type scale (family resolved per theme). */
  type: Record<TypeRole, TypeStyle>;
  /** Minimum interactive sizes in dp: `min` is the floor, `comfortable` is the default control height. */
  touchTarget: { min: number; comfortable: number };
  /** Icon sizes in dp. */
  iconSize: { sm: number; md: number; lg: number };
  /** Opacity for interaction states. Never use opacity alone to convey meaning. */
  stateOpacity: { pressed: number; disabled: number };
  /** Screen layout constants in dp. */
  layout: { gutter: number; maxContentWidth: number };
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
