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

## References

- [Screen specification](../screens/housegains-v1.md)
- [FR-275](../functional-requirements/FR-275-housegains-v1.md)
- [BR-413](../business-rules/BR-413-housegains-domain.md)
- [AC-618–AC-630](../acceptance-criteria/AC-007-housegains-v1.md)
- [TC-535–TC-549](../test-cases/TC-535-housegains-v1.md)
