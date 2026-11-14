# Product Requirements Document (PRD)

## HouseGains v1

**Status:** Local mobile screen/domain implementation delivered. Release acceptance remains in progress: native visual checks are blocked and production mobile service wiring is pending. See the implementation evidence receipt.

**Source of truth:** [Active implementation contract](implementation/housegains-contract.md). Its latest screenshot requirements supersede conflicting text in this PRD. The mobile screen and traceability documents are under [apps/mobile/docs](../apps/mobile/docs/README.md).

## 1. Product vision

HouseGains helps people who share a home coordinate recurring chores, see who contributed, and earn transparent XP for completed work. A household owns its members, chore definitions, scheduled instances, and completion ledger. Members can share a chore across subtasks, including when a helper was not assigned.

The product supports roommates, couples, and families. It should make responsibility and credit easy to understand without requiring a member to claim ownership of every task.

## 2. Product principles

- Show who belongs to a household, who is assigned, and who completed each subtask.
- Allow one chore to have several assignees or no assignee. Any household member may help.
- Award XP from recorded subtask completions; never infer score from presentation or sample content.
- Preserve earned history when a chore definition changes or an instance closes partially.
- Make demo/local data and unavailable cross-device operations explicit.
- Offer three distinct visual compositions. Appearance selection does not change household data or XP rules.
- Localize all user-facing copy for en-US, pt-BR, es-ES, fr-FR, de-DE, and it-IT; support accessible controls and reduced motion.

## 3. Household and chore journeys

1. A creator creates a household, selects chores from the catalog or builds custom chores, sets assignments, and invites housemates.
2. A member joins with a valid invite code or its QR/deep link.
3. Household members see Today, open a chore, complete subtasks, and see the XP ledger attribution.
4. Members can review ranks and the completion feed; the creator can manage chore definitions in Settings.
5. Any member can change their appearance among Arcade, Sticker Pop, and Soft Home in Settings.

The screen reference IDs are: G1 Create household, G2 Pick chores, G3 Invite housemates, G4 Assign chores, G5 Join; T1 Settings > Chores, T2 Custom chore builder, T3 Catalog chore detail; S1 Today with subtasks, S2 Chore detail, S3 100% bonus; plus the appearance picker, Ranks, Feed, and Settings. Their detailed behavior and traceability live in [the mobile screen spec](../apps/mobile/docs/screens/housegains-v1.md).

## 4. Functional requirements

### 4.1 Household membership and invitations

- A household has one creator and zero or more members.
- A creator can issue a six-character invite from A–Z excluding I/O and digits 2–9 (alphabet: ABCDEFGHJKLMNPQRSTUVWXYZ23456789).
- An invite is valid for seven days and up to eight uses. Regeneration revokes the prior invite.
- The invite is shareable as a code, QR code, and deep link.
- Joining adds the person to the household membership used by assignment and completion records.

### 4.2 Chore catalog and builder

- Selecting a catalog chore creates a household-owned copy. Later changes to the catalog source do not mutate that copy.
- A custom chore has a name, icon, category, 1–10 ordered subtasks, 5–100 XP per subtask, a 0–50 XP completion bonus, recurrence, and due time.
- Recurrence supports daily, weekly on selected days, and every N days.
- A chore can be assigned to several household members or left unassigned.
- Only its creator may edit, pause, or delete a chore definition and its future instances.
- Definition changes apply to future instances. Existing instances retain snapshots of the chore, subtasks, bonus, assignments, and due time.

### 4.3 Completion and XP ledger

- Each scheduled chore instance has its own completion ledger.
- A subtask can be credited once per instance. The ledger records the completing member and completion time; any member may help, including a member outside the assignee list.
- Subtask XP is credited to its completing member. A completion is not credited again on duplicate submission.
- When every subtask is completed before the instance due time, the instance becomes done and its completion bonus is split evenly among unique contributing members. Integer remainder points go to the member who completes the final subtask.
- If an instance closes partially, it retains already earned subtask XP and does not award the completion bonus.
- A member may undo only their own completion within five minutes. Undo reverses that completion's ledger effect, reverses any bonus award for the instance, and reopens the instance as appropriate.

### 4.4 Appearance, Today, ranks, and feed

- Mandatory localization covers English, Portuguese (Brazil), Spanish, French, German and Italian. Device-language detection, onboarding selection and Settings selection share a persisted preference independent of visual style. All active app copy and catalog defaults are translated; user-authored names remain literal.
- The appearance picker presents Arcade, Sticker Pop, and Soft Home. A member previews and intentionally selects one; settings can change it later.
- Today and Chore detail show instance progress, assignment state, subtask completion, contributor attribution, due time, and eligible bonus state from the shared model.
- Ranks presents household standing from recorded XP. The rank period and tie policy must be explicit in implementation; this PRD does not invent either.
- Feed presents completion activity with member, chore instance, and time. Reactions, comments, photo proof, and bonus-multiplier cards are not part of this contract.

## 5. Visual direction

The three references are separate compositions, not palette substitutions:

- **Arcade:** near-black canvas and charcoal surfaces, electric-lime emphasis, compact bold sans with mono labels, avatar/level/streak header, numeric XP score and segmented progress, quest rows, and a dark dock with a lime create action.
- **Sticker Pop:** warm butter canvas, black 2.5px outlines and hard offset shadows, bold greeting and yellow streak sticker, blue score panel, mint rank state, yellow progress, expressive XP pills, and a white dock with a raised yellow create action.
- **Soft Home:** pale lavender/slate canvas, dark plum text, serif section headings with sans body, white score card and purple progress ring, soft streak chip, pastel member chips, airy task rows, and a plum dock with a purple create action.

The picker must expose all three previews on narrow screens and indicate selection by more than color alone. Soft Home's serif is part of the reference and must not be replaced by the app's sans family. Full visual and component guidance is in [apps/mobile/DESIGN.md](../apps/mobile/DESIGN.md).

## 6. Implementation and data boundary

The active contract specifies a local/demo adapter while a production HouseGains service is unavailable. The UI must label demo data, and must not imply that a local join, invite, completion, feed, or score is synchronized across devices. Production collaborative XP depends on server-side membership authorization, immutable instance snapshots, unique completion writes, atomic bonus distribution, and undo transactions. Those integrations remain separately tracked as pending wiring.

## 7. Scope and sequencing

**Current v1 scope:** onboarding and appearance selection; household create/join/invites; catalog copies; chore assignment and builder; recurring instances; Today and detail; XP ledger, bonus, undo and partial closure; ranks; feed; settings.

**Deferred:** bounty multipliers and claiming, spot requests, photo proof, reactions/comments, streak freezes, push notifications, smart-home integrations, automatic workload rotation, database migration, deployment, and production service rollout.

Implementation order: appearance and onboarding; household and chore setup; instance/ledger behavior; Today/detail/ranks/feed/settings; localization, accessibility, and visual acceptance. Feature status remains **In progress** until implementation and evidence are recorded.

## 8. Success measures

Track household creation and invite joins, chore setup completion, scheduled-instance completion, multi-member contribution rate, partial closure rate, earned XP by ledger entry, and returning household activity. These are measurement definitions only; no baseline or target has been verified.
