# HouseGains Screens Implementation Plan

> **For agentic workers:** Use the executing-plans skill to implement this plan task by task. Steps use checkbox syntax for tracking. Execution was authorized by the user on 2026-11-13; remaining native acceptance items are tracked below.

**Status:** Local implementation delivered; native acceptance blocked.

**Delivery status:** Screen and local-domain implementation complete; automated verification recorded in [the evidence receipt](../../implementation/housegains-verification.md). The two native acceptance items remain blocked by device discovery and are intentionally unchecked. Remote mobile wiring and live database/deployment validation are outside this local UI completion boundary.

**Goal:** Build the HouseGains v1 household, chore, XP, and navigation flows against the latest screenshots, with three personally selectable designs.

**Architecture:** One shared household/chore/instance/ledger model and interaction layer, with theme-specific presentation components. A hydrated appearance provider controls onboarding, navigation, and screens; changing appearance never changes household data or XP rules. Until production service wiring exists, the local/demo adapter must be labeled and must not imply cross-device sync.

**Tech Stack:** Existing Expo SDK 54, React Native 0.81.5, Expo Router, Reanimated, AsyncStorage, Bun 1.3.14; existing localization and component test tooling.

## Sources and scope

- Product authority: `docs/implementation/housegains-contract.md` for latest screenshot and domain requirements; `docs/PRD.md` and `apps/mobile/docs/screens/housegains-v1.md` for product and behavior traceability.
- Visual authority: the supplied HouseGains reference screenshots for Arcade, Sticker Pop, and Soft Home. The screen IDs and labels are G1 Create household, G2 Pick chores, G3 Invite housemates, G4 Assign chores, G5 Join, T1 Settings > Chores, T2 Custom chore builder, T3 Catalog chore detail, S1 Today with subtasks, S2 Chore detail, and S3 100% bonus. Also include the appearance picker, Ranks, Feed, and Settings.
- Implement the current screenshot scope. Do not infer additional behavior from inaccessible artifact content or from older conflicting PRD prose.
- This is a mobile UI implementation plan. Production API/database work, deployment, push, and merge are separate work. Feed is in v1 scope with the completion activity contract; do not defer it or ship a dead Feed destination.
- The latest contract requires household memberships, catalog copies, multiple assignees or unassigned chores, per-instance snapshots and XP ledger, explicit completion-bonus allocation, undo, and partial closure. It supersedes older conflicting assignment and bonus assumptions.
- Before integration, inspect the current root route/auth guards and tab layout; the HouseGains shell must not assume that legacy role selection or fitness tabs are reusable.
- Retain the existing `en-US`, `pt-BR`, `es-ES` requirement and localization infrastructure. No UI text literals in screen TSX.

## Experience and visual specification

Onboarding: choose a style → create or join household → household setup/join confirmation → Today. Preserve existing session/legal gates where required. The picker survives app restart. Returning members resume setup or go to Today; changing style in settings does not repeat onboarding.

Picker: three labeled, interactive previews using the same sample chores and score. A tap previews that design immediately; a separate Continue action commits the selection. Show selected state using border/icon/text, not color alone. All three options must be discoverable on narrow phones; use a scrollable stack or explicit paged carousel with position indicators. No preselected design: require an intentional choice on first run. A temporary neutral welcome surface is not a saved preference.

**Arcade:** near-black canvas, charcoal surfaces, electric lime, compact bold sans and mono labels. Header shows avatar, level/title and streak. Large numeric score, segmented XP bar, and a compact ranking callout. Dark task rows with lime active emphasis. Dark rounded bottom dock with lime central create action. Bonus state shows the ledger-derived bonus; no multiplier/bounty claim is implied.

**Sticker Pop:** warm butter canvas, black ink, thick outlines and offset hard shadows. Bold greeting, tilted yellow streak sticker, blue score panel, mint rank badge and yellow progress bar. Completed chore is mint; points appear in punchy pills. White outlined dock with raised yellow create action. Preserve the reference's playful geometry without compromising tap targets.

**Soft Home:** pale lavender/slate canvas, dark plum text, serif greeting/section titles and sans body. White score card with purple circular progress ring, goal and soft streak chip; pastel household score chips. Airy rows, restrained dividers, purple checked states. Dark plum pill dock with purple add action. Bundle a suitable serif font; do not silently substitute Geist for the defining serif hierarchy.

Treat these as three compositions, not three palette swaps. Shared primitives handle accessibility and actions; scorecards, headers and navigation surfaces can have explicit variant components.

Reference data is demonstration content only and must never be presented as earned/live XP. Derive progress, counts, contributor shares, and rank values from the same model. If no data source is available, label the demo state. Do not reproduce cropped screenshot counts unless the displayed task set proves them.

## File boundaries

Create under `apps/mobile/`:

- `features/appearance/{types,tokens,storage}.ts`: `HouseGainsTheme = 'arcade' | 'sticker' | 'soft'`, semantic color/spacing/type/shape tokens, versioned local storage.
- `features/appearance/appearance-provider.tsx`: hydrated selected/preview theme and persistence actions.
- `features/onboarding/{onboarding-state,onboarding-routing}.ts`: independent progress state and resume decisions.
- `features/onboarding/theme-picker-screen.tsx`, `components/housegains/theme-preview.tsx`: picker experience.
- `features/household/{types,household-client,household-provider}.ts` (provider TSX if it renders): household/member/chore contracts, data boundary, loading/error state.
- `features/household/household-demo-client.ts`: explicit development/demo fixture adapter while API integration is unavailable.
- `features/dashboard/{dashboard-model,use-dashboard}.ts`: derived counts, XP, goal, ranks, completion state.
- `features/dashboard/daily-dashboard-screen.tsx`, `components/housegains/{chore-card,subtask-list}.tsx`: shared screen/actions.
- `components/housegains/variants/{arcade,sticker,soft}-{header,scorecard}.tsx`: distinct compositions.
- `components/housegains/housegains-tab-bar.tsx`: themed safe-area-aware dock.
- Routes `app/onboarding/{index,appearance}.tsx`, `app/household/{create,join,invite}.tsx`, `app/chores/{new,[id]}.tsx`, and `app/(housegains)/{_layout,index,ranks,settings}.tsx`.

Modify `app/_layout.tsx` for provider/guard integration; replace the fitness entry redirect only once HouseGains routing is ready. Preserve auth session primitives, but remove professional/student-role requirements from HouseGains navigation. Inspect `features/auth/auth-route-guard.logic.ts` and its callers before changing shared auth logic. Existing fitness routes are not bulk-deleted as part of a visual feature.

## Task 1 — Document the screen contract

- [x] Keep the screen contract in `apps/mobile/docs/screens/housegains-v1.md`, covering G1–G5, T1–T3, S1–S3, appearance picker, Ranks, Feed, Settings, states, and reference provenance.
- [x] Record decisions and pending wiring (since moved to the tracker).
- [x] Maintain linked FR, BR, UC, AC, test-case, and localized-copy artifacts.
- [x] Keep Today as the dashboard, central add as chore creation, Ranks as household standings, Feed as completion activity, and Settings as personal appearance/language plus creator chore management.

## Task 2 — Appearance foundation and persistence

- [x] Implement the three explicit token sets and storage key `housegains.appearance.v1`.
- [x] Keep preview selection separate from the persisted choice; settings persists immediately after successful save.
- [x] Hydrate before selecting a route or drawing the app shell to prevent wrong-theme flashes.
- [x] Validate stored values; corrupt values return to selection, read failures show retry and a usable picker, write failures retain the choice in memory with a retry message.
- [x] Verify stored-preference rehydration, invalid storage, storage errors and theme changes through unit/component tests; native restart proof remains in Task 7.

## Task 3 — Onboarding picker and route integration

- [x] Build real miniature header/scorecard/chore previews for every option, labels, selection feedback and Continue.
- [x] Wire welcome, preview, commit, back and resume; preserve a pending invite code through appearance and local setup. Production account entry belongs to the pending remote adapter boundary.
- [x] Keep appearance device-local as specified by the PRD; cloud synchronization is separate scope.
- [x] Replace role-based landing decisions with explicit HouseGains setup-state decisions; retain session and terms requirements where applicable.
- [x] Verify first run cannot bypass selection, returning users skip completed onboarding, and saved choices rehydrate through provider tests; device restart remains unverified.

## Task 4 — Shared dashboard state

- [x] Define household memberships, zero-or-more assignees, immutable chore-instance snapshots, ordered subtasks, completion receipts, assist attribution, and XP ledger independently of theme.
- [x] Provide a clearly labeled demo mode when no HouseGains API exists. Production surfaces show unavailable/retry rather than fake live scores.
- [x] Derive progress, XP, completion bonus, contributors, ranks, and feed from one model. Do not assume an unconfigured rank period or tie policy.
- [x] Include empty household, zero tasks, no goal, loading, failure/retry, long names, many subtasks and completed tasks.
- [x] Allow any household member to help with any chore. Award a subtask once to its completing member; partial closure preserves earned XP and has no completion bonus.
- [x] Award the bonus only when every subtask completes before due time; split evenly among unique contributors and give integer remainder to the final subtask completer.
- [x] Restrict undo to the member's own completion within five minutes; reverse the ledger and any instance bonus and reopen the instance as appropriate.

## Task 5 — Three dashboard presentations

- [x] Implement Arcade header, segmented scorecard, task cards and dock against the screenshot.
- [x] Implement Sticker Pop greeting, outlined/shadowed scorecard, rank sticker, chore rows and raised add button.
- [x] Implement Soft Home serif heading, SVG progress ring, member chips, light task rows and pill dock.
- [x] Wire expandable subtasks, multiple-assignee and unassigned states, completion attribution, the 100% bonus state, five-minute undo, and partial closure through shared actions.
- [x] Prevent duplicate taps while saving; failed saves restore the previous state and expose retry. Do not promise offline queuing without a server idempotency contract.
- [x] Use subtle completion feedback with reduced-motion support; never require animation, sound or haptics to understand state.

## Task 6 — Supporting navigation and settings

- [x] Build G1–G5 household setup/join and T1–T3 chore management in the selected design. Validate invite policy, 1–10 subtasks, 5–100 XP per subtask, 0–50 bonus XP, recurrence, due time, and zero-or-more household assignees.
- [x] Bind to the household client boundary; label demo data clearly until backend integration is delivered.
- [x] Add Ranks with an explicit configured period/tie policy, Feed from completion activity, and Settings with appearance/language controls.
- [x] Keep multiplier bounties, spot requests, photo proof, comments, and reactions outside the active contract unless separately specified.
- [x] Apply all three themes consistently across onboarding, forms, detail, ranks, settings, sheets and error states.

## Task 7 — Acceptance and evidence

- [x] Populate all new copy keys in `localization/housegains/` en-US, pt-BR and es-ES modules and document them in the localized-copy table.
- [x] Add meaningful logic tests for appearance hydration/resume, catalog-copy isolation, invitation lifecycle, snapshot immutability, duplicate completion, exact bonus split, due cutoff, partial closure, and undo. Add component tests for picker selection, assignments, and subtask actions.
- [x] Use existing component runner: `cd apps/mobile && bun run test:component -- --runInBand`. Run scoped test files first, then relevant existing navigation/localization regression checks.
- [x] Run `cd apps/mobile && bunx tsc --noEmit` and `bun run lint`; distinguish pre-existing failures from introduced failures. Confirm script availability before execution.
- [ ] Exercise native flows using available T3 device tools: pick each design, restart, complete/expand a chore, open create, navigate ranks/settings, switch design and confirm the same data remains.
- [ ] Capture all three dashboards and picker on the same device/data for comparison with the screenshot. Verify small phone, larger phone, large text, keyboard, long Portuguese/Spanish copy, screen-reader labels, 44pt/48dp targets, contrast and reduced motion.
- [x] Update docs with actual implemented/wired status. Report static checks, component checks and native visual acceptance as separate evidence.

## Delivery order and completion boundary

1. Appearance foundation → picker → routing.
2. Household/membership/catalog/invites → chore builder and recurrence snapshots.
3. Completion ledger/bonus/undo → S1–S3, Ranks, Feed, and Settings across all three compositions.
4. Localization/accessibility → native visual acceptance.

Commit coherent milestones during implementation. No deployment or database writes are included. UI completion means navigable, tested themed flows with an honest data-source status; production collaborative XP requires separately validated backend transactions, authorization and idempotency.


## Delivery decisions and remaining external work

- New households have a recorded 400 XP weekly goal. Scorecards use weekly XP/goal; missing goals render unavailable progress. Goal editing remains outside this slice.
- Appearance and data are independently persisted. The mobile adapter is explicitly local; authenticated Elysia/PostgreSQL routes and three unapplied SQL migrations were also implemented, but the production mobile adapter is not connected.
- HTTPS invite registration is present in client metadata. Live domain association, store/deferred-install delivery, push, and real cross-device membership updates require service wiring and separate evidence.
- Native acceptance is blocked: the original selected simulator belonged to Comradia; the authorized new HouseGains QA simulator was created but was absent from device-panel discovery after the required refresh/retry. No other session was taken over.
