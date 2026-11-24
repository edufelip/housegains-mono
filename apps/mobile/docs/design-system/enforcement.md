# Enforcement

A design system only works if the cheap path is the correct path. Three layers keep new UI on it.

## 1. Lint (`eslint.design-system.cjs`)

In `features/**/*.tsx` and `components/**/*.tsx`, ESLint reports:

| Pattern | Reported as |
|---|---|
| Hex colors (`'#fff'`, `'#14110F'`, 3, 4, 6 and 8 digit forms) | error |
| `rgb(`, `rgba(`, `hsl(`, `hsla(` strings | error |
| `fontFamily: '<literal>'` | error |
| `fontSize: <number literal>` | error |

CI runs `eslint --quiet app features components localization`, so these errors fail the build.

What the rule does **not** check (it is deliberately scoped to what a rule can check without false positives): spacing, radius, and border literals; `fontWeight`; computed values (`fontSize: size * 0.3` passes); `.ts` files such as `tokens.ts`; named colors (`'white'`); and `tests/`.

To intentionally use a literal that is data, not theme (for example a member color), add a one-line `// eslint-disable-next-line no-restricted-syntax` with a reason.

### The legacy allowlist

Twelve files predate the system and still contain raw values. They are listed in `LEGACY_FILES` in `eslint.design-system.cjs` and report **warnings** (visible in `bun run lint`, hidden by `--quiet`) so CI stays green.

- **The list may only shrink.** When you migrate a file, delete it from the list in the same change.
- **Never add a file.** A new file with raw values fails CI; fix the file instead.
- If you touch a legacy file, leave it no worse; migrate the lines you edit.
- Migrating the allowlisted files (the large ones are `theme-preview.tsx`, `phone-preview.tsx` and the three dashboards) is deferred work. Per the repo's deferred-work policy it belongs in the issue tracker; this change did not create those issues.

## 2. Tests

| Test | Guards |
|---|---|
| `tests/component/design-tokens.test.ts` | Contrast of every text pair in all three themes (known gaps pinned), border behavior, type scale shape and parity, serif-only-in-Soft, spacing scale, touch targets |
| `tests/component/housegains-state-panel.test.tsx` | `StatePanel` states, alert role, action rules |
| Component tests for new components | Roles, names, state, per-theme rendering |

Adding a token: extend the structure test. Adding a color role: add its text pairs to `TEXT_PAIRS`.

## 3. Review gate

The checklist in [README.md](README.md#checklist-for-any-new-ui) is part of every UI PR. Reviewers block on: raw values, missing states, color-only meaning, untranslated strings, and a new component that duplicates a cataloged one.

`apps/mobile/AGENTS.md` and `GEMINI.md` carry the same rule for AI agents: UI work starts by reading this folder, and a UI task is not done until the checklist passes and the docs match the code.

## Commands

```bash
cd apps/mobile
bun x eslint app features components localization --quiet   # what CI runs (errors only)
bun run lint                                                  # includes legacy warnings
bun run typecheck
bun run test:unit && bun run test:component
```

## Changing the system

1. Change the token, component, or rule.
2. Update the doc that describes it in this folder.
3. Update or add the test that guards it.
4. If it changes a theme reference, update [DESIGN.md](../../DESIGN.md).
5. If it changes user-visible behavior, update the screen specs and localized copy tables the repo requires.
