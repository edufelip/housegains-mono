# Foundations

Source of truth for values: [`features/appearance/tokens.ts`](../../features/appearance/tokens.ts). Everything below is read at runtime through `useAppearance().tokens`.

```tsx
const { tokens } = useAppearance();
<View style={{ backgroundColor: tokens.surface, borderRadius: tokens.radius, padding: tokens.spacing.md }} />
```

## Color

Colors are **roles**, not swatches. A role keeps its meaning in every theme; only the value changes.

| Role | Meaning | Use for | Never use for |
|---|---|---|---|
| `canvas` | Screen background | The ground behind everything | Cards or controls |
| `surface` | Raised container | Cards, inputs, chips, docks, sheets | Screen background |
| `text` | Primary text | Headings, body, control labels | Decorative fills |
| `muted` | Secondary text | Captions, eyebrows, helper text, placeholders | Anything the user must act on |
| `primary` | The main action and active state | Primary button fill, selected chips and tabs, progress fill, links and active icons | Large text blocks |
| `onPrimary` | Content placed on `primary` | Label and icon on a primary fill | Anything not on `primary` |
| `border` | Outline and divider | Card, input, and chip outlines | Text |
| `accent` | Supporting emphasis | Create action, bonus state, focus outline, highlights | Text (see [accessibility.md](accessibility.md)) |
| `success` | Completed or positive | Completed chore state, confirmations | Text on its own; always with a label or icon |
| `danger` | Destructive or error | Errors, destructive actions, validation | Text on its own in Sticker (see below) |
| `scrim` | Backdrop behind modals | `Modal` overlay background | Anything else |

Theme values:

| Role | Arcade | Sticker Pop | Soft Home |
|---|---|---|---|
| `canvas` | `#0D1117` | `#FFFDF0` | `#F5F2FB` |
| `surface` | `#161B22` | `#FFFFFF` | `#FFFFFF` |
| `text` | `#F0F6FC` | `#141414` | `#241E37` |
| `muted` | `#8B949E` | `#414141` | `#5D566F` |
| `primary` | `#76FF03` | `#2563EB` | `#6366F1` |
| `onPrimary` | `#0D1117` | `#FFFFFF` | `#FFFFFF` |
| `border` | `#30363D` | `#111111` | `#E4DFF0` |
| `accent` | `#FF8A4C` | `#FBBF24` | `#F4B38E` |
| `success` | `#76FF03` | `#10B981` | `#167F6A` |
| `danger` | `#FF6B63` | `#F87171` | `#B4233B` |

Rules:

- **Pair roles as designed.** Text on `canvas`/`surface` is `text` or `muted`; content on `primary` is `onPrimary`. Other pairings are not guaranteed to be readable.
- **Do not invent colors, tints, or opacities for meaning.** Need a new role? Add it to `tokens.ts` and `types.ts` for all three themes, document it here, and extend the contrast test.
- **Member colors are data, not theme.** Each member has their own color; text on it is fixed dark (`MemberBadge`). They do not change with the theme.
- **The theme is the appearance.** Arcade is dark; Sticker Pop and Soft Home are light. App colors never follow the system light/dark setting (`app/_layout.tsx` sets the status bar from the theme). The system setting only affects native chrome such as the keyboard and system alerts.

## Typography

Typeface: **Geist** (400, 500, 700) and **Geist Mono** (500), loaded in `app/_layout.tsx`. Soft Home replaces the heading family with the platform serif (Georgia on iOS, `serif` on Android); this is part of the reference and must not be substituted.

Pick a **role**; never set size, family, or weight yourself. `Label` and `Button` already do this.

| Role | Size / line | Weight | Family | Use for |
|---|---|---|---|---|
| `display` | 32 / 38 | 700 | heading | The one headline number on a screen (XP total, score) |
| `title` | 26 / 32 | 700 | heading | Screen title (`ScreenTitle`) |
| `heading` | 21 / 27 | 700 | heading | Section and card headings |
| `body` | 16 / 23 | 400 | body | Default text, input text |
| `caption` | 13 / 18 | 400 | body | Helper text, timestamps, secondary details (`muted`) |
| `eyebrow` | 12 / 16 | 500 | medium | Field labels, small overlines (`muted`) |
| `button` | 16 / 22 | 600 on the Medium cut | medium | Button labels |
| `code` | 20 / 26 | 500 | mono | Invite codes and other codes only |

Rules:

- **Minimum 12.** Nothing meaningful is smaller than `eyebrow`. Body copy is 16.
- **Numbers that change or compare** (XP, scores, ranks, counts) should use tabular figures: `fontVariant: ['tabular-nums']` so digits do not jump.
- **Text scales.** Leave `allowFontScaling` on (the default). Use `minHeight`, not `height`, on anything that holds text. Layouts must survive the largest accessibility size.
- **Sentence case**, no ALL-CAPS strings in copy (uppercase breaks in some locales); style with the role, not the text.
- **One serif use.** Only the heading roles change family in Soft Home; body stays Geist.

## Spacing

One scale for all themes: `tokens.spacing` = **4, 8, 12, 16, 20, 24, 32** (`xxs`–`xxl`).

| Use | Value |
|---|---|
| Screen gutter | `tokens.layout.gutter` (16); `Screen` does not add it, so apply it as the content padding |
| Card padding | `md` (16), set by `Card` |
| Gap between sections | `xl` (24) |
| Gap between items in a stack | `sm` (12) |
| Gap inside a control or between inline items | `xs` (8) |
| Tight pairs (title + description) | `xxs` (4) to `xs` (8) |

The screen content column is capped at `tokens.layout.maxContentWidth` (720) and centered, so tablets and web do not stretch lines.

> **Legacy note.** Older screens use off-scale values (10, 13, 18). Do not copy them. Spacing is not lint-enforced (too many valid uses); it is checked in review.

## Shape

- **Radius:** `tokens.radius` is the theme's card/control radius: Arcade 14, Sticker 18, Soft 24. Use it for cards, inputs, buttons, and sheets.
- **Pills and circles:** `999` for chips and `size / 2` for avatars. These are shape constants, not theme values.
- **Nesting:** an inner element inside padding `p` uses `radius - p`, never less than 4.
- **Touch targets:** `tokens.touchTarget.min` (44) is the floor for any pressable; `comfortable` (48) is the default control height.

## Borders and elevation

Themes differ in how they separate surfaces. Read the tokens; do not hand-roll shadows (`tokenShadowStyle(tokens.shadow)` converts them).

| | Arcade | Sticker Pop | Soft Home |
|---|---|---|---|
| Border width | 1 | 2.5 | 1 |
| Shadow | Faint lime glow (0, 0, r 5, 16%) | Hard offset (4, 4, r 0, 100%) | Soft drop (0, 5, r 14, 8%) |
| Character | Flat and technical | Chunky and outlined | Airy and calm |

Platform note: Android renders `elevation` as a soft shadow and ignores the shadow offset, so Sticker Pop's hard offset shadow is approximated on Android. Do not rely on the shadow to carry meaning.

## Iconography

- **Library:** Ionicons from `@expo/vector-icons`, **outline** variants (`*-outline`) to match the existing set.
- **Sizes:** `tokens.iconSize` sm 16, md 22 (default), lg 28.
- **Color:** from tokens (`text`, `muted`, `primary`, `danger`). Never a raw color.
- **Meaning:** an icon that carries meaning has a text label or an `accessibilityLabel` on its control. A purely decorative icon is hidden from assistive tech (`accessibilityElementsHidden`, `importantForAccessibility="no"`).
- **Chore icons** are stored as emoji in data; render them through `HouseGainsGlyph`, which maps them to Ionicons. Do not render emoji as UI icons.

## Layout

- Use `Screen` for every screen: it handles safe areas, the `canvas` background, scrolling, the keyboard (`keyboardShouldPersistTaps="handled"`), and the max content width.
- Design for the smallest supported phone first, then verify tablet width.
- Stack vertically. Use rows only for short, fixed-meaning content (icon + label, chip lists that wrap).
- Chip and badge lists **wrap** (`flexWrap: 'wrap'`); they do not scroll sideways unless it is an intentional carousel with position indicators (the appearance picker).
