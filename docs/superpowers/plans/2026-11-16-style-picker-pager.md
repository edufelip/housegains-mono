# Style picker pager (design option D, revision 4): implementation plan

Status: approved design (comparison `housegains-first-run-style-picker`, revision 4, option P1-D).
Design reference: <https://claude.ai/artifact/LBsGrnbVNoSSwGpT29SB5R> (private artifact; the spec JSON is embedded in it).

This plan is written so that every task can be done by someone who has never seen this repo.
Follow it literally. When the plan and the code disagree, stop and report; do not improvise.

## 1. What we are building

The first screen of the app (`ThemePickerScreen`, shown before sign-in when no style is saved,
and again from Settings) becomes a **horizontal pager**:

- One full-screen page per style. Page order comes from a config: **Sticker Pop, Arcade, Soft Home**.
- Each page is drawn entirely in its own style: background, text, buttons, borders.
- Each page shows, top to bottom: a "CHOOSE YOUR STYLE" label and a language button; the style
  name (drawn with the style's *name treatment*); its description; a **mini phone** that shows a
  sample home screen in that style, with Previous/Next buttons on its left and right; the note
  "Pick a look for your home. You can change it anytime in Settings."; and a pinned bottom bar
  with page dots, "Swipe to compare all {count} styles", any error message, and one button
  **"Choose {style}"**.
- Swiping (or Previous/Next) only previews. **Only "Choose {style}" saves**, then the app
  continues (to sign-in, or wherever `onContinue` goes).
- Nothing is pre-selected. Saving shows "Saving style…" and locks the pager and every button.
- Save failure: an error banner on that page, and its button becomes "Retry save".
- Load failure (stored choice unreadable): an error banner with "Try loading again" on every page.
- The language button opens a bottom sheet (styled like the current page) listing the six
  languages; choosing one applies immediately (existing behaviour) and a failure shows Retry.

The picker is **config-driven** (contract v1, section 3). A bundled config ships in the app. The
same JSON can later arrive from Firebase Remote Config parameter `style_picker_config`; a fetched
value is read at the next cold start, never mid-screen.

Not in scope: changing chore data, the dashboards' layouts, auth, or any Firestore/Functions code.

## 2. Ground rules for every task

- Work only in the files your task lists. If you need to change another file, stop and report.
- No user-facing string literals in `.tsx` files. Use `t('housegains.…')` keys (task T2 adds them).
- Do not commit, push, or run `git` commands that change state. Do not edit `ios/` or `android/`.
- Environment: `export PATH=$HOME/.bun/bin:$PATH` then `cd apps/mobile`.
- Checks (run the ones your task names; all must pass at the end):
  - Typecheck: `bun x tsc --noEmit`
  - Unit tests (Bun, no React Native allowed in these files): `bun run test:unit`
  - Component tests (Jest): `bun run test:component`
  - Lint (0 errors required; warnings are pre-existing): `bun run lint`
  - Format: `bun x prettier --write <your files>` then `bun run format:check`
- Report back in under 200 words: files changed with `file:line`, commands run, results.

## 3. Config contract v1 (source of truth)

Types live in `apps/mobile/features/appearance/picker-config-types.ts` (already written; do not
change it without the lead's approval). Shape:

```json
{
  "schemaVersion": 1,
  "styles": [
    {
      "id": "sticker",
      "enabled": true,
      "order": 1,
      "composition": "sticker",
      "nameTreatment": "sticker",
      "headingFont": "sans",
      "copy": {
        "name": { "key": "housegains.theme.sticker.name" },
        "description": { "key": "housegains.theme.sticker.description" }
      },
      "tokens": {
        "canvas": "#FFFDF0", "surface": "#FFFFFF", "text": "#141414", "muted": "#414141",
        "primary": "#2563EB", "onPrimary": "#FFFFFF", "border": "#111111", "accent": "#FBBF24",
        "success": "#10B981", "danger": "#F87171", "radius": 18, "borderWidth": 2.5
      }
    }
  ]
}
```

Validation rules (implemented in `picker-config.ts`, task T1):

| Rule | Behaviour |
|---|---|
| R1 | Not an object, `schemaVersion !== 1`, or `styles` not an array: `ok: false`, one error, whole config ignored. |
| R2 | A style failing any check below is dropped (one error line naming `styles[i] "id"` and every reason). Other styles are kept. Unknown fields are ignored. |
| R2a | `id` matches `STYLE_ID_PATTERN` and is unique. |
| R2b | `composition` ∈ `COMPOSITIONS`; `nameTreatment` ∈ `NAME_TREATMENTS`; `headingFont` ∈ `HEADING_FONTS`; `order` is a finite number; `enabled` is boolean or absent. |
| R2c | Every colour in `PICKER_COLOR_TOKENS` matches `/^#[0-9A-Fa-f]{6}$/`; `radius` finite 0–32; `borderWidth` finite 0–4. |
| R3 | Fewer than 2 valid **enabled** styles: `ok: false`, whole config ignored. |
| R4 | Contrast pairs `text/canvas`, `text/surface`, `muted/canvas`, `onPrimary/primary`: below 3:1 drops the style; below 4.5:1 keeps it and adds a warning. |
| R5 | `copy.name` and `copy.description`: either `{ key }` that exists in **all six** locale bundles, or `{ text }` with a non-empty string for each of `en-US, pt-BR, es-ES, fr-FR, de-DE, it-IT`. |
| R6 | (Provider) A saved style that is now hidden or missing still works: use it from `all` if present; else the bundled style with that id; else the bundled style with the saved composition; else the first bundled visible style. |
| R7 | New ids are allowed; they reuse a shipped composition. Storage accepts any id matching `STYLE_ID_PATTERN`. |
| R8 | The provider reads the already-activated remote value once at start; a background fetch activates for the next cold start. |
| R9 | A style's tokens apply app-wide while that style is active. |
| R10 | A bundled id whose `canvas`, `primary` or `accent` differs from the bundled value but whose description is still the bundled key: warning "description may no longer match". |

Visible pages = valid styles with `enabled !== false`, sorted by `order` ascending, then `id`.

## 4. Copy (new localization keys)

Add to **all six** bundles in `apps/mobile/localization/housegains/{en-US,pt-BR,es-ES,fr-FR,de-DE,it-IT}.ts`,
next to the other `housegains.appearance.*` keys. Values must be exactly these:

| Key | en-US | pt-BR | es-ES | fr-FR | de-DE | it-IT |
|---|---|---|---|---|---|---|
| `housegains.appearance.choose` | Choose {theme} | Escolher {theme} | Elegir {theme} | Choisir {theme} | {theme} wählen | Scegli {theme} |
| `housegains.appearance.swipe_hint` | Swipe to compare all {count} styles | Deslize para comparar os {count} estilos | Desliza para comparar los {count} estilos | Fais glisser pour comparer les {count} styles | Wische, um alle {count} Stile zu vergleichen | Scorri per confrontare i {count} stili |
| `housegains.appearance.previous` | Previous style | Estilo anterior | Estilo anterior | Style précédent | Vorheriger Stil | Stile precedente |
| `housegains.appearance.next` | Next style | Próximo estilo | Estilo siguiente | Style suivant | Nächster Stil | Stile successivo |
| `housegains.appearance.page_position` | {index} of {total} | {index} de {total} | {index} de {total} | {index} sur {total} | {index} von {total} | {index} di {total} |
| `housegains.appearance.language_button` | Language: {language}. Change | Idioma: {language}. Alterar | Idioma: {language}. Cambiar | Langue : {language}. Modifier | Sprache: {language}. Ändern | Lingua: {language}. Cambia |
| `housegains.appearance.language_done` | Done | Concluído | Listo | Terminé | Fertig | Fine |
| `housegains.preview.clock` | 9:41 | 9:41 | 9:41 | 9:41 | 9:41 | 9:41 |

Existing keys reused: `housegains.appearance.{title,subtitle,preview_hint,saving,retry_save,retry_load,error.load,error.save}`,
`housegains.theme.{id}.{name,description}`, `housegains.screens.settings.language`,
`housegains.screens.settings.selectLanguage`, `housegains.screens.common.{actionError,retry}`,
`housegains.preview.{task_vacuum,task_vacuum_hint,task_plants,bounty_hint,claim,grab_it}`.

## 5. Test IDs (contract between screen and tests)

| testID | Element |
|---|---|
| `housegains.theme-picker` | Screen root |
| `theme-picker.pager` | Horizontal pager (ScrollView) |
| `theme-page.{styleId}` | One page |
| `theme-choose.{styleId}` | The page's Choose / Retry save button |
| `theme-picker.previous.{styleId}` / `theme-picker.next.{styleId}` | Previous / Next buttons on that page |
| `theme-picker.language.{styleId}` | Language button on that page |
| `theme-picker.language-sheet` | Sheet container |
| `theme-picker.language.done` | Sheet Done button |
| `housegains.onboarding.language.{locale}` | Language rows (existing prefix, keep it) |
| `housegains.onboarding.language.retry` | Language Retry (existing) |
| `theme-picker.load-error` / `theme-picker.retry-load` | Load error banner / its button |
| `theme-picker.save-error` | Save error banner |
| `housegains.theme-preview.{styleId}` | Mini phone sample on a page |

## 6. Tasks

Waves: tasks in the same wave run in parallel and touch disjoint files.

### Wave 1

#### T1 Validator and bundled config (pure TypeScript) — Haiku
Files: create `apps/mobile/features/appearance/picker-config.ts`, `apps/mobile/features/appearance/picker-config.test.ts`.
Do not import `react-native`, `tokens.ts`, or anything that imports them (Bun unit tests cannot load React Native).

Exports:
```ts
export const BUNDLED_PICKER_CONFIG: PickerConfig; // section 3 shape: sticker(order 1, sticker, sticker, sans), arcade(2, arcade, accent, sans), soft(3, soft, serif, serif). Token values: copy from features/appearance/tokens.ts (radius and borderWidth too).
export function contrastRatio(a: string, b: string): number;     // WCAG 2.x, rounded to 2 decimals
export function isDarkColor(hex: string): boolean;               // relative luminance < 0.2
export function validatePickerConfig(raw: unknown, hasKey?: (key: string) => boolean): PickerValidation;
export function visibleStyleConfigs(styles: PickerStyleConfig[]): PickerStyleConfig[]; // enabled !== false, sort order asc then id
export function resolvePickerCopy(copy: PickerCopy, locale: HouseGainsLocale, t: (key: string) => string): string;
```
`hasKey` default: `(key) => SUPPORTED_LOCALES.every((l) => HOUSEGAINS_DICTIONARIES[l][key] !== undefined)`
(import `SUPPORTED_LOCALES` from `@/localization/core` and `HOUSEGAINS_DICTIONARIES` from `@/localization/housegains/catalog`;
if those imports break Bun tests, use relative paths `../../localization/...`).
Bundled ids for R10: compare against `BUNDLED_PICKER_CONFIG`.
`resolvePickerCopy`: `{key}` → `t(key)`; `{text}` → `text[locale] ?? text['en-US']`.

Tests (`node:test` + `node:assert/strict`, like `storage.test.ts`), at least:
bundled config is valid with 0 errors and visible order `sticker, arcade, soft`; soft gets exactly one R4 warning
(`onPrimary` on `primary` 4.47:1); R1 for `null`, `[]`, `{schemaVersion:2,…}`, `{schemaVersion:1}`; R2 drops a style
with a bad colour and keeps the rest; duplicate id dropped; R3 when only one enabled; R4 below 3:1 drops (sticker text
`#C9C4B0`); R5 missing locale in `text` drops; unknown `key` drops (pass a `hasKey` that returns false); new id with
`{text}` copy for six locales accepted; R10 warning when arcade `primary` changes; `visibleStyleConfigs` order with ties;
`contrastRatio('#FFFFFF','#6366F1')` is `4.47`; `isDarkColor('#0D1117')` true, `isDarkColor('#FFFDF0')` false.
Done when: `bun run test:unit` passes (65 existing + new), `bun x tsc --noEmit` passes.

#### T2 Localization keys — Haiku
Files: the six bundles `apps/mobile/localization/housegains/{en-US,pt-BR,es-ES,fr-FR,de-DE,it-IT}.ts` only.
Add the section 4 keys with exactly those values, placed after the existing `housegains.appearance.*` / `housegains.preview.*` keys.
Done when: `bun run test:unit` (includes `catalog.test.ts` parity) and `bun x tsc --noEmit` pass.

#### T3 Sample preview with phone variant, and the phone frame — Haiku
Files: edit `apps/mobile/components/housegains/theme-preview.tsx`; create `apps/mobile/components/housegains/phone-preview.tsx`.

`theme-preview.tsx`:
1. `ThemePreview` props become `{ themeId: ThemeId; tokens?: AppearanceTokens; variant?: 'card' | 'phone'; styleId?: string; style?: StyleProp<ViewStyle> }`.
   `themeId` is the composition. `tokens` defaults to `getThemeTokens(themeId)`. testID becomes `housegains.theme-preview.${styleId ?? themeId}`.
2. `ArcadePreview`, `StickerPreview`, `SoftPreview` and `MiniDock` receive `tokens` and `variant` as props instead of calling `getThemeTokens(...)` themselves.
   Keep their hard-coded decorative colours (`#3D58F4`, `#090C10`, the pastel chips, etc.) unchanged.
3. `variant === 'card'`: render exactly as today (no visual change).
4. `variant === 'phone'`: outer preview `View` uses `justifyContent: 'flex-start'`, `gap: 10`, `paddingTop: 30`, `paddingBottom: 14`,
   `paddingHorizontal: 13`, `flex: 1`, `borderRadius: 0`; `MiniDock` gets `marginTop: 'auto'`. After the two existing task rows add two
   more rows in that composition's "open task" style: `task_vacuum` / `task_vacuum_hint` / `+25`, and `task_plants` / `bounty_hint`
   with a small call-to-action pill (`grab_it` for sticker, `claim` for arcade and soft) instead of XP. Pill styling: arcade 1px
   `tokens.accent` border, accent text; sticker 2px `tokens.border` border, `tokens.primary` background, `tokens.onPrimary` text;
   soft `#FDE2D3` background, `#9D4C2A` text. All text uses `MiniText` (fixed size, `allowFontScaling={false}`).

`phone-preview.tsx` exports:
```ts
export const PHONE_ASPECT = 0.49; // outer width / outer height
export function PhonePreview(props: { styleId: string; composition: ThemeId; tokens: AppearanceTokens; height: number; accessibilityLabel: string }): JSX.Element;
```
- Outer bezel: `height`, `width = Math.round(height * PHONE_ASPECT)`, background `#0E0E10`, `borderRadius: 34`, `padding: 7`, 1.5px `#3A3A3D` border, shadow.
- Screen: fills bezel, `borderRadius: 27`, `overflow: 'hidden'`, background `tokens.canvas`.
- Content: render `<ThemePreview themeId={composition} tokens={tokens} variant="phone" styleId={styleId} />` inside a base canvas
  of `BASE_W = 260` by `baseH = Math.round(BASE_W * screenH / screenW)`, absolutely positioned at
  `left: (screenW - BASE_W) / 2`, `top: (screenH - baseH) / 2`, with `transform: [{ scale: screenW / BASE_W }]`
  (React Native scales around the centre, so this fills the screen exactly).
- Status bar (absolute, top, height 24, z-index above content): left `t('housegains.preview.clock')` 9px bold; right two 3×6 bars
  and a 12×6 outlined battery. Colour `#F0F6FC` when `isDarkColor(tokens.canvas)` else `#141414` (copy `isDarkColor` locally:
  relative luminance < 0.2; do not import picker-config).
- Island: centred, top 6, 50×14, radius 8, `#000`. Home indicator: bottom 4, 62×3, radius 2, same colour as status text.
- Accessibility: outer `View` `accessible`, `accessibilityRole="image"`, `accessibilityLabel` from props; children
  `importantForAccessibility="no-hide-descendants"` and `accessibilityElementsHidden`.
Done when: `bun x tsc --noEmit` passes and `bun run test:component` still passes (the existing appearance test renders `ThemePreview` card variant).

#### T4 UI primitives accept explicit tokens; language list layout — Haiku
Files: `apps/mobile/components/housegains/ui.tsx`, `apps/mobile/components/housegains/language-picker.tsx`.
1. `Button` and `Label`: add optional `tokens?: AppearanceTokens`. Precedence: `tokens` → `getThemeTokens(themeId)` → `appearance.tokens`.
   Import `type AppearanceTokens` from `@/features/appearance`.
2. `LanguagePicker`: add optional `tokens?: AppearanceTokens` (same precedence) and `layout?: 'chips' | 'list'` (default `'chips'`,
   which must render exactly as today). `'list'`: hide the heading `Label`; render one full-width row per locale
   (`minHeight: 48`, `paddingHorizontal: 12`, `borderRadius: Math.min(tokens.radius, 16)`, border `selected ? 2.5 : max(1, tokens.borderWidth)`
   in `selected ? tokens.primary : tokens.border`, background `tokens.surface`), language name on the left (bold when selected),
   a 24×24 round mark on the right (filled `tokens.primary` with a `✓` in `tokens.onPrimary` when selected). Same `accessibilityRole="radio"`,
   labels, `testID`s, disabled and retry behaviour as the chips layout. Rows sit in a `View` with `gap: 6`.
Done when: `bun x tsc --noEmit` and `bun run test:component` pass with no behaviour change for existing callers.

#### T5 Remote Config source — Haiku
Files: `apps/mobile/package.json`, `bun.lock` (via `bun add`), create `apps/mobile/features/appearance/picker-config-source.ts`,
edit `apps/mobile/tests/component/setup.ts`.
1. In `apps/mobile`: `bun add @react-native-firebase/remote-config@23.8.8` (same version as the other `@react-native-firebase/*`).
2. `picker-config-source.ts`:
```ts
import remoteConfig from '@react-native-firebase/remote-config';
export const PICKER_CONFIG_PARAM = 'style_picker_config';
/** Value activated by an earlier session, parsed. null when unset, empty, or Remote Config is unavailable. Never throws. */
export async function loadActivatedPickerConfig(): Promise<unknown | null>;
/** Fetch + activate in the background for the NEXT cold start (R8). Never throws, never awaited by callers. */
export function refreshPickerConfigInBackground(): void;
```
   `loadActivatedPickerConfig`: `try { const raw = remoteConfig().getValue(PICKER_CONFIG_PARAM).asString(); if (!raw) return null; try { return JSON.parse(raw); } catch { return raw; } } catch { return null; }`
   (returning the raw string on bad JSON lets the validator report R1).
   `refreshPickerConfigInBackground`: inside `try`, `void remoteConfig().setConfigSettings({ minimumFetchIntervalMillis: __DEV__ ? 0 : 3_600_000 }).then(() => remoteConfig().fetchAndActivate()).catch(() => undefined)`; outer `catch` ignores.
3. `setup.ts`: add `remoteConfigValue: ''` and `remoteConfigFetches: 0` to the `mockFirebase` object, and a
   `jest.mock('@react-native-firebase/remote-config', …)` returning a default function whose result has
   `getValue: () => ({ asString: () => mockFirebase.remoteConfigValue })`, `setConfigSettings: async () => undefined`,
   `fetchAndActivate: async () => { mockFirebase.remoteConfigFetches += 1; return true; }`. Reset both fields wherever the file resets other `mockFirebase` fields (if it does).
Done when: `bun x tsc --noEmit`, `bun run test:component` pass and `git diff --stat` shows only the listed files.

#### T6 Documentation — Haiku
Files (docs only): `apps/mobile/DESIGN.md` (section "Appearance picker"), `apps/mobile/docs/screens/housegains-v1.md` (Journey + "Appearance picker" row),
`apps/mobile/docs/screens/screen-catalog.md`, `apps/mobile/docs/functional-requirements/FR-275-housegains-v1.md`,
`apps/mobile/docs/acceptance-criteria/AC-007-housegains-v1.md`, `apps/mobile/docs/test-cases/TC-535-housegains-v1.md`,
`docs/implementation/firebase-contract.md` (new "Remote Config" section), `docs/implementation/housegains-contract.md`,
`apps/mobile/docs/screens/v2/localized-copy-table-v2.md`.
Replace "tap a preview, then Continue saves" wording with the section 1 behaviour; record the contract (section 3, rules R1–R10, parameter
`style_picker_config`, next-cold-start activation, bundled fallback); add the section 4 keys to the copy table. Only change sentences that
describe the picker; keep each file's format. Do not touch `apps/mobile/docs/screens/housegains-localized-copy.md` (generated).
Done when: every listed file is updated and `git diff --stat` shows only docs.

### Wave 2 (lead)

#### T7 Provider, storage and resolved styles — lead (architecture)
Files: `features/appearance/{types.ts,storage.ts,storage.test.ts,appearance-provider.tsx,index.ts}`, create `features/appearance/picker-styles.ts`.
- `picker-styles.ts` (may import React Native): `toPickerStyle(cfg)`, `resolvePickerStyles(raw, source)`, `findStyleForSelection(id, composition, resolved)` (R6).
- Storage accepts any `STYLE_ID_PATTERN` id and an optional `composition`; record stays `version: 1`.
- Provider: loads `loadActivatedPickerConfig()` once while hydrating, calls `refreshPickerConfigInBackground()`; exposes
  `styles` (visible), `styleId`, `selected` (StyleId), `previewTheme(id)`, `selectTheme(id)`, `themeId` (composition of the active
  style; existing consumers unchanged), `tokens` (active style tokens), `configReport` (`source`, `errors`, `warnings`).

### Wave 3 (after wave 2)

#### T8 Picker screen — Haiku
File: `apps/mobile/features/onboarding/theme-picker-screen.tsx` only. Full spec in section 7.

#### T9 Settings appearance list — Haiku
File: `apps/mobile/features/housegains-screens/main-tab-screens.tsx` only (the Settings card listing styles, around the `themes` array).
Replace the hard-coded `['arcade','sticker','soft']` with `useAppearance().styles`; per row use `style.tokens` instead of
`getThemeTokens(id)`, `resolvePickerCopy(style.copy.name|description, locale, t)` for text, compare with `styleId` (not `themeId`) for the
selected state, keep testID `housegains.settings.theme.${style.id}`. `onSelectTheme` takes a `StyleId` (string). Retry calls
`selectTheme(styleId)`. Also widen the prop type in `features/housegains-screens/index.tsx` only if tsc requires it (that one line).

#### T10 Component tests — Haiku
Files: `apps/mobile/tests/component/housegains-appearance.test.tsx` (rewrite the picker cases), and
`housegains-languages.test.tsx` only if it breaks. Use the section 5 testIDs. Cover: pages render in order sticker, arcade, soft; no
style saved before Choose; `theme-choose.arcade` saves `{"version":1,"themeId":"arcade","composition":"arcade"}` and calls `onContinue`;
save failure shows `theme-picker.save-error` and the button retries; load failure shows `theme-picker.retry-load`; the language sheet
opens, switching to `pt-BR` changes the page title text, Done closes it; a remote config (`mockFirebase.remoteConfigValue`) hiding
`soft` yields 2 pages; an invalid remote config falls back to 3 bundled pages; `fetchAndActivate` was called once.

## 7. T8 picker screen specification

Props unchanged: `{ onContinue: () => void }`. Default export unchanged.

State/data: `const { hydrated, styles, loadError, saveError, previewTheme, selectTheme, retryLoad, retrySave } = useAppearance();`
`const { t, locale } = useHouseGainsTranslation();` local state `page` (index), `busy`, `savingId: string | null`, `failedId: string | null`, `sheetOpen`, `pagerWidth`.
Imports: `PhonePreview, PHONE_ASPECT` from `@/components/housegains/phone-preview`; `LanguagePicker`; `Button, Label` from `@/components/housegains/ui`;
`resolvePickerCopy, isDarkColor` from `@/features/appearance/picker-config`; `LANGUAGE_NAMES` from `@/localization/core`.

Layout:
- Root `View` testID `housegains.theme-picker`, `flex: 1`.
- `ScrollView` horizontal, `pagingEnabled`, `showsHorizontalScrollIndicator={false}`, `scrollEnabled={!busy && !sheetOpen}`,
  testID `theme-picker.pager`, `onLayout` stores width, `onMomentumScrollEnd` → `page = Math.round(x / width)`; when `page`
  changes call `previewTheme(styles[page].id)`. Keep a ref; `goTo(i)` = `scrollTo({ x: i * width, animated: !reduceMotion })` and set `page`.
  Read reduce motion with `AccessibilityInfo.isReduceMotionEnabled()` once.
- One page per `styles[i]` (`k = style.tokens`), width = pager width, `backgroundColor: k.canvas`, testID `theme-page.${id}`,
  `accessibilityLabel = t('housegains.appearance.page_position', { index: i + 1, total: styles.length }) + ': ' + name`.
  Pages that are not current: `importantForAccessibility="no-hide-descendants"`, `accessibilityElementsHidden`.
  Use `SafeAreaView` (edges top/bottom) inside each page so the background reaches the edges.
- Page body: vertical `ScrollView` (`contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 10, gap: 12 }}`):
  1. Row (`flexDirection: 'row'`, `flexWrap: 'wrap'`, `justifyContent: 'space-between'`, `alignItems: 'center'`, `gap: 8`): `Label` (tokens=k)
     uppercase, 14/19, bold, letterSpacing 0.8, colour `k.muted`, text `t('housegains.appearance.title')`, `accessibilityRole="header"`;
     language `Pressable` (minHeight 44, paddingHorizontal 12, radius `Math.min(k.radius, 22)`, border `k.borderWidth` `k.border`,
     background `k.surface`, sticker composition adds hard shadow `2px 2px 0 #111` via shadow props) with a globe drawn with
     `react-native-svg` (circle + meridian paths, 16×16, `currentColor` = `k.text`) and the language name (strip " (Brasil)"),
     `accessibilityLabel={t('housegains.appearance.language_button', { language: LANGUAGE_NAMES[locale] })}`, testID `theme-picker.language.${id}`, disabled while `busy`.
  2. Name: `nameTreatment === 'accent'`: Geist bold 36/44, colour `k.primary`. `'sticker'`: Geist bold 36/44, colour `k.text`, wrapped in a
     `View` with `k.accent` background, 2.5px `k.border` border, radius 12, paddingHorizontal 10, hard shadow 4/4 `k.border`,
     `transform: [{ rotate: '-2deg' }]`, `alignSelf: 'flex-start'`, and `marginBottom: 6`. `'serif'`: serif family
     (`k.typography.heading` when `headingFont === 'serif'`), weight 400, 36/44, `k.text`. Text = `resolvePickerCopy(style.copy.name, locale, t)`.
  3. Description `Label` body, `k.text`: `resolvePickerCopy(style.copy.description, …)`.
  4. Sample row: `View` `flex: 1`, `minHeight: 300`, `onLayout` stores `{w, h}`; inside a row: Previous `Pressable` (44×44 circle,
     border `max(1, borderWidth)` `k.border`, background `k.surface`, glyph `‹` 20px `k.text`, opacity 0.3 and disabled at i = 0 or `busy`,
     accessibilityLabel `t('housegains.appearance.previous') + ': ' + previousName`), `PhonePreview` with
     `height = Math.max(300, Math.min(h, (w - 2 * 54) / PHONE_ASPECT, 560))`, `accessibilityLabel = t('housegains.appearance.preview_hint') + ': ' + name`,
     then Next (mirror). Row `justifyContent: 'space-between'`, `alignItems: 'center'`.
  5. Note `Label` caption, `k.muted`: `t('housegains.appearance.subtitle')`.
- Bottom bar (not scrolling): `paddingHorizontal: 20`, `paddingTop: 8`, `paddingBottom: 12`, `gap: 10`, top border 1px `k.border`,
  background `k.canvas`, `maxHeight: '62%'`:
  1. Dots (hidden from accessibility): `styles.map` 8×8 circles, the current one 22×8, current colour `k.primary`, others
     `isDarkColor(k.canvas) ? '#30363D' : (composition === 'sticker' ? '#8A8574' : k.border)`; centred, `gap: 8`.
  2. A shrinkable `ScrollView` (`flexGrow: 0`) holding: caption centred `t('housegains.appearance.swipe_hint', { count: styles.length })`;
     load error banner when `loadError` (testID `theme-picker.load-error`) with an outline `Button` (tokens=k) `t('housegains.appearance.retry_load')`
     testID `theme-picker.retry-load`; save error banner when `saveError && failedId === id` (testID `theme-picker.save-error`) with text only.
     Banner: background `k.surface`, border `max(1.5, borderWidth)` in `composition === 'sticker' ? k.border : k.danger`, radius 16, padding 12,
     a 22×22 `k.danger` circle with "!" (`#141414` text for sticker, `#0D1117` for arcade, `#FFFFFF` otherwise) and the message in `k.text`.
  3. Main `Button` (tokens=k), testID `theme-choose.${id}`: when `saveError && failedId === id && !busy` → title `retry_save`, onPress `retrySave`
     then `onContinue`; else title `busy && savingId === id ? t('housegains.appearance.saving') : t('housegains.appearance.choose', { theme: name })`,
     onPress: `setBusy(true); setFailedId(null); setSavingId(id); try { await selectTheme(id); onContinue(); } catch { setFailedId(id); } finally { setBusy(false); setSavingId(null); }`.
     Disabled when `!hydrated || busy`.
- Language sheet: React Native `Modal` `transparent`, `animationType={reduceMotion ? 'none' : 'slide'}`, `visible={sheetOpen}`,
  `onRequestClose` closes. Backdrop `Pressable` (`rgba(20,16,35,0.42)`, closes, `accessibilityLabel` done text). Sheet `View` testID
  `theme-picker.language-sheet` at the bottom: current page tokens, background `k.surface`, top radius 24, padding 18 (+ bottom inset),
  sticker composition adds 2.5px `#111` border; header row: `Label` heading `t('housegains.screens.settings.language')`, `Pressable`
  Done (`t('housegains.appearance.language_done')`, testID `theme-picker.language.done`, minHeight 44); then
  `<LanguagePicker layout="list" tokens={k} testIDPrefix="housegains.onboarding.language" />`.
- When `styles` changes length, clamp `page` to `styles.length - 1`.
- **Never call `previewTheme` on mount.** Call it only when the page changes because of a swipe or Previous/Next, so no style is
  chosen for the user.
- Remove all old code (the vertical list, chips, Continue button).

## 8. Final verification (lead)

1. `bun x tsc --noEmit`, `bun run test:unit`, `bun run test:component`, `bun run lint` (0 errors), `bun run format:check`.
2. `bun run localization:*` generator if one exists for `housegains-localized-copy.md`; else note it.
3. Read every diff; check the section 1 behaviours against the code; check testIDs and copy keys.
4. Native: adding `@react-native-firebase/remote-config` needs `pod install` (macOS) and a new dev/store build; the source module
   never throws if the native module is missing. Not verifiable on this Linux host; record as a gap.
