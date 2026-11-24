# AC-007 HouseGains v1

**Status:** Local UI/domain implemented with automated evidence in `docs/implementation/housegains-verification.md` at repository root. Native visual/accessibility acceptance and remote-service wiring remain pending; the criteria below are not a claim of production validation.

## Acceptance criteria

- **AC-618 — Appearance picker:** Given first-run setup, when a member swipes through the three pages, then nothing is pre-selected, no style is saved until that page's "Choose {style}" button is pressed, and all three pages are reachable and distinguishable without color alone.
- **AC-619 — Household and invite:** Given a creator, when an invite is generated, then it is six characters from the allowed alphabet, expires in seven days, permits at most eight successful joins, supports code/QR/deep link, and regeneration invalidates the previous code.
- **AC-620 — Membership and catalog copies:** Given a member joins or selects a catalog chore, when the operation succeeds, then the membership is recorded or an independent household-owned chore copy is created; changing the source catalog does not mutate the copy.
- **AC-621 — Assignment and builder limits:** Given a household chore, when the creator saves it, then it can have zero or multiple member assignees and has 1–10 subtasks, 5–100 XP per subtask, and 0–50 bonus XP.
- **AC-622 — Recurrence and snapshots:** Given daily, selected-weekday, or every-1–365-day recurrence with due time, when an instance is generated, then it uses the household's captured IANA timezone and snapshots chore, subtask, bonus, assignment, and due-time values; later edits affect future instances only. Spring-forward gap times shift forward by the gap duration, and repeated fall-back times use the earlier instant.
- **AC-623 — Creator permissions:** Given a member who is not the chore creator, when that member attempts to edit, pause, or delete future instances, then the operation is denied. The creator may perform those operations without changing historical instances.
- **AC-624 — Unique completion ledger:** Given an open instance, when a household member completes a subtask, then one receipt records the member, XP, completion instant, and assist attribution; retrying the same completion cannot award XP twice.
- **AC-625 — Helping and attribution:** Given an assigned or unassigned chore, when any household member completes a subtask, then the completing member receives that subtask's XP even if not assigned.
- **AC-626 — Completion bonus:** Given all subtasks are completed before due time, when the instance becomes done, then bonus XP is divided evenly among distinct contributors and any integer remainder goes to the final subtask completer. If completion occurs at or after due time, no completion bonus is awarded.
- **AC-627 — Partial closure and undo:** Given an instance closes partially, when its state is saved, then earned XP remains and no completion bonus is awarded. Given a member undoes their own completion within five minutes, then that ledger effect and any instance bonus are reversed and the instance reopens as applicable.
- **AC-628 — Ranks, feed, and settings:** Given recorded household activity, when a member opens Ranks or Feed, then the surfaces use recorded member/instance/XP data and show empty, loading, and error states. The Arcade level uses all-time net XP (`floor(totalXP / 100) + 1`) with Rookie below level 5 and Tidy Titan from level 5. The creator can update the household profile in Settings; changing appearance leaves household data unchanged.
- **AC-629 — Honest unavailable states:** Given the local/demo adapter or an unavailable production service, when a surface displays data or an action result, then it identifies local/demo state and does not imply remote synchronization or confirmed cross-device success.
- **AC-630 — Localized and accessible surfaces:** Given any HouseGains screen, when rendered in en-US, pt-BR, es-ES, fr-FR, de-DE, or it-IT, then all system-provided visible copy is localized and controls expose readable labels, state, and reduced-motion-compatible behavior. A language selected in onboarding or Settings persists across remounts without changing the chosen style or user-authored names; failed persistence offers retry and retains the previous saved language.
- **AC-631 — Admin role management:** Given the household creator, when granting or removing a member's admin role in Settings, then each change requires a confirmation, shows busy and failure states, and updates the visible role label; the creator cannot change their own role.
- **AC-632 — Member report:** Given a member without admin rights, when a completion by someone else is younger than 72 hours and its instance has no resolved or expired dispute, then "Report: not done" lets them pick the disputed steps and an optional reason (0–280 characters); repeat reports by the same member and out-of-window completions are refused with the reason.
- **AC-633 — Admin verdicts:** Given an admin and an open report, then the reports screen lists the chore, reporter names, reasons, and disputed steps with completers, and the verdicts Done / Partially done / Not done apply the contract rules; the partial option is hidden when fewer than two steps are disputed and its confirm stays disabled until the selection is a non-empty strict subset.
- **AC-634 — Conflict of interest:** Given an admin who completed one of the disputed steps and is not the only admin, then the verdict actions are replaced by a conflict note; another admin must review.
- **AC-635 — Revocation transparency:** Given a verdict that revokes steps, then the chore detail shows an "Under review" state while the dispute is open and afterwards lists each revocation with the acting admin and the verdict, without relying on color alone.
- **AC-636 — Weekly standings:** Given the latest closed week, then Ranks shows the top member of the week and the wall of shame with the recorded counts; each part is hidden when the backend recorded none, and before the first close an explicit "no week has closed yet" state appears.

## Acceptance examples

- **Given** a chore with 10 XP subtasks completed by member A and member B and a 5 XP bonus, **when** B completes the final subtask before due, **then** B receives the remainder after the even split.
- **Given** a completion that triggered a bonus, **when** its owner undoes within five minutes, **then** the completion and bonus ledger entries reverse and the instance reopens.
- **Given** a paused or edited definition with an existing scheduled instance, **when** the instance is viewed, **then** its captured definition and earned history remain unchanged.
- **Given** an admin who completed one of the disputed steps, **when** another admin exists, **then** the first admin sees a conflict note instead of verdict actions and the backend rejects their attempt.
- **Given** a dispute with a single disputed step, **when** an admin reviews it, **then** only Done and Not done are offered.

## Traceability

- Requirements: [FR-275](../functional-requirements/FR-275-housegains-v1.md)
- Business rules: [BR-413](../business-rules/BR-413-housegains-domain.md)
- Use cases: [UC-004](../use-cases/UC-004-housegains-household-and-xp.md)
- Screens: [HouseGains v1 screen specification](../screens/housegains-v1.md)
- Test cases: [TC-535–TC-556](../test-cases/TC-535-housegains-v1.md)
