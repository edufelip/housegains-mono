# Theming

HouseGains ships **three complete visual compositions**. The user chooses one during onboarding and can change it later in Settings. The choice changes presentation only; chores, XP, assignments, and data are identical in every theme.

| Theme | `themeId` | Mood | Reference |
|---|---|---|---|
| Arcade | `arcade` | Energetic, dark, electric lime | [DESIGN.md](../../DESIGN.md#arcade) |
| Sticker Pop | `sticker` | Playful, outlined, hard shadows | [DESIGN.md](../../DESIGN.md#sticker-pop) |
| Soft Home | `soft` | Calm, pastel, serif headings | [DESIGN.md](../../DESIGN.md#soft-home) |

## How theming works

`ThemeProvider` (`features/appearance`) holds the selected theme and exposes it with `useAppearance()`:

```tsx
const { tokens, themeId } = useAppearance();
```

- `tokens` is the full `AppearanceTokens` object for the active theme: colors, `radius`, `borderWidth`, `shadow`, `spacing`, `typography`, `type`, `touchTarget`, `iconSize`, `stateOpacity`, `layout`.
- The provider hydrates the saved choice before the themed shell draws. Do not render themed UI before `hydrated`.
- While a user is previewing a theme (picker), `tokens` follows the preview; the saved choice changes only on Continue.
- `getThemeTokens(themeId)` returns tokens for a specific theme without the provider. Use it only to draw **previews of another theme** (the picker, `ThemePreview`) or to override a component with its `themeId` prop. Normal screens never pass `themeId`.

## The token contract

Every theme provides **every** token. A component written against `AppearanceTokens` therefore renders correctly in all three themes with no theme checks. That is the default, and the strongly preferred, way to build UI.

```tsx
// Good: one component, three correct renderings
<View style={{ backgroundColor: tokens.surface, borderColor: tokens.border,
  borderWidth: tokens.borderWidth, borderRadius: tokens.radius }} />

// Bad: theme checks and literals
<View style={{ backgroundColor: themeId === 'arcade' ? '#161B22' : '#fff' }} />
```

Adding a token: add the field to `AppearanceTokens` (`types.ts`), set it for **all three** themes (`tokens.ts`), document it in [foundations.md](foundations.md), and extend `tests/component/design-tokens.test.ts`.

## When a per-theme variant is allowed

A variant is a separate component per theme (`ArcadeDashboard`, `StickerDashboard`, `SoftDashboard`; `*Dock`) chosen by `themeId`. Variants exist because the three references differ in **composition**, not just color: where elements sit, what shape the score takes, how navigation looks.

Allowed when **all** are true:

1. The reference designs genuinely differ in layout or structure (not merely in color, radius, border, shadow, or heading font, which tokens already cover).
2. The screen is a hero or navigation surface (dashboard, dock, picker preview), not a form or a list row.
3. All variants consume the same props and domain logic (`DashboardProps`); a variant may change composition, never behavior.

Rules for variants:

- Live in `components/housegains/variants/`, exported from `variants/index.ts`, named `<Theme><Thing>`.
- Share data and actions; derive display values in shared model code (`screen-model`), not per variant.
- Each variant meets the same accessibility and state requirements ([accessibility.md](accessibility.md), [patterns.md](patterns.md)).
- Every variant uses tokens. A variant is not an excuse for raw literals.
- A new variant needs a test that renders it in all three themes.
- Document the difference in [components.md](components.md).

Choose the variant at one place, at the top of the screen:

```tsx
const { themeId } = useAppearance();
const Dashboard = themeId === 'arcade' ? ArcadeDashboard
  : themeId === 'sticker' ? StickerDashboard : SoftDashboard;
```

Do **not** sprinkle `themeId` conditions through a component's body.

## Theme-specific facts that affect new UI

- **Arcade** is dark: borders are hairlines (about 1.4:1 against surface). Do not rely on a border alone to show that a control exists; use fill and label as well.
- **Sticker Pop** relies on its 2.5 dp black outline for delimiting pastel fills; `accent`, `success`, and `danger` are too light to be text on white. Never use them as text color.
- **Soft Home** has a serif heading hierarchy and the largest radius. `primary` is slightly under AA for text on `canvas`; use it for fills, icons, and large or bold content, and keep body text in `text`.
- Sticker's tilted stickers and hard shadows are decoration: do not let tilt or shadow cost readability or touch area.
