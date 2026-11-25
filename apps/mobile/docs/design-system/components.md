# Component catalog

Use these before writing anything new. Each entry lists what it is for, its props, and how it behaves. Source: `components/housegains/ui.tsx` unless noted.

Every component reads tokens, so each renders correctly in all three themes.

## Layout

### `Screen`
The root of every screen.

| Prop | Default | Notes |
|---|---|---|
| `scrollable` | `true` | `false` for screens that manage their own scroller or pin a dock |
| `edges` | all four | Safe-area edges to inset; remove `bottom` only if a bottom dock handles it |
| `contentContainerStyle` | none | Add `padding: tokens.layout.gutter` here |
| `testID` | none | Required for screens, to be reachable by tests |

Provides the `canvas` background, safe areas, keyboard tap handling, and the max content width. Does **not** add padding.

### `Card`
A raised `surface` container with the theme's border, radius, and shadow. Padding is `spacing.md`. Accepts all `View` props, including `accessibilityRole`. Use for any grouped content or list row. Do not nest cards; separate inner groups with spacing or a divider (`border` hairline).

## Text

### `Label`
All text goes through `Label`. Never use a bare `Text` with ad-hoc styles.

| `variant` | Role | Color |
|---|---|---|
| `display` | 32/38 headline number | `text` |
| `title` | 26/32 screen title | `text` |
| `heading` | 21/27 section heading | `text` |
| `body` (default) | 16/23 | `text` |
| `caption` | 13/18 | `muted` |
| `eyebrow` | 12/16 | `muted` |
| `code` | 20/26 mono | `text` |

`style` may override layout (`textAlign`, margins) and, when a status requires it, `color` from a token. It must not override size, family, or weight; pick another variant instead. Text scales with the system font size.

### `ScreenTitle` *(features/housegains-screens/screen-elements.tsx)*
Optional `eyebrow`, a `title`, and an optional `description` stacked with consistent spacing. Use at the top of every screen.

## Actions

### `Button`

| Prop | Notes |
|---|---|
| `title` | Visible label (from a localization key) |
| `onPress` | Handler |
| `variant` | `primary` (default), `secondary`, `outline`, `ghost` |
| `disabled` | Dims to `stateOpacity.disabled`, removes shadow, exposes `disabled` to assistive tech |
| `accessibilityLabel` | Only when the visible title is not enough; defaults to `title` |
| `testID` | Required when tests press it |
| `themeId` | Previews of another theme only |

Hierarchy: **one `primary` per screen or sheet.** Use `secondary` for the alternative, `outline` for a lighter alternative, `ghost` for tertiary and "cancel". A destructive confirmation uses `primary` inside a confirming sheet, with the destructive wording in the title and a `danger`-colored message; there is no separate danger variant.

States: default, pressed (opacity `stateOpacity.pressed`, tiny scale), focused (border switches to `accent`), disabled. Minimum height `touchTarget.comfortable` (48). The label wraps rather than truncating. A busy button should be `disabled` and show progress in context (for example an adjacent `ActivityIndicator`), never go silent.

### `ChoiceChip` *(screen-elements.tsx)*
A toggle pill: `title`, `selected`, `onPress`. Selected fills with `primary` and uses `onPrimary` text, and exposes `accessibilityState.selected`. Because fill is color, **the selected state must also be conveyed another way when chips look similar** (a check icon or a label change). Min height 44. Use for single or multi choice among few options (assignees, frequency). For many options use a list.

## Inputs

### `FormField` *(screen-elements.tsx)*
A labeled `TextInput`: an `eyebrow` label above a `surface` input with the theme border and radius, 52 dp tall. The label doubles as `accessibilityLabel`. Pass any `TextInput` prop (`keyboardType`, `secureTextEntry`, `autoComplete`, `value`, `onChangeText`). Validation errors go in a `Label` below the field in `danger` with an icon or leading text, never color only ([patterns.md](patterns.md)).

## People

### `MemberBadge` *(screen-elements.tsx)*
A circular initials badge in the member's own color (default 46 dp). Pressable when `onPress` is set (exposes `selected`). The initials are always paired with a name elsewhere (chip text, row label); the badge alone is not an identifier. Member color is data and does not follow the theme.

## States

### `StatePanel`
The one way to show loading, empty, error, demo, and unavailable.

| Prop | Notes |
|---|---|
| `kind` | `loading`, `empty`, `error`, `demo`, `unavailable` |
| `title` | Required, short, states the situation |
| `description` | Optional, says what to do or why |
| `actionTitle` + `onAction` | Both required to show the action (retry, create) |
| `testID` | Action gets `${testID}.action` |

Each kind has an icon plus the title text (never color alone). `error` is announced as an alert. `loading` shows a spinner and is a polite live region. The action is `primary` for `error` and `secondary` otherwise. See [patterns.md](patterns.md#states).

## Icons

### `HouseGainsGlyph` *(screen-elements.tsx)*
Renders a stored chore emoji as an Ionicon. `size` defaults to 22. Color defaults to `tokens.text`.

## Composition components

| Component | Where | Notes |
|---|---|---|
| `LanguagePicker` | `components/housegains/language-picker.tsx` | Locale list with busy and retry handling. Required in settings and onboarding |
| `ThemePreview` | `components/housegains/theme-preview.tsx` | Renders the sample chore and score data in a given theme. Used by the appearance picker only |
| `ArcadeDock`, `StickerDock`, `SoftDock` | `components/housegains/variants/` | Bottom navigation (`tablist`) with a raised create action |
| `ArcadeDashboard`, `StickerDashboard`, `SoftDashboard` | `components/housegains/variants/` | Per-theme dashboard compositions over shared `DashboardProps` |
| `ReportSheet` | `features/housegains-screens/household-safety.tsx` | Modal sheet using the `scrim` token; the model for new sheets |

## Motion and gamification components

Built for the Ganhos & Zelo program (see [motion-and-haptics.md](motion-and-haptics.md)). They read tokens only, expose no color props, and every animation goes through `components/housegains/gamification/motion.ts` (`timed`, `springed`, `useCountUp`), which passes `reduceMotion: ReduceMotion.System`, plus `useMotionReduced()` for the static layout.

### `GanhosToast` *(components/housegains/gamification/ganhos-toast.tsx)*
An earned toast.

| Prop | Notes |
|---|---|
| `title`, `detail` | Text from localization keys; `detail` is the breakdown or badge detail |
| `amount`, `formatAmount` | Final amount; the visible number counts up (500 ms) while text and `accessibilityLabel` carry the final value |
| `announcement` | The same copy, announced with `AccessibilityInfo.announceForAccessibility` |
| `dismissLabel`, `onDismiss` | Tap dismisses; it also dismisses itself after 2.4 s (3 s with reduced motion) |
| `icon` | An Ionicons name |

Slides down with a spring (damping 18), radial particle burst (12 particles, 700 ms). The full-screen wrapper is `pointerEvents="box-none"`, so the list underneath stays interactive. Reduced motion: opacity fade, final number, no particles. Themes: surface, border, radius and shadow tokens.

### `AchievementMedal` *(achievement-medal.tsx)*
An icon in a disc with a tier ring and 1 to 3 pips (bronze 1, silver 2, gold 3), so the tier is never color alone. `tier` undefined draws the locked medal; `paused` dims an active badge that lapsed; `animate` runs the unlock (scale from 0.4 with one turn in 600 ms, ring draws in 500 ms). Tier colors: bronze `accent`, silver `muted`, gold `primary`. Decorative: callers always render the name and tier as text.

### `ProgressRing` *(progress-ring.tsx)*
An SVG ring: `size`, `strokeWidth`, `color`, `trackColor` (tokens), `fraction` with `durationMs` for a sweep, or an external `progress` shared value (the level-up sequence). The value is always also in text next to it.

### `ParticleBurst` *(particles.tsx)*
Decorative particles (`radial` for toasts, `fall` for the unlock confetti), deterministic, hidden from screen readers, not rendered with reduced motion.

### Feature screens and cards *(features/gamification/)*
`AchievementUnlockScreen` (full screen), `LevelUpMoment`, `CelebrationHost` (renders the active celebration from the queue; renders nothing when the program is not visible), `CompletionBadges` (section inside S3), `WalletScreen`, `WeeklyStreakScreen`, `OrganizerCard`, `GanhosChip`. They compose `Screen`, `Card`, `Label`, `Button` and `StatePanel`; loading, error-with-retry and empty states use `StatePanel`.

## Adding a component

1. Check this catalog and `screen-elements.tsx`. If something similar exists, extend it.
2. Build it against `AppearanceTokens` only. No raw values; no `themeId` branches (unless it is a [variant](theming.md#when-a-per-theme-variant-is-allowed)).
3. Define props with an explicit type, accept `testID`, and expose accessibility props (`accessibilityLabel`, role, state).
4. Handle every state it can be in: default, pressed, focused, disabled, loading, error where applicable.
5. Put it in `components/housegains/` (shared) or next to the feature (single use).
6. Add a component test in `tests/component/` (render in at least two themes if appearance matters).
7. Add its entry here: purpose, props, states, per-theme behavior.

## Do and don't

| Do | Don't |
|---|---|
| `<Label variant="caption">` | `<Text style={{ fontSize: 13, color: '#666' }}>` |
| `padding: tokens.spacing.md` | `padding: 15` |
| `borderRadius: tokens.radius` | `borderRadius: 14` |
| One primary `Button` per screen | Two equal primary buttons |
| `StatePanel kind="error"` with a retry | A blank screen or an alert that vanishes |
| Selected chip: fill **and** check or label | Selected chip: color only |
| Pressable at least 44 dp | A 24 dp icon with no hit area |
