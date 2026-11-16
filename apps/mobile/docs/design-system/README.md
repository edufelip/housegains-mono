# HouseGains design system

The single source for how HouseGains UI looks, behaves, and is built. **All new UI is built from this system.** Code that disagrees with it is a bug in the code or in this document; fix one of them in the same change.

| Document | What it covers |
|---|---|
| [foundations.md](foundations.md) | Color roles, typography, spacing, shape, borders, elevation, icons, layout |
| [theming.md](theming.md) | The three themes, the token contract, and when a per-theme variant is allowed |
| [components.md](components.md) | Component catalog: anatomy, props, states, per-theme behavior, do/don't |
| [patterns.md](patterns.md) | Screen anatomy and recurring patterns: states, forms, lists, XP and progress, assignees, sheets, navigation |
| [accessibility.md](accessibility.md) | Contrast measurements and known gaps, touch targets, labels, focus, dynamic type |
| [motion-and-haptics.md](motion-and-haptics.md) | Motion rules, reduced motion, sound and haptics |
| [content-and-localization.md](content-and-localization.md) | Copy rules and the six-locale requirement |
| [enforcement.md](enforcement.md) | Lint rule, tests, the legacy allowlist, and the review gate |

Visual authority for the three themes is [DESIGN.md](../../DESIGN.md) (direction and reference screenshots). Values live in code: [`features/appearance/tokens.ts`](../../features/appearance/tokens.ts). If this folder and `tokens.ts` ever disagree, `tokens.ts` is what ships; update the docs.

## The five rules

1. **Tokens, not literals.** Read colors, type, spacing, radius, borders, and shadows from `useAppearance().tokens`. No hex, `rgb()`, `fontFamily`, or numeric `fontSize` in screen or component files (the lint rule enforces this).
2. **Reuse before you build.** Use a component from [components.md](components.md). Add a new shared component only when two screens need it, and document it in the same change.
3. **Every state is designed.** Loading, empty, error with retry, partial, completed, and demo or unavailable are part of the screen, not follow-ups ([patterns.md](patterns.md)).
4. **Never color alone.** Status, selection, and XP changes always carry text or an icon too ([accessibility.md](accessibility.md)).
5. **Six languages, no literals.** All user-facing text comes from localization keys with all six locales populated in the same change ([content-and-localization.md](content-and-localization.md)).

## Checklist for any new UI

Copy into the PR description and tick each line, or note why a line does not apply.

- [ ] Built from existing components, or a new shared component is documented in `components.md`
- [ ] No raw colors, font families, or font sizes; `bun x eslint` shows no new errors or warnings in touched files
- [ ] Looked at in **all three themes** (Arcade, Sticker Pop, Soft Home) at default and largest text size
- [ ] Spacing uses the scale (4, 8, 12, 16, 20, 24, 32); no new off-scale values
- [ ] Interactive targets are at least 44 dp; every control has an accessible name and role, and its state (`selected`, `disabled`, `checked`) is exposed
- [ ] Loading, empty, error, and retry states exist where data can be missing
- [ ] Meaning is never carried by color alone
- [ ] Text containers grow with content (no fixed heights on text); long German and Portuguese strings do not clip
- [ ] Any motion has a reduced-motion path and is never required to understand the result
- [ ] Copy uses keys, populated in en-US, pt-BR, es-ES, fr-FR, de-DE, it-IT, and the localized copy tables are updated
- [ ] Docs (screen specs, this folder) match the final behavior
- [ ] Unit and component tests pass; new behavior has a test

## Status

| Item | State |
|---|---|
| Tokens, type scale, touch targets, scrim | Implemented in `tokens.ts`, tested in `tests/component/design-tokens.test.ts` |
| Shared components (`Screen`, `Card`, `Button`, `Label`, `StatePanel`) | Implemented in `components/housegains/ui.tsx` |
| Form, chip, member badge, screen title, glyph | Implemented, but live in `features/housegains-screens/screen-elements.tsx`; promoting them to `components/housegains/` is deferred |
| Lint rule | Implemented. 13 pre-existing files are on a shrinking allowlist ([enforcement.md](enforcement.md)) |
| Existing screens migrated to tokens | **Not done.** Legacy values remain in the allowlisted files |
| Known contrast gaps | Recorded, not fixed ([accessibility.md](accessibility.md)) |
| Motion primitives, haptics | None exist yet ([motion-and-haptics.md](motion-and-haptics.md)) |
