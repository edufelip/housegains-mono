# HouseGains v1 Screen Specification

**Status:** In progress. This is the behavior and visual contract for implementation; screen implementation and production wiring are not verified by this documentation update.

## Authority and scope

- Domain and latest screenshot requirements: [HouseGains implementation contract](../../../../docs/implementation/housegains-contract.md). It supersedes older conflicting PRD/plan text.
- Product summary: [PRD](../../../../docs/PRD.md).
- Visual references: the supplied Arcade, Sticker Pop, and Soft Home screenshots, summarized in [DESIGN.md](../../DESIGN.md). Detailed unseen artifact content is not assumed.
- Requirements, rules, use cases, acceptance, and test scenarios are linked below.
- All new copy is expected in en-US, pt-BR, es-ES, fr-FR, de-DE, and it-IT; the current copy inventory is in [localized-copy-table-v2.md](v2/localized-copy-table-v2.md).

## Journey

New household: appearance picker → G1 Create household → G2 Pick chores → G3 Invite housemates → G4 Assign chores → Today. Existing member: appearance picker → G5 Join by code or deep link → Today. The first creator may continue to Settings, Ranks, or Feed from the household shell. Settings can reopen the appearance picker without restarting onboarding. On the appearance picker, swiping only previews; the page's "Choose {style}" button is the only action that saves the style and continues.

The shared shell exposes Today, chore creation, Ranks, Feed, and Settings. Creating or selecting a chore never changes its XP behavior by appearance.

## Screen inventory

Routes are proposed product destinations; route wiring remains part of implementation.

| ID / screen | Proposed destination | Purpose and primary actions | Required states and rules |
|---|---|---|---|
| Appearance picker | Onboarding / appearance | Horizontal pager of full-screen pages in config order (Sticker Pop, Arcade, Soft Home), each drawn in its own style with a mini phone sample of the same content. Swipe, Previous, or Next only previews; each page's "Choose {style}" button saves and continues. | No pre-selection; saving locks the pager and buttons; per-page save error with "Retry save"; load error with "Try loading again"; selected state is not color-only; all pages reachable on narrow screens; preview does not commit; selected style persists through restart; language sheet applies a choice immediately, with Retry on failure. |
| G1 Create household | Household / create | Enter household name and choose household icon/color; create as creator. The creator can edit the profile later in Settings. | Loading, invalid/missing name, failure/retry, success. Do not show live membership before creation succeeds. |
| G2 Pick chores | Household / catalog | Browse catalog and add selected chores to the household. | Empty/loading/error; a selection creates a household-owned copy with its own subtasks and XP. |
| G3 Invite housemates | Household / invite | Show invite code, QR, and shareable deep link; regenerate invite. | Code is six characters from A–Z excluding I/O and 2–9; seven-day expiry; eight uses; expired, exhausted, and revoked states are explicit; regenerating revokes the old code. |
| G4 Assign chores | Household / assignments | Multi-select current members for each chore or choose Unassigned; save assignments. | Assignment IDs must belong to the household; zero, one, or several assignees are valid. |
| G5 Join | Household / join | Enter a code or open a QR/deep link and join its household. | Invalid, expired, revoked, exhausted, already-member, loading, and failure states; membership is added only after successful join. |
| T1 Settings > Chores | Settings / chores | Browse chore definitions; add a catalog copy or custom chore; creator can edit, pause, or delete future instances. | Member can read but not mutate creator-owned definitions; loading, empty, error, paused, active. Historical instance snapshots and earned XP remain unchanged. |
| T2 Custom chore builder | Chores / new or edit | Set name, icon, category, subtasks, XP, completion bonus, recurrence, due time, and assignments. | 1–10 subtasks; each 5–100 XP; bonus 0–50 XP; daily, weekly selected days, or every 1–365 days; emit canonical RRULE values; show field-specific validation. |
| T3 Catalog chore detail | Catalog / chore detail | Preview the catalog definition and add a copy to the household. | Catalog source is read-only; add creates a separate household-owned copy; loading, missing item, and save failure are visible. |
| S1 Today with subtasks | Today | See household chore instances, progress, assignments, due time, earned XP, and expand subtasks. Complete an available subtask or open details. | Loading, empty, open, partial, done, due-passed, failure/retry, and local/demo states; any household member can help, whether assigned or not. |
| S2 Chore detail | Chore / instance detail | Inspect the immutable instance snapshot, assignees, subtask contributors, completion times, XP ledger, due state, and allowed actions. | Definition edits never rewrite this snapshot; duplicate completion is rejected; a member can undo only their own completion for five minutes. An "Under review" state appears while a dispute is open; each admin revocation names the acting admin, verdict, step, and XP. Members without admin rights can report others' completions within 72 hours (step picker plus an optional reason of up to 280 characters), hidden for resolved or expired disputes, repeat reports by the same member, and out-of-window completions. Admins see "Mark as not done" and "Mark as partially done" (strict-subset picker, hidden for a single completed step) within the window; an admin who completed a disputed step and is not the only admin sees a conflict note instead of "Mark as not done", and the partial picker offers only other members' steps (the partial action is hidden unless the picker has steps to split). |
| S3 100% bonus | Chore / completed instance | Show that all subtasks are complete, who earned each subtask, the completion bonus, and each contributor's bonus share. | The completion disc grows with its text (never a fixed circle): a large "100%" with its word on a smaller line, and the bonus sentence below the disc, at every text size and language. A badge earned by the completing action shows in a section under the title (gamification visible only). Bonus is awarded only when all subtasks complete before due time; split evenly among unique contributors; integer remainder goes to the final subtask completer; undo within the allowed window reverses the instance bonus ledger and reopens it. |
| Ranks | Ranks | Show household members and XP standing from completion-ledger data. | Empty and loading states; identify the ranking period and tie behavior when configured. The period/tie policy has not been decided by the current contract. A "Last week" card shows the latest closed week snapshot: the top member of the week (name, steps, XP) and the wall of shame (name, missed of assigned chores); each part is hidden when the backend recorded none, with a "No week has closed yet" state before the first close; titles are never conveyed by color alone. |
| Feed | Feed | Show completion activity with member, chore instance, and timestamp; completion creates the activity entry. | Empty/loading/error/retry states; no comments, reactions, photo proof, or bonus-multiplier claims in v1. |
| Reports | Settings / reports | Admins review open completion disputes: chore, reporter names, reasons, and disputed steps with completers; verdicts Done / Partially done (strict-subset picker) / Not done. | Admins only, reachable from Settings with a pending count badge; loading, empty, and error-with-retry states via StatePanel; partial hidden when fewer than two steps are disputed; a conflicted admin (completed a disputed step, not the only admin) sees the note that another admin must review instead of the verdict buttons. |
| Settings | Settings | Change appearance or language, edit the household profile as creator, manage member roles, and open chore management or completion reports. | Profile edits preserve household identity, timezone, members, and invite. The creator grants and removes the admin role with a confirmation and visible busy/failure states; the member list shows each role label. Theme changes do not change tasks or XP; settings and picker remain accessible after onboarding. |
| Ganhos chip | Today (dashboards) | Entry to the Ganhos wallet showing the available balance. | Only when the program is visible (BR-413 rule 22); accessible name includes the balance; 44 dp target; absent otherwise. |
| Wallet | Today → Ganhos | Private Ganhos balance, pending balance with its available date, lifetime total, level ring with title and progress, achievements grid, recent ledger rows, entry to the weekly streak. | StatePanel loading / error with retry / empty before the first earn; balance counts up from the last seen value (600 ms) and rows stagger by 40 ms (final value at once with reduced motion); tier shown as text and pips; Active, Paused, Seasonal, Locked pills with an icon; rows name the rule, show a signed amount and the date. |
| Weekly streak | Wallet → Weekly streak | Streak counter, recent week cells, rest passes ("folgas"), milestones, Away mode. | Counted: counter ticks (300 ms), flame 1→1.25→1, cells fill (450 ms), next-milestone chip after 250 ms; reduced motion is static with "Week secured". Broken: only "Sua sequência descansou. Recorde: N semanas." (no zero, no red). None: how to start. Away mode: Monday chips with a checked state, client and server validation as localized text with an icon, saved confirmation, disabled while saving. |
| Earned toast | Overlay, any screen | Title, amount counting up (500 ms), particles (700 ms), breakdown of parts; auto-dismiss after 2.4 s; tap to dismiss. | Does not block the screen below; same copy announced via `announceForAccessibility`; reduced motion: fade in, final number, no particles, 3 s. Zelo toasts only reach the creator. |
| Achievement unlock | Overlay, full screen | Medal scales from 0.4 and turns once (600 ms), tier ring draws in (500 ms), confetti 1.6 s, name, tier text, description, reward, Continue (active at 400 ms). | At most one per app session; reduced motion: cross-fade to the final card, no spin or confetti; modal for screen readers. |
| Level-up moment | Overlay | New level number and title; ring fills to 100 %, resets, the number flips (800 ms). | Stays 3 s; reduced motion: static card. Skipped (acknowledged unseen) when the level is at or below the member's level floor; shows the level the rest of the app displays. |
| Organizer card | Ranks | Creator's Care, organizer title, "Casa em dia" streak, recent on-time ring (700 ms) and bars (500 ms), organizer achievements. | Visible to every member only when the program is visible; loading / error with retry / not-yet-earned states; never shows a spendable balance. |

## Shared presentation rules

- Arcade, Sticker Pop, and Soft Home are distinct compositions described in [DESIGN.md](../../DESIGN.md); reuse domain logic and actions across them. The Arcade level uses the level curve of FR-275.16 (new curve, `levelFloor`/`xpPeak` aware, six title bands).
- The scorecard's weekly totals begin Monday at 00:00 in the captured household timezone. In this local slice, streak is derived from consecutive dates with net-positive XP for the current member; this is a ledger activity proxy.
- Progress counts, XP, assignment labels, ranks, and bonus shares come from household and instance data. Reference/sample values are not earned or live state.
- Local/demo adapter behavior must be labeled. Do not imply a local join, invite, feed, completion, or score is synchronized to another device.
- Before household setup, provide a six-language picker (English, Portuguese, Spanish, French, German, Italian) alongside the three visual-style choices. Persist language independently of style and allow changes in Settings. Translate unchanged catalog defaults while preserving user edits. The [six-language copy table](housegains-localized-copy.md) lists active app strings.
- All screens need accessible names and states, readable contrast, large-text support, and reduced-motion behavior. Localize all user-facing labels, validation, empty/error states, and accessibility labels.

## State and history contract

A chore definition generates instances with snapshots of chore details, ordered subtasks, bonus, assignees, recurrence occurrence, and due time. Editing applies to future instances only. Pausing or deleting a definition affects future instances only. Each subtask has at most one completion receipt in an instance; the receipt stores member, XP, completion instant, and assist attribution. Partial closure keeps earned subtask XP but awards no completion bonus. Undo is limited to the completing member's own receipt and five minutes; it reverses ledger effects, including the instance bonus, and reopens the instance as applicable.

The local adapter captures the household's IANA timezone at creation, uses it for recurrence dates and due times, supports every-N values from 1 to 365, shifts DST gap times forward by the gap duration and resolves repeated times to the earlier instant. Production behavior after a timezone change remains open. The local view uses Monday-start household weeks and competition ranks: equal XP shares a rank. Production winner snapshots and reset scheduling remain separate service work.

## Traceability

| Artifact | Coverage |
|---|---|
| [FR-275 HouseGains v1](../functional-requirements/FR-275-housegains-v1.md) | Product behavior and screen scope |
| [BR-413 HouseGains domain rules](../business-rules/BR-413-housegains-domain.md) | Membership, snapshots, invitations, XP, undo, moderation, and weekly standings |
| [UC-004 household and chore journeys](../use-cases/UC-004-housegains-household-and-xp.md) | Creator, member, helper, invitation, reporting, and admin flows |
| [AC-618–AC-646](../acceptance-criteria/AC-007-housegains-v1.md) | Observable acceptance rules |
| [TC-535–TC-568](../test-cases/TC-535-housegains-v1.md) | Planned functional and screen checks |
| [D-222](../discovery/decisions-log-v1.md) | Contract authority and open decisions |
| [HouseGains pending wiring](../discovery/pending-wiring-checklist-v1.md) | Local/demo, server, invite, and localization wiring |
