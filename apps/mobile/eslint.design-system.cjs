/**
 * Design-system lint (docs/design-system/enforcement.md).
 *
 * In screen and component files (`features/**` and `components/**` `.tsx`), raw
 * visual values are errors: hex/rgb colors, `fontFamily` strings, and numeric
 * `fontSize`. New UI reads them from the theme tokens
 * (`useAppearance().tokens`) instead.
 *
 * Files that predate the design system are listed in LEGACY_FILES and report
 * warnings only, so CI (`eslint --quiet`) stays green while they are migrated.
 * The list may only shrink: remove a file once it is clean, and never add one.
 */
const LEGACY_FILES = [
  'components/housegains/phone-preview.tsx',
  'components/housegains/theme-preview.tsx',
  'components/housegains/variants/arcade-dashboard.tsx',
  'components/housegains/variants/soft-dashboard.tsx',
  'components/housegains/variants/sticker-dashboard.tsx',
  'features/auth/sign-in-screen.tsx',
  'features/housegains-screens/chore-completion-screens.tsx',
  'features/housegains-screens/chore-management-screens.tsx',
  'features/housegains-screens/create-household-screen.tsx',
  'features/housegains-screens/household-flow-screens.tsx',
  'features/housegains-screens/invite-qr-view.tsx',
  'features/housegains-screens/screen-elements.tsx',
  'features/onboarding/theme-picker-screen.tsx',
];

const MESSAGE =
  'Use design-system tokens (useAppearance().tokens) instead of raw visual values. See apps/mobile/docs/design-system/.';

const RESTRICTED = [
  {
    selector: 'Literal[value=/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
    message: `Hard-coded hex color. ${MESSAGE}`,
  },
  {
    selector: 'Literal[value=/^(rgb|rgba|hsl|hsla)\\(/]',
    message: `Hard-coded color function. ${MESSAGE}`,
  },
  {
    selector: "Property[key.name='fontFamily'] > Literal",
    message: `Hard-coded fontFamily. Use a type role (tokens.type.*). ${MESSAGE}`,
  },
  {
    selector: "Property[key.name='fontSize'] > Literal[raw=/^[0-9.]+$/]",
    message: `Hard-coded fontSize. Use a type role (tokens.type.*). ${MESSAGE}`,
  },
];

const FILES = ['features/**/*.tsx', 'components/**/*.tsx'];

module.exports = [
  {
    files: FILES,
    rules: { 'no-restricted-syntax': ['error', ...RESTRICTED] },
  },
  {
    files: LEGACY_FILES,
    rules: { 'no-restricted-syntax': ['warn', ...RESTRICTED] },
  },
];
