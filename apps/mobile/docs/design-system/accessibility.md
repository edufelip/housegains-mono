# Accessibility

The minimum bar for every new screen. HouseGains targets **WCAG 2.2 AA** where it applies to native apps, plus platform guidance (iOS and Android).

## Contrast

Measured (WCAG contrast ratio) from the values in `tokens.ts`. Thresholds: 4.5:1 for normal text, 3:1 for large text (at least 24 dp, or 18.66 dp bold) and for non-text UI such as icons and control boundaries.

| Pair | Arcade | Sticker Pop | Soft Home |
|---|---|---|---|
| `text` on `canvas` | 17.4 | 18.0 | 14.4 |
| `text` on `surface` | 15.9 | 18.4 | 16.0 |
| `muted` on `canvas` | 6.2 | 10.0 | 6.3 |
| `muted` on `surface` | 5.6 | 10.2 | 6.9 |
| `onPrimary` on `primary` | 14.5 | 5.2 | **4.47** |
| `primary` on `surface` | 13.2 | 5.2 | 4.47 |
| `primary` on `canvas` | 14.5 | 5.1 | **4.04** |
| `border` on `surface` | **1.4** | 18.9 | **1.3** |

`tests/component/design-tokens.test.ts` guards the pairs that pass (4.5:1) and pins the known gaps below so they cannot silently get worse.

### Known gaps

These are recorded, not fixed. They are design decisions to make in a separate change; changing a theme color changes the reference.

1. **Soft Home `onPrimary` on `primary`: 4.47:1.** Button labels (16 dp, semibold) are just under 4.5:1. Soft `primary` on `canvas` is 4.04:1. Mitigation for new UI: do not use Soft `primary` for small text on `canvas`; use it for fills and icons.
2. **Sticker Pop `accent`, `success`, `danger` on white: 1.6 to 2.8:1.** These are fills with a black outline and a text label, never text. Never put them on text.
3. **Arcade and Soft `border`: 1.3 to 1.5:1.** Hairline borders are decorative; do not rely on them as the only cue that a control exists (give inputs a `surface` fill and a visible label).
4. **`ChoiceChip` selected state** is color (fill) plus `accessibilityState.selected`, with no visible non-color cue. New chip-like selectors must add a check icon or label change.
5. **Dock tab labels in the variants are 10 dp**, below the 12 dp floor. Do not copy this size.

## Touch targets

- Every pressable is **at least 44 × 44 dp** (`tokens.touchTarget.min`). Default control height is 48 (`comfortable`).
- Small visuals (a 24 dp icon) still get a 44 dp hit area: use `hitSlop` or padding, not a bigger icon.
- Keep at least 8 dp between adjacent targets.
- Sticker tilt and decoration must not shrink or move the touch area.

## Names, roles, and state

- Every control has an accessible name (the visible text, or `accessibilityLabel` when it is an icon). Names are localized.
- Set `accessibilityRole` (`button`, `tab`, `header`, `progressbar`, `alert`, `link`, `image`).
- Expose state, not just color: `accessibilityState={{ selected, disabled, checked, busy, expanded }}`.
- Group a row's text into one accessible unit when it reads as a sentence; keep inner actions separately focusable.
- Headings use `accessibilityRole="header"` so users can jump between sections.
- Decorative images and icons are hidden from assistive tech.
- Progress, XP, and rank are available as text values, not only as a drawn bar or ring.

## Status is never color alone

Completed, error, selected, due, bonus, and online/offline always have text or an icon in addition to color. A user who cannot distinguish red from green, or who uses a monochrome display, must still get the full meaning.

## Focus and keyboard

- Logical focus order follows reading order. After opening a sheet, focus starts inside it; after closing, return to the trigger.
- Interactive elements are focusable (`focusable`) and show a visible focus state. `Button` switches its border to `accent` on focus.
- External keyboards and switch access can reach and operate everything.
- Forms: errors move focus to the first invalid field.

## Dynamic type and zoom

- Leave `allowFontScaling` on. Use `minHeight`, not `height`, for text containers.
- Test at the largest system text size on the smallest phone: no clipped or overlapping text, controls still reachable, content scrolls.
- Do not rely on single-line layouts for translated strings; German and Portuguese run long.

## Motion and sound

See [motion-and-haptics.md](motion-and-haptics.md). Reduced motion must be honored; sound and animation never carry required information.

## Test it

- Component tests assert roles, names, and states (`accessibilityState.selected`, `accessibilityRole`).
- Manually run VoiceOver (iOS) and TalkBack (Android) on any new flow, at least once, before it ships.
- Check all three themes: contrast and focus differ.
