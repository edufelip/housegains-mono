# HouseGains implementation evidence — 2026-11-13

The requested local mobile implementation is delivered on `t3/housegains-schema-and-themes`, based on `621c632`. Native release acceptance is incomplete. This receipt distinguishes automated checks, JavaScript export, native syntax checks, and service/device evidence.

## Implemented scope

- First-run Arcade / Sticker Pop / Soft Home preview and explicit persisted selection, hydration/error recovery, settings switching, and independent household persistence.
- G1–G5 household profile/catalog/invite/assignment/join flows; T1–T3 creator-only chore management, validated custom builder, ordered subtasks and catalog detail; S1–S3 Today, contribution-aware detail/undo, bonus breakdown and feed posting.
- Theme-specific dashboard compositions; weekly XP goal bars and Soft Home ring (320/400 = 80%), goal-unavailable state, household-timezone Today filtering, lifetime XP levels, ranks, Feed, Settings, creator profile editing, clipboard/QR/share and camera-scan entry.
- Local persisted memberships, zero-or-more direct assignees, immutable occurrence/display snapshots, RRULE recurrence, timezone/DST handling, signed XP ledger, unique completions/assists, contributor bonus split, due cutoff, own five-minute undo, partial closure and mutation retry.
- en-US, pt-BR, es-ES dictionaries and copy-table coverage. Source and catalog copy are separated from custom user names.
- Additive authenticated server routes, PostgreSQL repository/schema, and three generated migrations. Mobile currently uses the clearly labeled local adapter; the remote adapter remains separate work.

## Final automated results

| Check | Result | Evidence boundary |
|---|---|---|
| Pinned runtime and frozen install | Bun 1.3.14; no install changes | Workspace dependency/tooling check |
| Mobile logic/storage/localization/configuration | 45 passed, 0 failed | Seven explicit test files |
| Mobile components and integrated app flow | 24 passed, 0 failed | Six suites; actual providers, mocked native boundaries |
| Server HouseGains + auth/profile + plans | 58 passed, 0 failed | 24 HouseGains and 34 existing regressions; no live DB |
| Mobile TypeScript | Exit 0 | Whole mobile project |
| Server TypeScript | Exit 0 | Whole server project |
| ESLint | Exit 0; 0 errors, 3346 warnings | Full configured mobile lint plus new route/localization/config paths; warning debt remains |
| iOS JavaScript/Hermes export | Exit 0; one 4.35 MB `.hbc` bundle | JavaScript packaging, not an Xcode/native app build |
| iOS project/plists/entitlements | Syntax checks passed | `plutil`; no signing/build/device proof |
| Android manifest | XML parsing passed | No Android build/device proof |
| Invite QR | Independently decoded using macOS Vision | Exact `https://housegains.app/j/HG7K2P` payload; no live association/service claim |

The integrated app tests cover create → catalog → invite/skip → assign → Today → detail → 100% bonus → Feed; Settings invite return; failed theme save/retry; theme switching with persisted XP/feed/household data; invite dismissal after provider refresh; and preserving a same-named custom chore during catalog deselection. The flow clock is fixed before the task deadline for reproducibility.

Regression tests reproduced and then verified fixes for DST-gap reconciliation wedging, equivalent RRULE anchor resets, future due-time edits, historical display snapshots, daily/weekly canonical RRULE generation, assignment/copy retry, and weekly-goal metrics. Core API completion-concurrency tests use a serialized fake repository; PostgreSQL row locks and schema uniqueness were inspected, not exercised against a live database.

## Reproduce from repository root

```bash
bash scripts/install-pinned-bun.sh
.local-bun/bin/bun install --frozen-lockfile
.local-bun/bin/bun test apps/mobile/housegains-config.test.ts apps/mobile/features/appearance/storage.test.ts apps/mobile/features/household/household-client.test.ts apps/mobile/features/housegains-screens/screen-model.test.ts apps/mobile/features/housegains-screens/invite-link.test.ts apps/mobile/features/housegains-screens/invite-qr.test.ts apps/mobile/localization/housegains/catalog.test.ts
.local-bun/bin/bun run --cwd apps/mobile test:component -- --runInBand --runTestsByPath tests/component/housegains-app-flow.test.tsx tests/component/housegains-entry.test.tsx tests/component/housegains-appearance.test.tsx tests/component/housegains-chore-completion.test.tsx tests/component/chore-management-screens.test.tsx tests/component/housegains-dashboard-goal.test.tsx
.local-bun/bin/bun run --cwd apps/mobile typecheck
```

From `apps/server`, use `../../.local-bun/bin/bun test tests/housegains-api.test.ts tests/housegains-app.test.ts tests/housegains-catalog.test.ts tests/housegains-domain.test.ts tests/housegains-schema.test.ts tests/auth-profile.test.ts tests/plans.test.ts` and `../../.local-bun/bin/bun x tsc --noEmit`.

The final export was run from `apps/mobile` with `CI=1 ../../.local-bun/bin/bun x expo export --platform ios --output-dir ../../.qa/housegains-ios-bundle`. Local ignored logs are under `.qa/housegains-verification/`; the exported Hermes bundle and asset manifest are under `.qa/housegains-ios-bundle/`.

## Native acceptance blocker and pending service work

The first selected simulator was owned by an active Comradia session. Its install command returned `DEVICE_IN_USE`; the recommended status inspection was unsupported by the bound device command. The owner was left untouched.

The user authorized a different unused simulator. A fresh `HouseGains QA` iPhone 17 simulator was created with ID `8D827FBA-5C4D-4933-B0E7-C34189EBAD81`. `device_open` returned `No device ... on 'This machine'`; the prescribed `device_list` refresh and one retry still did not discover it. Device interaction stopped as required. No native screenshots, native restart result, cross-size/device accessibility pass, or physical-device acceptance are claimed.

Pending: mobile remote/account-session adapter; live PostgreSQL migration/transaction checks; actual cross-device invitation updates; hosted Apple/Android association files and device verification; deferred-install invite delivery; push; native visual/accessibility acceptance; deployment. Client HTTPS registrations are present, but domain ownership/association is not established by source configuration. No migrations, shared database reset, cloud provisioning, deployment, push or merge was performed.

The two device acceptance items remain unchecked in the [implementation plan](../superpowers/plans/2026-11-13-housegains-screens.md).
