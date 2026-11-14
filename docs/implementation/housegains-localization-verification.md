# HouseGains localization evidence — 2026-11-13

The active HouseGains app supports English (`en-US`), Portuguese/Brazil (`pt-BR`), Spanish (`es-ES`), French (`fr-FR`), German (`de-DE`) and Italian (`it-IT`). This follows the owner requirement that all five non-English languages are mandatory. It extends the local implementation in commit `3589a65`; it does not change the remote-service boundary documented in [the implementation receipt](housegains-verification.md).

## Implemented behavior

- A shared language picker uses recognizable language autonyms before household setup and in Settings. Language and Arcade / Sticker Pop / Soft Home preferences are independent.
- Supported device-language variants resolve to the corresponding bundle. Saved language hydrates before first-run UI; save failure retains the prior locale and exposes a retry.
- All 421 active-app keys exist and have matching interpolation placeholders in all six dictionaries. The [generated copy table](../../apps/mobile/docs/screens/housegains-localized-copy.md) records every translated value. Regenerate from the repository root with `.local-bun/bin/bun apps/mobile/scripts/localization/generate-housegains-copy.ts`.
- Default catalog chores/subtasks follow the chosen language in lists, assignment and editor fields. Copies retain catalog translation provenance; unchanged defaults save canonical data, and user-edited names remain literal. Anonymous local member placeholders are translated at the display boundary without rewriting storage.
- iOS camera and photo-library descriptions reference HouseGains QR invites / household avatars in all six native locale resources, registered in the Xcode resource phase. System permission language follows the operating system.
- Archived fitness screens are excluded from the HouseGains router. Their older dictionaries retain their historical coverage and are not counted as translated HouseGains surfaces.

## Verification

| Check | Result | Boundary |
|---|---|---|
| Logic, locale/storage, copy-table, HouseGains domain and config | 74 passed, 0 failed in 12 files | Bun 1.3.14; native storage mocked |
| Components and integrated app journeys | 33 passed in 7 suites | Actual locale, theme and household providers; native boundaries mocked |
| Whole-mobile TypeScript | Exit 0 | `typecheck` |
| Changed-source ESLint | Exit 0; 0 errors, 111 warnings | Existing warning debt and test mocks remain |
| iOS Hermes export | Exit 0; 4.41 MB bundle | JavaScript packaging, not an Xcode/native build |
| Native Xcode project, Info.plist, six InfoPlist.strings | `plutil -lint` passed | Syntax/resource registration inspected; dialogs not observed |
| Independent Luna review | No additional findings | Source/key/placeholder review, not native-speaker certification |

Component cases select each mandatory language in onboarding, retain style selection, remount with the saved locale, fail/retry persistence, switch to French in Settings after a full household/chore/completion/feed journey, and preserve custom names when editing localized catalog defaults. Entry tests hold the UI while saved-language hydration is pending. Catalog tests check all source keys, locale membership, nonempty values, placeholders and the generated six-language table.

Reproduce unit checks from `apps/mobile`:

```bash
../../.local-bun/bin/bun test housegains-config.test.ts features/auth/language-storage.test.ts localization/housegains localization/index.test.ts localization/localized-copy-table-v2.test.ts localization/unknown-value-source.test.ts features/housegains-screens features/household/household-client.test.ts features/appearance/storage.test.ts
```

Reproduce components from the repository root:

```bash
.local-bun/bin/bun run --cwd apps/mobile test:component -- --runInBand --runTestsByPath tests/component/housegains-app-flow.test.tsx tests/component/housegains-entry.test.tsx tests/component/housegains-appearance.test.tsx tests/component/housegains-chore-completion.test.tsx tests/component/chore-management-screens.test.tsx tests/component/housegains-dashboard-goal.test.tsx tests/component/housegains-languages.test.tsx
.local-bun/bin/bun run --cwd apps/mobile typecheck
```

Local ignored logs are in `.qa/housegains-localization/`. The exported bundle is in `.qa/housegains-ios-bundle/`.

## Pending acceptance

Native cross-size/large-text layout, screen-reader navigation, native relaunch and localized permission-dialog observation remain pending. The existing Comradia-owned simulator was left untouched. The authorized alternative HouseGains simulator was not discoverable by device tooling; this task did not retry device ownership or claim native visual success. Native-speaker review has not been performed. Remote adapter, cross-device sync, hosted links and deployment retain their previously documented pending status.
