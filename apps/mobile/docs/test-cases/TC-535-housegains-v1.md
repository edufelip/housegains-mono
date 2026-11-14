# TC-535 HouseGains v1

**Status:** Local automated checks are recorded in the repository-root `docs/implementation/housegains-verification.md` and `housegains-localization-verification.md`. Native visual, accessibility, and restart acceptance remain pending; these cases do not imply production validation.

## Test cases

| ID | Area | Preconditions | Steps | Expected result |
|---|---|---|---|---|
| TC-535 | Appearance | Fresh setup, three variants available | Preview each style, select one, continue, restart, then change style in Settings | Intentional selection persists; all previews use the same content; changing style leaves household data unchanged. |
| TC-536 | Household and invite | Creator household exists | Generate, share, join with a valid invite; attempt a 7-day-expired, revoked, malformed, and eight-use invite | Code alphabet/length and lifecycle rules are enforced; only valid join adds membership; QR and deep link resolve to the same invite. |
| TC-537 | Catalog copies | Household and catalog template exist | Add a catalog chore; change template fixture; reopen household chore | Household copy retains its own content and is not mutated by catalog source change. |
| TC-538 | Assignments | Household has multiple members | Save two assignees, then zero assignees; attempt to assign a non-member | Multiple and unassigned states save; non-member assignment is rejected. |
| TC-539 | Builder validation | Creator opens custom builder | Save at boundaries 1 and 10 subtasks, 5 and 100 XP, 0 and 50 bonus; try out-of-range values | Boundary values save; values outside the contract are rejected with localized errors. |
| TC-540 | Recurrence and due time | Creator owns a chore | Configure daily, `FREQ=DAILY;INTERVAL=N`, and `FREQ=WEEKLY;BYDAY=...` recurrence; generate future instances | Each occurrence uses the household timezone captured at creation and snapshots definition, subtasks, bonus, and assignees. N is 1–365; a nonexistent DST wall time shifts forward by the gap duration. Production timezone changes remain open. |
| TC-541 | Creator permissions and history | Creator and member exist; current and future instance snapshots exist | Member attempts edit/pause/delete; creator edits, pauses, and deletes definition | Non-creator mutations fail; future-instance behavior follows creator action; existing snapshots/history remain unchanged. |
| TC-542 | Unique completion and assist | Open instance with at least two subtasks and multiple household members | Assigned member completes one; non-assigned member completes another; replay first completion | Each subtask has one receipt; XP goes to completing member; assist attribution is recorded; duplicate replay gives no XP. |
| TC-543 | Even bonus and remainder | Chore has bonus XP not divisible by unique contributor count | Contributors complete every subtask before due, with a known final completer | Bonus splits evenly; only unique contributors receive shares; integer remainder goes to final completer. |
| TC-544 | Bonus due cutoff | Open instance with due time | Complete all subtasks just before due; repeat with final subtask at/after due | Before due earns bonus; at/after due earns no bonus. |
| TC-545 | Partial closure | Instance has completed and incomplete subtasks | Close instance partially | Existing subtask XP remains in ledger; no completion bonus appears. |
| TC-546 | Undo | Member has own completion; another member has a completion; bonus has been paid in one fixture | Undo own receipt within five minutes; attempt another member's receipt and an expired undo | Own in-window undo reverses the receipt and any instance bonus and reopens as applicable; other-member and expired undo are denied. |
| TC-547 | Today, detail, bonus, ranks, and feed | Household has open, partial, and completed instances | Open S1, S2, S3, Ranks, and Feed; inspect attribution and empty/loading/error fixtures | Screen state derives from the same ledger; all states are visible; no unsupported comments, reactions, photo proof, or multiplier claims appear. |
| TC-548 | Localization and accessibility | HouseGains screens available | Select en-US, pt-BR, es-ES, fr-FR, de-DE and it-IT before setup and in Settings; restart; fail and retry language persistence; inspect catalog customization; use screen reader, large text, and reduced motion | System UI and unchanged catalog defaults follow the selected language; user-edited names stay literal; language persists independently of style; save failures retain the prior language and offer retry. Labels/states are meaningful; layout remains usable and motion can be reduced. |
| TC-549 | Demo and unavailable data | Local/demo adapter and unavailable remote service | Create/join/complete in demo mode; simulate remote unavailable state | UI labels local/demo behavior and does not represent it as cross-device or production success. |

## Traceability

- Requirements: [FR-275](../functional-requirements/FR-275-housegains-v1.md)
- Rules: [BR-413](../business-rules/BR-413-housegains-domain.md)
- Use cases: [UC-004](../use-cases/UC-004-housegains-household-and-xp.md)
- Acceptance: [AC-618–AC-630](../acceptance-criteria/AC-007-housegains-v1.md)
- Screens: [HouseGains v1 screen specification](../screens/housegains-v1.md)
