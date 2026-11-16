# Content and localization

## Languages

HouseGains ships in six languages: **en-US, pt-BR, es-ES, fr-FR, de-DE, it-IT**. English is the source; the other five are mandatory, not best effort. Key and placeholder parity across all six is required for every active string.

## Rules

1. **No user-facing literals in TSX.** Every string comes from `useHouseGainsTranslation()`:
   ```tsx
   const { t, locale } = useHouseGainsTranslation();
   <Label>{t('housegains.screens.feed.emptyTitle')}</Label>
   ```
2. **A new string ships in all six bundles in the same change**, under `localization/housegains/<area>/<locale>.ts`, and in the localized copy tables (`docs/screens/housegains-localized-copy.md`, `docs/screens/v2/localized-copy-table-v2.md`).
3. **Keys** are `housegains.<area>.<screen or group>.<name>`, lower camel case segments, stable and descriptive of the use, not the wording (`emptyTitle`, not `nothingHere`).
4. **Placeholders** use named parameters (`t(key, { name })`), never string concatenation. A sentence is one key, so translators can reorder words. Placeholders must match in every locale.
5. **Plurals, dates, numbers** are formatted for the active `locale` (for example `Intl` with `locale`), not hand-built English rules.
6. **Accessibility strings** (`accessibilityLabel`, `accessibilityHint`) are localized keys too.
7. **Never reuse a visible string as an identifier** (a `testID`, a key, or a branch condition).

## Layout must tolerate translation

- German and Portuguese often run 30 percent or more longer than English. Do not set fixed widths on text or buttons, and allow wrapping.
- Check each new screen with its longest locale at the largest text size.
- Do not put text in images. Do not use ALL-CAPS strings.

## Voice and tone

HouseGains is shared and friendly, about teamwork rather than competition or blame.

- **Plain and short.** Prefer everyday words. One idea per sentence.
- **Say what happened and what to do.** "Couldn't save your changes. Check your connection and try again." Not "Error 503".
- **Attribute fairly.** Credit contributors by name; never shame someone for what is undone.
- **Be honest about local and demo data.** Say when something is stored on this device and does not sync.
- **Button labels are verbs** ("Add chore", "Invite"), sentence case, no trailing period.
- **Titles name the screen or the result**; descriptions explain why or what's next.
- **Empty states invite action** ("No chores yet. Add the first one.").
- **Errors never blame the user** and never expose codes or raw messages; log those separately.
- Friendly extras (emoji, exclamations) are used sparingly and never required for meaning. Arcade, Sticker, and Soft share the same copy; the theme changes look, not words.

## Review

A reviewer should be able to switch to any of the six languages and see no English where translation exists, no clipped text, and the same meaning. The localization catalog test (`localization/housegains/catalog.test.ts`) checks that every locale has every key, that interpolation placeholders are preserved, that non-English values are translated rather than English fallbacks, and that values appear in the copy table. It does not check tone or whether text fits, so a human check remains.
