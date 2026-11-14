# FR-275 HouseGains v1

**Status:** In progress. This requirement set defines intended product behavior; implementation and production wiring are not verified.

## Scope

HouseGains gives a household-owned membership, chore-definition, scheduled-instance, completion-ledger, and activity model with three selectable visual styles. The active implementation contract is authoritative for latest screenshot requirements.

## Requirements

- **FR-275.1 Household setup and membership:** A creator can create a household and invite members. The creator can later update its name, icon, color, and photo in Settings without replacing its identity, timezone, members, or invite. A member can join through a code or its QR/deep link. Assignment and completion records must reference household members.
- **FR-275.2 Invitation policy:** Codes are six uppercase alphanumeric characters using A–Z except I/O and digits 2–9, expire after seven days, allow up to eight uses, and are invalidated by regeneration.
- **FR-275.3 Catalog ownership:** Selecting a catalog chore creates a separate household-owned copy. Later catalog edits do not alter that copy.
- **FR-275.4 Chore authoring:** The creator can build chores with a name, icon, category, 1–10 ordered subtasks, 5–100 XP per subtask, 0–50 bonus XP, recurrence of daily, weekly selected days, or every 1–365 days, a due time in the household's captured IANA timezone, and zero or more assignees.
- **FR-275.5 Instance history:** Scheduled instances snapshot chore content, subtasks, bonus, assignees, and due time. Definition changes apply to future instances only. Creator-only edit, pause, and delete operations affect future instances.
- **FR-275.6 Completion ledger:** Each subtask can be credited once per instance. Store member attribution, XP, completion instant, and assist attribution. Any household member may help, including a non-assignee; XP goes to the member who completed the subtask.
- **FR-275.7 Bonus:** If all subtasks complete before due time, split the bonus evenly among unique contributors. Allocate any integer remainder to the final subtask completer.
- **FR-275.8 Partial closure and undo:** Closing an instance partially preserves already earned subtask XP and awards no completion bonus. A member may undo only their own completion within five minutes; undo reverses its ledger effect, reverses any instance bonus award, and reopens the instance as appropriate.
- **FR-275.9 Product surfaces:** Provide G1–G5 setup/join, T1–T3 chore management, S1–S3 Today/detail/bonus, plus the three-style appearance picker, Ranks, Feed, and Settings as described in the [screen specification](../screens/housegains-v1.md).
- **FR-275.10 Honest data state:** Local/demo behavior is labeled. The app must not imply cross-device synchronization, remote membership, or live household XP until its production service is wired.
- **FR-275.11 XP progression:** The local scorecard derives weekly totals and all-time XP from signed ledger rows. Weekly totals start Monday 00:00 in the captured household timezone. Level is `floor(totalXP / 100) + 1`; title is Rookie below level 5 and Tidy Titan at level 5 or above. Local streak uses consecutive household-timezone dates with net-positive current-member XP as the implementation's current proxy.

- **FR-275.12 Mandatory localization:** All active HouseGains UI, catalog defaults, validation and accessibility labels support English, Portuguese (Brazil), Spanish, French, German and Italian. Detect a supported device language on first launch; allow selection before household setup and later in Settings. Persist language independently of the visual style, retain the saved locale after failed writes, and expose retry. Preserve user-authored names literally.

## Not decided by this requirement

The local adapter captures and uses the household's creation timezone, supports every-N intervals from 1 through 365, rejects nonexistent daylight-saving wall times, and resolves an ambiguous repeated wall time to the first exact match. Production behavior if the household timezone changes remains unresolved. Rank period and tie policy, detailed assist-flag semantics beyond storing completion attribution, and production endpoint/schema ownership also require explicit follow-up. See [D-222](../discovery/decisions-log-v1.md) and the [pending wiring checklist](../discovery/pending-wiring-checklist-v1.md).

## Traceability

- Business rules: [BR-413](../business-rules/BR-413-housegains-domain.md)
- Use case: [UC-004](../use-cases/UC-004-housegains-household-and-xp.md)
- Acceptance: [AC-618–AC-630](../acceptance-criteria/AC-007-housegains-v1.md)
- Test cases: [TC-535–TC-549](../test-cases/TC-535-housegains-v1.md)
