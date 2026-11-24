# BR-413 HouseGains Domain Rules

**Status:** In progress. These are the active product rules for HouseGains v1; production enforcement is not verified.

1. **Household identity and profile:** Each household has one creator and members. Chore assignees and completion contributors must be members of that household. The creator may update household name, icon, color, and photo in Settings; a profile edit preserves household identity, captured timezone, membership, and invite state.
2. **Catalog copy:** Adding a catalog chore creates an independent household-owned copy. Catalog source changes never mutate the copy.
3. **Assignments:** A chore may have zero, one, or several assignees. Empty assignment means Unassigned, not invalid. Assignment does not restrict who may help.
4. **Builder limits:** Each chore contains 1–10 ordered subtasks. Each subtask awards 5–100 XP. Completion bonus is 0–50 XP.
5. **Recurrence:** Supported forms are daily, weekly on selected days, and every N days (N=1–365), with a due time. Household creation captures the device's IANA timezone; recurrence calendar days and due times use that stored zone. Spring-forward gaps shift by the gap duration; repeated fall-back wall times use the earlier matching instant.
6. **Definition ownership:** Only the chore creator may edit, pause, or delete its definition and future instances.
7. **Snapshot immutability:** Existing instances retain the definition, subtask, bonus, assignment, and due-time values captured for that occurrence. Later definition edits affect future instances only.
8. **Invite validity:** A code has exactly six characters from ABCDEFGHJKLMNPQRSTUVWXYZ23456789, is valid for seven days, and allows at most eight successful joins. Regeneration revokes the prior code. Code, QR, and deep link resolve to the same invite.
9. **Unique completion:** One subtask has at most one credited completion per instance. A successful completion stores the instance, subtask, member, XP, completion instant, and assist attribution.
10. **Subtask XP:** XP is credited to the member recorded as completing the subtask. The same completion cannot be awarded twice.
11. **Member help:** Any household member may complete a subtask even if the chore is assigned to somebody else or is unassigned. Assignment is display/responsibility metadata, not an authorization gate for helping.
12. **Completion bonus:** Award the bonus only if every subtask is complete before the instance due time. Split integer XP evenly among distinct contributing members; give indivisible remainder points to the member completing the final subtask.
13. **Partial closure:** A partially closed instance keeps its earned subtask ledger entries and receives no completion bonus.
14. **Undo window:** A member may undo only their own completion, within five minutes of its completion instant. Undo removes that subtask's XP effect and, if the instance had paid a bonus, reverses the instance bonus awards and reopens the instance as appropriate.
15. **Local/demo boundary:** Local fixture behavior must be labeled as local/demo. It is not evidence of a remote invite, cross-device membership, synchronized feed, or production ledger.
16. **Local XP scorecard:** Weekly totals sum signed ledger events from Monday 00:00 in the household timezone. This slice's streak is consecutive household-timezone dates with net-positive XP for the current member; if today has no positive total yet, calculation may continue from yesterday. All-time net XP determines level as `floor(totalXP / 100) + 1`; title is Rookie below level 5 and Tidy Titan at level 5 or above.
17. **Admin rights:** Admin rights mean role `creator` or `admin`. The creator grants and removes the admin role (creator-only, confirmed, never on themselves). Existing creator-only operations stay creator-only; admin rights add only the moderation powers.
18. **Dispute window:** A completion can be disputed or moderated within 72 hours of its completion time. A resolved or expired dispute can no longer be reported; the same member cannot report the same instance twice.
19. **Verdicts:** `done` keeps every disputed completion; `not_done` revokes all of them; `partial` revokes a non-empty strict subset chosen by the reviewer and is unavailable when fewer than two steps are disputed. Revocation reverses the step XP (and the instance bonus when the instance was done) through `revoke-*` ledger rows, records who acted and the verdict on the instance, and reopens the instance per the undo status rule.
20. **Conflict of interest:** An admin who completed one of the disputed or moderated steps cannot pass the verdict unless they are the only member with admin rights; the backend rejects the attempt and the client shows the reason.
21. **Weekly standings snapshot:** Ranks shows only the latest closed week written by the scheduled job (top member and wall of shame, both possibly null). Moderation after a close never rewrites the snapshot; the client renders it read-only.

## Open rule details

- Define how production handles later household timezone changes. The local adapter captures the creation zone and shifts nonexistent daylight-saving wall times forward by the gap duration; repeated times use the earlier matching instant.
- Define the rank period and tie policy.
- Define the exact predicate that sets assist attribution; the active contract requires that it be stored but does not specify its derivation.
- Define server transaction and idempotency boundaries before claiming collaborative production XP.


Implementation review clarifications: recurrence equivalence compares parsed rules without changing the stored anchor; editable future deadlines are recalculated when due time changes. Earned instance metadata (name, icon, recurrence and due time) remains snapshotted and displayable after a definition is renamed or deleted. Catalog copies use source IDs rather than matching user-visible names. Mutation failures retain assignment drafts and expose retry; theme persistence failures also expose an explicit retry.

New households start with a recorded 400 XP weekly goal. The scorecard bars and Soft Home ring use weekly earned XP divided by that goal, clamped visually to 100%; daily set progress is reported separately. A missing or non-positive target renders an explicit goal-not-set state without a fabricated percentage. Goal editing is not part of this slice.
