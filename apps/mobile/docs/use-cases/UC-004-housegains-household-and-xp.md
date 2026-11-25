# UC-004 HouseGains Household and XP Journeys

**Status:** In progress. These flows are specified; implementation is not verified.

## UC-004.1 Create and configure a household

- **Primary actor:** Creator
- **Trigger:** Selects Create household after choosing an appearance.
- **Preconditions:** The app has a usable local/demo or production data source. The source state is identified to the user.
- **Main flow:**
  1. Creator enters household name and profile appearance; the creator may later update name, icon, color, or photo in Settings without replacing the household id, timezone, members, or invite.
  2. Creator selects catalog chores; each selection becomes a household-owned copy.
  3. Creator creates or reviews chore definitions and chooses zero or more current members as assignees.
  4. Creator issues an invite and shares its code, QR, or deep link.
  5. Household opens Today with setup complete.
- **Alternate flows:** Catalog is empty/unavailable; chore save fails; invite generation fails. Show retry or continue without an invite where safe; do not fabricate a successful remote action.
- **Postconditions:** Household and chore definitions are visible in the selected data source. Catalog templates remain independent from household copies.

## UC-004.2 Join a household

- **Primary actor:** Invited member
- **Trigger:** Opens a deep link/QR or enters a six-character invite.
- **Preconditions:** Invite exists, has not expired or been revoked, and has fewer than eight successful uses.
- **Main flow:**
  1. App resolves the code and presents the household identity.
  2. Member confirms joining.
  3. Successful join adds the member to household membership and opens Today.
- **Alternate flows:** Invalid, expired, revoked, exhausted, already-member, or unavailable invite. Explain the reason and offer a usable retry path; do not add membership on failure.
- **Postconditions:** The member is a household member only after the source confirms the join.

## UC-004.3 Build or maintain a chore

- **Primary actor:** Household creator
- **Trigger:** Opens Settings > Chores or a catalog chore detail.
- **Main flow:**
  1. Creator opens a catalog detail or custom builder.
  2. Creator defines name, icon, category, 1–10 subtasks with 5–100 XP each, 0–50 bonus XP, daily/weekly/every-1–365-day recurrence, due time in the captured household timezone, and zero or more assignees.
  3. App validates limits and saves the chore.
  4. Creator may edit, pause, or delete the definition and its future instances.
- **Alternate flows:** Invalid limits, non-member assignment, save failure, or non-creator mutation attempt are rejected with visible reasons.
- **Postconditions:** Existing instance snapshots and ledger history remain unchanged; definition changes apply to future instances only.

## UC-004.4 Complete, assist, undo, or partially close an instance

- **Primary actors:** Household member; assigned member or helper
- **Trigger:** Opens Today or Chore detail and completes a subtask.
- **Main flow:**
  1. Member views the instance's due time, assignments, subtasks, and progress.
  2. Any household member completes an available subtask. The instance records one attributed receipt and credits its XP to that member.
  3. Other members may complete different subtasks. Duplicate completion of a subtask for the same instance is rejected.
  4. When all subtasks finish before due time, the instance closes done and splits its completion bonus among unique contributors; any remainder goes to the final subtask completer.
  5. Feed records the completed instance with member and timestamp. Ranks use the recorded XP ledger.
- **Alternate flows:** If the instance closes before all subtasks finish, status is partial, earned XP remains, and no bonus is paid. A member may undo only their own completion within five minutes; this reverses ledger effects, including any instance bonus, and reopens the instance as appropriate.
- **Postconditions:** XP, attribution, instance status, and feed entries are derived from the same instance ledger.

## UC-004.5 Report a completion and review it as an admin

- **Primary actors:** Household member (reporter); household admin (reviewer)
- **Trigger:** A member sees a completion by someone else that was not actually done; an admin opens the reports screen or a disputed chore detail.
- **Preconditions:** The completion is younger than 72 hours, the instance has completions, and no resolved or expired dispute covers it. The reporter has no admin rights and has not reported this instance before.
- **Main flow:**
  1. Member opens the chore detail and chooses "Report: not done"; the disputed steps (completed by others, inside the window) come preselected and the member may adjust the selection and add an optional reason (0–280 characters).
  2. The report opens a dispute; the chore detail shows an "Under review" state, and admins get a notification.
  3. An admin opens the reports screen, sees the chore, reporter names, reasons, and disputed steps with completers, and picks a verdict: Done, Partially done (a strict subset of steps to revoke), or Not done.
  4. Revoked steps lose their XP, appear on the chore detail as revocations naming the acting admin and the verdict, and the dispute closes.
- **Alternate flows:** An admin who completed a disputed step (and is not the only admin) sees a conflict note instead of verdict actions on the Reports screen; another admin reviews. On the chore detail the same admin has no "Mark as not done" (it would revoke their own step) but can still give a partial verdict on other members' steps; the partial action only appears when the picker (in-window steps they may select) has something to split. Reports past the 72-hour window, on resolved or expired disputes, or duplicate reports by the same member are refused with the reason. A failed submission keeps the sheet open, shows the localized failure, and allows retry.
- **Postconditions:** The dispute status, verdict, and revocations come from the backend; the client never writes moderation paths directly.

## UC-004.6 Manage admin roles and view last week's standings

- **Primary actors:** Household creator; household member
- **Trigger:** The creator opens Settings → members, or any member opens Ranks after a week closes.
- **Main flow:**
  1. Creator makes a member an admin or removes the role with a confirmation; the member list reflects the new role label immediately.
  2. Ranks shows the latest closed week: the top member of the week and the wall of shame with the recorded counts.
- **Alternate flows:** A role change or standings load fails; the failure is shown with retry and no success is implied.
- **Postconditions:** Roles and week snapshots stay server-owned; the client only renders what the backend recorded.

## UC-004.7 Earn Ganhos and celebrate

- **Primary actors:** Household member (also the creator, for Care)
- **Preconditions:** The program is visible (flag on and live cohort, BR-413 rule 22).
- **Trigger:** The member completes a step, finishes a chore, shares a completion, or opens the app after a week closed.
- **Main flow:**
  1. The callable response (or the inbox) delivers celebrations; the app dedupes them by id.
  2. A toast shows the amount counting up; a level-up or streak milestone shows its moment; a silver or gold badge shows the full-screen unlock (once per session).
  3. When the same action finished the chore, a badge shows inside the S3 screen instead.
  4. Inbox rows are acknowledged once shown (failed acknowledgements are retried with a backoff). A level celebration at or below the member's level floor is acknowledged without being shown.
- **Alternate flows:** Reduced motion shows the final numbers without particles or spin. Later full-screen badges and bronze badges are toasts. Control/shadow households and the flag-off app see nothing.
- **Postconditions:** Balances, levels, streaks and badges are server-owned; the client only renders them.

## UC-004.8 Review the wallet and the weekly streak, and set Away mode

- **Primary actor:** Household member
- **Trigger:** The member taps the Ganhos chip on Today.
- **Main flow:**
  1. The wallet shows the private balance (counting up from the last seen value), pending balance and the date it becomes available, lifetime total, level ring, achievements and recent activity.
  2. The member opens the weekly streak: week cells, counter, rest passes and milestones.
  3. The member picks Mondays for Away mode and saves; the app confirms.
- **Alternate flows:** Loading, an error with retry, and an empty state before the first earn. A broken streak shows the calm message with the record. A pick that is not a future Monday or exceeds three weeks in the calendar year is refused with a localized message, before or after the call.
- **Postconditions:** Away weeks are stored on the wallet by the backend; the streak waits and reminders stay quiet.

## UC-004.9 See the household organizer

- **Primary actor:** Any household member
- **Trigger:** The member opens Ranks.
- **Main flow:** The organizer card shows the creator's Care, organizer title, "Casa em dia" streak, the recent on-time rate and organizer achievements.
- **Alternate flows:** Loading, an error with retry, and the not-yet-earned state (zero Care and a start message).
- **Postconditions:** Read-only; the creator's Zelo is never a spendable balance.

## References

- [Screen specification](../screens/housegains-v1.md)
- [FR-275](../functional-requirements/FR-275-housegains-v1.md)
- [BR-413](../business-rules/BR-413-housegains-domain.md)
- [AC-618–AC-646](../acceptance-criteria/AC-007-housegains-v1.md)
- [TC-535–TC-568](../test-cases/TC-535-housegains-v1.md)
