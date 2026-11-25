# HouseGains contract: moderation, weekly standings and gamification (v1)

This document extends [firebase-contract.md](firebase-contract.md). It is the source of truth
for the household moderation rules, the weekly top member / wall of shame, and the Ganhos /
Zelo gamification program. Where this file and the older plan artifact differ, this file wins.

Everything here is written by Cloud Functions only. Clients never write these paths
(`allow write: if false`, same as the rest of the contract).

---

## Part A — Roles and moderation

### A1. Roles

`households/{hid}/members/{uid}.role` is `'creator' | 'admin' | 'member'`.

- Exactly one `creator` (unchanged). The creator is always an admin.
- "Admin rights" means `role in ['creator', 'admin']`.
- Existing creator-only callables stay creator-only (`updateHousehold`, `rotateInvite`,
  `saveChore`, `setAssignments`, `setChoreActive`, `deleteChore`, `finishSetup`, `removeMember`).
  Admin rights add only the moderation powers below.
- Creator succession (leave / remove / delete account): the successor is the
  longest-standing remaining `admin`; if there is none, the longest-standing member (as today).

Callable `setMemberRole({ householdId, memberId, role: 'admin' | 'member' })`
- Creator only (`permission-denied`). `invalid-argument` if `memberId` is the caller.
- `not-found` if `memberId` is not in `memberUids`.
- Idempotent. Returns `{ memberId, role }`.

### A2. Disputes ("this wasn't done")

A completion is a subtask completion (`Instance.completions[]`). A dispute is per instance.

`households/{hid}/disputes/{instanceId}` — readable by members.
```
instanceId: string
choreName: string                 // snapshot for lists
status: 'open' | 'resolved' | 'expired'
subtaskIds: string[]              // union of every report's subtasks
completerIds: string[]            // members whose completions are disputed
completionIds?: string[]          // Completion.id of every reported completion (union); absent on older disputes
reports: { uid, subtaskIds: string[], reason: string (0..280), createdAt }[]
verdict?: 'done' | 'partial' | 'not_done'
revokedSubtaskIds?: string[]
resolverUid?: string
createdAt, resolvedAt?, expiresAt  // expiresAt = earliest disputed completedAt + 72 h
```
One dispute document per instance for its whole life (doc id = instanceId).
`instances/{instanceId}.disputeStatus` mirrors `'open' | 'resolved' | 'expired'` (absent = never disputed).
An instance with a `disputeStatus` or a non-empty `revocations[]` is a review record: chore edits never rewrite or
delete it (`isEditableFuture`), even when undo left it `open` with no completions.
A review record that sits `open` in the future with no completions (an undo or a `not_done` verdict reopened it) must
not keep working once its chore is gone: `deleteChore` and `setChoreActive(false)` (or a `saveChore` that pauses) set
`instances/{id}.retiredAt` on it instead of deleting it. A retired instance keeps its record, but is out of play: no
reminders, `completeSubtask` refuses it (`failed-precondition`), and it is neither assigned nor missed work in the week
stats and the on-time counts. The overdue pass still closes it (`partial`) so it leaves the open query; reactivating the
chore clears `retiredAt` on the ones still in the future. Any chore edit (`saveChore`, `setAssignments`) applies the new
`assigneeIds` to a review record; its subtasks, bonus and due time stay as recorded (structural edits do not rewrite them).
A verdict covers the *completions a report named*, not the subtask ids alone: the disputed subtasks whose standing
completion id is in `completionIds`. If the reported completer undoes and someone else completes the subtask, that
completion is not covered and stands. A dispute without `completionIds` (written before the field) covers every
disputed subtask, as before; a later report on such a dispute records the current completion ids of what it already
disputed.

Constants: `DISPUTE_WINDOW_MS = 72 h` (in `functions/src/domain/moderation.ts`).

Callable `reportCompletion({ householdId, instanceId, subtaskIds?: string[], reason?: string })`
- Any member **without** admin rights. Admins get `permission-denied`
  ("Admins mark completions directly instead of reporting.").
- `not-found`: instance missing. `failed-precondition`: instance has no completions.
- `subtaskIds` default: every completed subtask whose completer is not the caller.
  Each id must be completed (`failed-precondition`) and not completed by the caller
  (`invalid-argument`). The resulting list must be non-empty (`failed-precondition`).
- Every reported completion must be younger than `DISPUTE_WINDOW_MS` (`failed-precondition`).
- No dispute doc: create it (`status: 'open'`). Open dispute: append the report and union
  `subtaskIds` / `completerIds`; `already-exists` if the caller already reported it.
  Resolved or expired dispute: `failed-precondition` ("An admin already reviewed this chore.").
- Sets `instances/{id}.disputeStatus = 'open'`. Sends FCM to every admin-rights member with
  `remindersEnabled !== false` (localized, 6 languages: "{name} says {chore} wasn't done. Review it.").
- Returns `{ disputeId }`.

Callable `resolveDispute({ householdId, disputeId, verdict, subtaskIds? })`
- Admin rights required (`permission-denied`).
- `not-found` / `failed-precondition` when the dispute is missing / not open.
- Conflict of interest: if any covered completion (see above) was made by the caller, `permission-denied`
  unless the caller is the only member with admin rights.
- If the dispute's instance no longer exists the call resolves the dispute without revocations
  (`revokedSubtaskIds: []`): there is nothing left to revoke, and failing would leave it open until it expires.
- `verdict: 'done'` — completions stand; nothing is reversed.
- `verdict: 'not_done'` — revoke every disputed subtask.
- `verdict: 'partial'` — `subtaskIds` is required: a non-empty, strict subset of the disputed
  subtasks, the ones that were NOT done. They are revoked; the rest stand. If only one subtask
  is disputed, `partial` is `invalid-argument` (the UI hides it).
- Revokes only covered completions (`not_done` / `partial` targets that are not covered are skipped).
- Sets `status: 'resolved'`, `verdict`, `revokedSubtaskIds`, `resolverUid`, `resolvedAt`, and
  `instances/{id}.disputeStatus = 'resolved'`. Notifies the covered completers and the reporters by FCM only (no inbox
  row), and only those who are still members of the household.
- Returns `{ disputeId, verdict, revokedSubtaskIds }`.

Callable `moderateInstance({ householdId, instanceId, verdict: 'partial' | 'not_done', subtaskIds? })`
- Admins mark a logged completion directly, without a report. Admin rights required.
- Targets: `not_done` = every completed subtask (or `subtaskIds` if given);
  `partial` = `subtaskIds` required, non-empty, strict subset of the completed subtasks.
- Same 72 h window and the same conflict-of-interest rule as `resolveDispute`.
- If an open dispute exists for the instance, it is resolved with this verdict, so the conflict-of-interest rule covers
  the targets *and* the completions the dispute covers (an admin cannot close a dispute about their own completion by
  revoking someone else's subtask). The revoke ledger rows' `moderation.disputeId` (and the revoke events' `disputeId`)
  carry that dispute's id; they are `null` when there was no open dispute.
- Returns `{ instanceId, verdict, revokedSubtaskIds }`.

Expiry: the hourly `closeWeeks` job (Part B) marks open disputes past `expiresAt` as
`expired` (completions stand) and sets `disputeStatus: 'expired'`. Each dispute expires in its own transaction that
re-checks `status === 'open'` (a dispute an admin resolved meanwhile is left alone) and tolerates a missing instance
(only the dispute doc is updated). A failing expiry is logged and never blocks the week close.

### A3. Revocation (shared by resolveDispute and moderateInstance)

In one transaction, for each revoked subtask:
- Ledger row `source: 'revoke-subtask'`, `amount = -subtaskRow.amount`,
  `reversesEntryId` = the active `subtask` row, `moderation: { actorUid, disputeId | null, verdict }`.
- If the instance was `done`, every active `bonus` row is reversed with `source: 'revoke-bonus'`
  (same shape) and `bonusAwards = {}`.
- The completion is removed from `completions[]` and appended to
  `instances/{id}.revocations[]`: `{ subtaskId, memberId, xp, actorUid, verdict, at }`.
- Status: remaining completions = 0 and before due → `open`; otherwise `partial`
  (the existing `undoInstanceStatus` rule).
- `members/{uid}.xp` is updated with `nextMemberXp`. A revoked subtask can be completed again
  through the normal flow while the instance is not past due.

`XpLedgerEntry.source` becomes `'subtask' | 'bonus' | 'undo-subtask' | 'undo-bonus' | 'revoke-subtask' | 'revoke-bonus'`.
All consumers that treat `undo-*` as reversals must treat `revoke-*` the same way.

---

## Part B — Weekly standings: top member and wall of shame

Week = Monday 00:00 to Sunday 24:00 in the household `timeZone` (same as `deriveWeeklyTotals`).
A week is closed by the scheduled function `closeWeeks` (every 60 minutes) once the local
time is past Monday 03:00 of the following week. Closing is idempotent: the week doc is
written with `create()`, a second run is a no-op.

`households/{hid}/weeks/{weekStart}` (weekStart = `YYYY-MM-DD` of the Monday) — readable by members.
```
weekStart, weekEnd (YYYY-MM-DD, Sunday), timeZone, closedAt
members: { [uid]: { xp, subtasks, assignedDue, missed } }
topMember:   { memberId, xp, subtasks } | null
wallOfShame: { memberId, missed, assignedDue } | null
gamification?: { ... }   // Part C aggregates, written by the same job
```
Per active member (in `memberUids` at close time):
- `xp` = net sum of their ledger rows with `createdAt` in the week (all sources, signed).
- `subtasks` = their `subtask` rows minus their `undo-subtask` and `revoke-subtask` rows in the week.
- `assignedDue` = instances with `dueAt` in the week where they are in `assigneeIds`.
- `missed` = those instances whose `status !== 'done'` at close time.

Top member: highest `xp`, must be > 0. Ties: more `subtasks`, then the earlier time of their
last positive ledger row in the week, then `memberId` ascending (code-unit order, not locale order).

Wall of shame: highest `missed`, must be ≥ 1. It is NOT the lowest-XP member. Ties: higher
`missed / assignedDue`, then lower `xp`, then `memberId` ascending. The same person can hold
both titles in the same week.

Both are `null` when the household has fewer than 2 active members.
Later moderation does not rewrite a closed week (the doc is a snapshot).

The close is a sequence of isolated steps (week doc, push, Part C hooks, dispute expiry): a failure in one is logged and
never skips the others. A pass that finds a closed week doc of the last 8 weeks without `gamification.processedAt`
(written once its engine run committed, or as a terminal skip marker) replays the Part C hook from the stored week doc,
oldest first, so a failed run is not lost; see C8.

After closing, FCM to members with `remindersEnabled !== false` (localized, 6 languages).
Copy names: en "Top member of the week" / "Wall of shame"; pt-BR "Destaque da semana" /
"Mural da vergonha". The Ranks screen shows the last closed week.

Pure functions live in `functions/src/domain/standings.ts` (unit tested).

---

## Part C — Gamification (Ganhos and Zelo)

Product decisions (taken from the plan's recommendations):
- Two tracks. **Ganhos** (en "Gains"): spendable member wallet, private to the owner.
  **Zelo** (en "Care", es "Esmero", fr "Soin", de "Fürsorge", it "Cura"): non-spendable
  organizer reputation for the creator, visible to the household. Balances never convert.
- Never call Ganhos "XP" or "points/pontos". Code name for badges: `Achievement*`; UI copy "Conquista".
- Streaks are weekly. Levels use `XP(L) = 50·L·(L−1)` on `xpPeak`, with `levelFloor` migration.
- Redemption is **out of scope** (design only; legal review pending). No spend paths are built.
- Haptics are **out of scope** (needs a native dependency and store build).
- Client analytics are **out of scope**; metrics are server-side events only.

### C1. Configuration and rollout

`gamification/config` (no client access; all of `gamification/**` is Cloud Functions / admin callables only):
```
mode: 'off' | 'shadow' | 'live'
activeVersion: number | null      // published rule set; null → built-in DEFAULT_RULE_SET
previousVersion: number | null
cohortSalt: string
livePercent: number (0..100)      // households shown the program
controlPercent: number (0..100)   // explicit control group, sees nothing
```
Missing doc ⇒ `mode: 'off'`. A `mode` that is not `shadow` or `live` reads as `off`; percentages are
clamped to 0..100. The runner reads the config and the published rule set per call with a cache of at most
60 s (no cache under the emulator, so tests can flip it between calls).

**Firestore paths.** `gamification/ruleSets/{version}` and the other `gamification/{name}/{id}` locations written
below are not valid *document* paths (a document path has an even number of segments). The real locations, used
by the wiring and by the admin callables, are `gamification/{ruleSets|alerts|audit|adjustments}/items/{id}`
(constants in `functions/src/gamification/paths.ts`): `gamification/ruleSets/items/{version}`,
`gamification/alerts/items/{id}`, `gamification/audit/items/{id}`, `gamification/adjustments/items/{id}`.
`gamification/config` is a plain document and is unchanged. Everywhere below, "`gamification/alerts`" means
`gamification/alerts/items`.

Cohort of a household: `h = fnv1a32(householdId + cohortSalt) % 100`;
`h < livePercent` → `'live'`; `h < livePercent + controlPercent` → `'control'`; else `'shadow'`.
Written to `households/{hid}.gamificationCohort` on `createHousehold` (whatever the mode: under `off` it is
computed from the config's percentages, so a missing config yields `'shadow'`) and whenever an engine run finds
that it changed. It is always recomputed from the current config, so ops can move a household by editing the
config; a hand-written value is treated as a stale projection. Under `off` the engine does not run and the field
is left as it is.

- `off`: the engine does nothing.
- `shadow` (or a `shadow`/`control` household under `live`): ledgers and projections are written;
  no `celebrations` returned; no inbox rows; no FCM.
- `live` + household cohort `'live'`: everything, including celebrations, inbox and FCM.

Client kill switch: Remote Config boolean `gamification_enabled` (default `false` in the bundled
defaults). The app shows gamification UI only when `gamification_enabled === true` AND
`households/{hid}.gamificationCohort === 'live'`.

### C2. Rule sets

`gamification/ruleSets/items/{version}` (version = positive integer as string):
```
status: 'draft' | 'published' | 'archived'
notes: string   createdBy: uid   createdAt   publishedAt?
rules: RuleSet  // one JSON object, validated by validateRuleSet()
```
`activeVersion` points at the published set. When the document is missing, or `rules` fails `validateRuleSet`,
the runner logs a warning (`gamification rule set invalid; falling back to DEFAULT_RULE_SET`, with the version
and the first errors) and uses `DEFAULT_RULE_SET` with `ruleSetVersion: null`.

`RuleSet` (the real TypeScript types live in `functions/src/domain/gamification/types.ts`):
```
schemaVersion: 1
earnRules: EarnRule[]
achievements: AchievementDef[]
streak: { member: MemberStreakRule, organizer: OrganizerStreakRule }
levels: { member: { base: 50, titles: {fromLevel, key}[] }, organizer: { thresholds: {zelo, key}[] } }
caps: { dailyGanhos: 400, perInstanceGanhos: 150, weeklyZelo: 200, newChoreCooldownHours: 24 }
quests: QuestDef[]
campaigns: CampaignDef[]   // Turbo multipliers: { id, multiplier: 1.5|2, ruleIds, activeFrom, activeTo, audience? }
```
`EarnRule` (as implemented; this replaces the earlier sketch):
```
{ id, track: 'ganhos'|'zelo', status: 'active'|'paused',
  on: { kind: EventKind, where?: Record<string, unknown> },
  award: { amount, perXp?: boolean, overrides?: { where, amount }[],
           milestones?: { [milestone]: amount }, tiers?: { bronze?, silver?, gold? } },
  caps: CapRule[],                       // { scope: 'member'|'member+target'|'household'|'lifetime',
                                         //   window: 'day'|'week'|'life', max, pool?: 'dailyGanhos'|'perInstanceGanhos'|'weeklyZelo',
                                         //   target?: 'instance'|'assignee'|'chore' }
  clawback?: { on: EventKind, match: 'sourceRef' }[],   // an ARRAY: one entry per reversing event kind
  spendableAfterHours: number,
  celebrate?: { moment: 'toast'|'badge'|'streak'|'level', copyKey: string },
  audience?: { minHouseholdMembers?: number }, activeFrom?: string, activeTo?: string | null,
  ref?: 'action' | 'chore' | 'member' | 'instance' }   // what the ledger sourceRef is taken from; default 'action'
```
- `award.amount` is flat, or 1-per-XP when `perXp` is set. `overrides`: the first matching override replaces the
  amount (`zelo.on_time`: ≥90% on time ⇒ 60). `milestones` is the streak ladder; `tiers` the per-tier achievement payout.
- A cap with a `pool` shares one counter across rules and *trims* the award (`dailyGanhos`, `perInstanceGanhos`,
  `weeklyZelo`); a cap without a pool is an occurrence count that blocks the award once `max` is reached.
- `ref` decides the row's `sourceRef`: `'chore'` (`zelo.chore_done`: once per chore), `'member'`
  (`zelo.member_activated`: once per member), `'instance'`, or the default action id (the XP ledger row id).
- `AchievementDef`: `{ id, track: 'member'|'organizer', metric, active?, seasonal?, tiers: { bronze, silver?, gold? } }`.
  Achievements with a single condition (`fit`, `pillar`, `spring`, `yearend`, `order`) are **bronze-only**.

`EventKind`: `ledger.subtask`, `ledger.bonus`, `ledger.undo-subtask`, `ledger.undo-bonus`,
`ledger.revoke-subtask`, `ledger.revoke-bonus`, `feed.post`, `instance.completed_on_time`,
`member.joined`, `member.activated`, `household.setup_finished`, `chore.created`, `chore.deleted`,
`member.removed`, `household.week_closed`.

`DEFAULT_RULE_SET` in code encodes every value in C4–C7 and is used when `activeVersion` is null.

### C3. Ledgers, projections, inbox

- `wallets/{uid}` — owner reads (clients never write). Projection, as written by the runner:
  ```
  householdId, memberId                // the household of the last engine run
  balance, lifetimeEarned, pendingBalance, nextSpendableAt: Timestamp | null
  level, xpPeak
  streak: { current, record, lastCountedWeek: 'YYYY-MM-DD' | null, lastActionWeek: 'YYYY-MM-DD' | null,
            folgas, folgaProgress, awayWeeks: string[] }
  achievements: { [achievementId]: { tier: 'bronze'|'silver'|'gold', unlockedAt: Timestamp, active?: boolean } }
  stats: { assists, finals, onTime, credits, categories: { [category]: number }, weeksCounted, welcomePaid?: boolean,
           recentWeeks: { weekStart, counted, xp }[], householdXpByWeek: { [weekStart]: number },
           springSubtasks, springSeasonKey: string | null, decemberGoalWeeks, streakMilestonesPaid: number[] }
  caps: { [capKey]: number }   // e.g. "day:2026-11-24:ganhos", "day:2026-11-24:earn.assist:target:uidB"
  projectionVersion, updatedAt
  ```
  `level` is the level from `xpPeak` on the `levelForXp` curve (the mobile app shows `max(levelFloor, level)`).
  `streak.lastActionWeek` is the last week the close already processed (idempotency); `active: false` marks an
  active badge (`fit`, `pillar`, `order`) that lapsed.
- `wallets/{uid}/ledger/{key}` — owner reads. Append-only rows:
  `{ key, ruleId, ruleSetVersion: number | null, track: 'ganhos', amount (signed), sourceRef, householdId, memberId,
  reversesEntryId?, reason?, createdAt, spendableAt }`.
  Key = `{ruleId}:{sourceRef}:{memberId}` (sourceRef has `/` replaced by `|`) and is the document id. Writes use
  `create()` inside the runner's transaction; an existing key is never overwritten. Reversal key = `rev:{originalKey}`
  with the negated amount; its `sourceRef` is the original's.
- `households/{hid}/organizerLedger/{key}` — members read. Same row shape, `track: 'zelo'`, `memberId` = creator.
- `households/{hid}/organizer/{uid}` (uid = the creator) — members read. `{ householdId, memberId, zelo, lifetimeZelo, level,
  streak: { current, record, lastCountedWeek, lastActionWeek, folgas, folgaProgress },
  achievements, stats: { membersActivated, maestroWeeks, evenSplitWeeks, customChoreCompletions: { [choreId]: number },
  weeksCounted, orderWeeks: { weekStart, due, onTime }[], streakMilestonesPaid }, caps, updatedAt }`.
- `households/{hid}/members/{uid}` gains `xpPeak` (max of xp ever) and `levelFloor` (old-curve level, set once).
  New members (`createHousehold`, `joinHousehold`) get `xpPeak: 0, levelFloor: 1`. **`xpPeak` is written in the same
  transaction as `xp`**: `xpPeak = max(previous xpPeak ?? previous xp, new xp)`, so it never decreases on an undo or a
  revoke. Admin callable `adminBackfillLevelFloors` sets `levelFloor = floor(xp/100)+1` and `xpPeak = max(xp, 0)` for
  members missing them. Displayed level = `max(levelFloor, levelForXp(xpPeak))`.
- `households/{hid}/events/{id}` — members read. Server events
  `{ name: 'gami_earned'|'gami_clawback'|'gami_streak_week_counted'|'gami_streak_broken'|'gami_folga_used'|'gami_milestone'|'gami_achievement_unlocked'|'gami_achievement_lost'|'gami_level_up'|'gami_week_closed'|'gami_reminder_sent', householdId, memberId?, data, createdAt }`.
  Ids are deterministic, `evt:{name}:{memberId|household}:{sourceKey}` (`/` in the source key replaced by `|`, a `#n`
  suffix for repeats inside one run), and written with `set()`; `gami_reminder_sent` ids are
  `gami_reminder_sent:{member|creator}:{weekStart}` with `data: { kind, weekStart, recipients }`.
- `users/{uid}/inbox/{id}` — owner reads (clients never write; `ackCelebrations` marks rows seen). Doc id = the
  celebration id. `Celebration & { seen: boolean, createdAt }`.
- `households/{hid}/gamiProcessed/{ledgerRowId}` — members read, server only. `{ at }`: the XP ledger rows an engine run
  covered, written in the runner's transaction. The safety-net trigger skips marked rows.
- `households/{hid}/gamiReminders/{weekStart}:{member|creator}` — members read, server only: the claim of a
  reminder (C7). `{ sentAt }`.
- `gamification/alerts/items/{id}`, `gamification/audit/items/{id}`, `gamification/adjustments/items/{id}` — admin
  app only. Alert docs: `{ kind: 'velocity'|'chore-xp-raise'|'undo-rate', householdId, memberId?, data, createdAt }`,
  ids `alert:{kind}:{memberId|householdId}:{sourceKey}`.

`Celebration`:
```
{ id, moment: 'toast'|'badge'|'streak'|'level'|'standings', track: 'ganhos'|'zelo',
  amount?: number, parts?: { ruleId, amount }[], copyKey: string,
  achievementId?: string, tier?: 'bronze'|'silver'|'gold', level?: number, fullScreen?: boolean,
  data?: Record<string, string | number> }
```
Celebration ids (deterministic; the inbox is keyed by them): `cel:toast:{ledgerRowId}:{memberId}`,
`cel:toast:zelo:{ledgerRowId}:{creatorUid}`, `cel:toast:{instanceId}|{finalRowId}:{memberId}` (on time),
`cel:toast:{postId}:{memberId}` (share), `cel:level:member:{level}:{memberId}`, `cel:level:organizer:{level}:{creatorUid}`,
`cel:badge:{achievementId}:{tier}:{memberId}`, `cel:streak:{weekStart}:{milestone}:{memberId}`,
`cel:toast:{weekStart}:{memberId}`, `cel:toast:zelo:{weekStart}:{creatorUid}`, `cel:toast:setup:{creatorUid}`.
Copy keys in use: `gami.earn.{chore|bonus|assist|on_time|share|week_goal|welcome}`, `gami.zelo.earned`,
`gami.streak.milestone`, `gami.achievement.unlocked`, `gami.level.up`.

### C4. Ganhos earn rules (DEFAULT_RULE_SET)

| ruleId | on | amount | caps | clawback |
| --- | --- | --- | --- | --- |
| `earn.subtask` | `ledger.subtask` | 1 per XP | 400/day total chore Ganhos (`dailyGanhos`), 150 per instance | `ledger.undo-subtask` / `ledger.revoke-subtask` on the same sourceRef |
| `earn.bonus` | `ledger.bonus` | 1 per XP | counts toward `dailyGanhos` | `undo-bonus` / `revoke-bonus` |
| `earn.assist` | `ledger.subtask` where `isAssist` | 5 | 3/day; 2/day per assignee target | with the subtask reversal |
| `earn.on_time` | `instance.completed_on_time` (member in assigneeIds, contributed, done before dueAt) | 10 | 3/day | reversed if a reversal reopens the instance |
| `earn.share` | `feed.post` | 2 | 1/day | none |
| `earn.week_goal` | `household.week_closed` with weeklyGoalXp reached; member brought ≥10% of the goal | 30 | 1/week | none |
| `earn.streak_milestone` | streak milestone | 2→25, 4→50, 8→100, 12→150, 26→250 | once per milestone per run | none |
| `earn.achievement` | achievement tier unlocked | bronze 20, silver 50, gold 120 | once per tier for life | none |
| `earn.welcome` | `member.joined`, paid at the member's first subtask credit | 50 | once per user for life (`wallets/{uid}.stats.welcomePaid`) | none |

Chores created or edited less than 24 h before the completion (`chores/{id}.updatedAt`) mint
no Ganhos (XP is unchanged); the welcome bonus is not gated by it. `spendableAfterHours = 24` for every Ganhos rule.
`saveChore` writes `createdAt`, `updatedAt` and `createdBy` on every chore (a chore without `createdBy`, saved before
Part C, earns no Zelo) and `xpRaisedAt` when the save raised any subtask XP or the bonus (cleared by the next save that
does not): the C9 chore-xp-raise alert input.

Reversals (the `clawback` arrays): every reversal event carries `reversedAward: { subtask, assist }` (or `{ bonus }`) =
`{ amount, awardedAt } | null`, read by the runner from the original wallet rows, so a clawback returns exactly what a
row paid after cap trimming (or a campaign) and never more. `earn.on_time` is reversed when a reversal reopens the
instance (`instanceStatusAfter !== 'done'`), for every assignee whose on-time row stands, with the amount *that row
paid*. The Zelo reversals (`chore.deleted`, `member.removed`) likewise reverse exactly what the original organizer row
paid; the runner loads the rows (amount and `createdAt`) it reverses and passes them to the engine as `existingRows`.
A reversal refunds the cap counters of the day/week the original award was paid in (the award's local date or Monday),
never of the day the reversal happens, and the window of the on-time counter comes from the rule's own caps. A
reversal never takes the organizer's Zelo below 0. The per-assignee `earn.assist` counter refund uses the assignees
of the reversal event (the ledger row does not store its target): after a reassignment that can differ from the target
the award was capped against.

### C5. Zelo rules (creator only)

| ruleId | on | amount | caps / notes |
| --- | --- | --- | --- |
| `zelo.setup` | `household.setup_finished` | 50 | once per household |
| `zelo.chore_done` | first completion by a non-creator on a chore the creator created | 5 | 10/week; reversed if `deleteChore` within 7 days of creation |
| `zelo.member_activated` | a joined member credits 3 subtasks within 14 days of joining | 40 | max 11 per household; reversed if `removeMember` within 30 days of joining |
| `zelo.on_time` | `household.week_closed`, ≥5 instances due, ≥70% done on time / ≥90% | 30 / 60 | 1/week |
| `zelo.even_split` | `household.week_closed`, ≥2 active members with XP, nobody >60% of week XP | 20 | 1/week |
| `zelo.streak_milestone` | organizer streak 4 / 12 / 26 | 20 / 60 / 120 | once per milestone per run |
Weekly Zelo cap 200. Organizer levels: Organizador 0, Síndico 200, Síndico experiente 600,
Síndico-mor 1500, Síndico lendário 3000 (keys `organizer`, `sindico`, `sindicoExperiente`, `sindicoMor`, `sindicoLendario`).

### C6. Levels (member)

`xpForLevel(L) = 50 * L * (L - 1)`; `levelForXp(xp)` = largest L with `xpForLevel(L) <= xp` (min 1).
Titles: 1–2 `rookie`, 3–4 `helper`, 5–7 `tidyTitan`, 8–11 `cleanMaster`, 12–15 `homeLegend`, 16+ `houseGuardian`.
Level-up celebration fires when `xpPeak` crosses a threshold. Perk used now: level ≥ 8 holds 2 folgas.

### C7. Streaks and achievements (evaluated in closeWeeks)

Member weekly streak ("semanas seguidas"): a week counts with ≥3 net subtask credits
(subtask − undo-subtask − revoke-subtask). Missed week: an away week keeps the streak frozen;
else a folga is consumed if held (`gami_folga_used`); else the streak breaks (record kept). Weeks between the last
processed week (`streak.lastActionWeek`, else `lastCountedWeek`) and the week being closed never reached the engine
(the close did not run, or no week doc was ever written for them); each of them is replayed first as a missed week (oldest
first, at most the latest 52; a week that has a week doc is never one of them, it is processed from its doc, see C8), so they spend folgas, break the streak or are frozen by an away week exactly like a close that ran. The
organizer streak treats them the same way, without knowing whether every member was away (none is paused).
Folgas: +1 every 4 counted weeks, hold max 1 (2 from level 8). Away mode: callable
`setAwayWeeks({ householdId?, weekStarts: string[] })` → `{ weekStarts }` (the stored list). The household supplies the
time zone (default: the caller's current household; `failed-precondition` without one, `permission-denied` for a
non-member). Every entry must be a `YYYY-MM-DD` Monday (`invalid-argument`) strictly after today in that time zone
(`failed-precondition`). The request replaces the *future* away weeks; past ones stay on record and count toward the
limit of 3 per calendar year (`failed-precondition`). Stored on `wallets/{uid}.streak.awayWeeks`, creating the wallet
when needed. An away week keeps the streak frozen and the reminders quiet. Milestones per C4.

Organizer streak ("Casa em dia"): a week counts when on-time rate ≥60% with ≥5 instances due.
Folga +1 every 6 counted weeks, hold 1. A week where every member is away pauses it.

Reminders (`gamificationReminders`, every 60 minutes): Sunday 18:00 local, members with <3 net credits this week and a
current streak ≥1 and no away week ("Faltam 2 etapas para manter suas 8 semanas."); Saturday 10:00 local, the creator
if the on-time rate so far is <60% with ≥5 instances due ("A casa está em 52% esta semana."). Through the existing FCM
send path, respecting `remindersEnabled`, localized in the 6 locales. Only for `live` households (mode `live` and cohort
`live`). Idempotent per household per week and kind: the `households/{hid}/gamiReminders/{weekStart}:{kind}` marker is
claimed with `create()` **before** anything is sent, so a repeated or concurrent run does nothing; the
`gami_reminder_sent` event (with the recipient count) is written only when someone was reminded.

Achievements (`id`, tiers bronze/silver/gold):
member — `helper` assists 5/25/100; `closer` final completer 10/50/200; `ontime` on-time 10/50/200;
`kitchen` subtasks in category `kitchen` 20/100/400; `pets` category `pets` 20/100/400;
`marathon` streak 4/12/52 weeks; `fit` (active) 3 of the last 4 weeks counted;
`pillar` (active) ≥25% of household XP over the last 28 days; `spring` (seasonal) 30 subtasks in local spring
(Sep–Nov southern hemisphere, Mar–May northern; hemisphere from the household timeZone);
`yearend` (seasonal) household weekly goal reached in 2 December weeks.
organizer — `host` members activated 1/3/6; `maestro` weeks ≥90% on time 4/12/26; `architect`
custom chores done 10+ times 3/10/25; `fair` even-split weeks 4/12/26; `order` (active) ≥80% on time over the last 4 weeks.
Active achievements toggle `active` and pay only on first unlock. Organizer achievements pay no Ganhos.

### C8. Engine placement and the client protocol

- The engine runs right after the existing transaction of each of these callables, in the same call, and in
  `closeWeeks`. The wiring is `functions/src/gamification/runner.ts` (`runGamification(events, ctx)`):

  | Callable | Events | Celebrations |
  | --- | --- | --- |
  | `completeSubtask` | one `ledger.subtask`; one `ledger.bonus` per bonus row; `instance.completed_on_time` when the instance finished before `dueAt` (evaluated per assignee who contributed) | returned |
  | `undoSubtask` | `ledger.undo-subtask` + `ledger.undo-bonus` per reversed bonus row | none |
  | `resolveDispute`, `moderateInstance` | `ledger.revoke-subtask` per revoked completion + `ledger.revoke-bonus` per reversed bonus row; when the instance reopens, every assignee's on-time row is reversed too | none |
  | `postCompletion` | `feed.post` (only when the post was created) | returned |
  | `joinHousehold`, `saveChore` (new chores) | `member.joined`, `chore.created`: informational (they refresh the cohort) | none |
  | `finishSetup` | `household.setup_finished` | none (the Zelo toast goes to the creator's inbox) |
  | `deleteChore`, `removeMember` | `chore.deleted`, `member.removed` (Zelo clawbacks) | none |
  | `closeWeeks` | one `household.week_closed`, evaluated once per active member, chaining the organizer; replayed on the next pass if the run did not commit (C11) | inbox + FCM |

- **One transaction per run.** Wallets, the organizer projection and the existing ledger keys (queried by `sourceRef`,
  never whole ledgers) are read, the pure engine evaluates, and the ledger rows (`create()`), projections, server
  events, alerts, inbox rows and the processed markers are written in the same Firestore transaction. Two runs on the
  same wallet serialise instead of overwriting each other. FCM is sent after the commit.
- **Never fails the action.** Any error is logged (`runGamification failed` with the household and event kinds) and the
  XP action stands; `completeSubtask`/`postCompletion` then return `celebrations: []`.
- **Mode off** is a no-op. **Shadow / control / shadow-under-live** write ledgers, projections, events and alerts only.
- **Safety net.** `onDocumentCreated('households/{hid}/ledger/{entryId}')` (`replayGamiLedgerRowTrigger`) rebuilds the
  event for a row the callable did not mark in `gamiProcessed/{rowId}`, after a 3 s grace so the callable normally wins
  (and a client waiting on `celebrations` gets them in the response). Callable and trigger never double-pay: ledger keys
  are deterministic and created with `create()` inside the transaction. The replay rebuilds from the documents as they
  are now: it never pays a completion that has since been undone or revoked, and approximates `isAssist` /
  `isFinalCompleter` for reversals. Celebrations the trigger earns go to the inbox.
- **`completeSubtask` response**: `{ instanceId, subtaskId, status, completionId, celebrations: Celebration[] }`.
  **`postCompletion` response**: `{ postId, created, celebrations: Celebration[] }`. `celebrations` holds only the
  *caller's* celebrations and only under `live` + cohort `live` (`[]` otherwise). A celebration owned by someone else
  (the creator's Zelo toast when a member completes a subtask) is written to that user's inbox instead.
  A `live` run caller-side may return several toasts (the credit, the on-time earn) and level/badge celebrations.
- **Inbox**: async earns (undo, week close, safety-net, other members') are written to `users/{uid}/inbox/{id}` as
  `Celebration & { seen: false, createdAt }` under `live` + cohort `live` only. FCM goes out for week-close earns only.
- Callable `ackCelebrations({ ids: string[] })` → `{ ok: true, acknowledged: number }` marks the caller's inbox rows
  seen (1..50 ids, `invalid-argument` otherwise; unknown ids and other users' rows are ignored, never touched).
- Callable `getWallet({})` is NOT needed: the owner reads `wallets/{uid}` directly.
- Session rule (client): at most one full-screen celebration per app session; later ones become toasts.
  When the action also completes the instance, the badge shows inside the S3 celebration.

### C9. Integrity

- Caps and clawbacks as above. Velocity alerts written to `gamification/alerts`:
  >12 subtasks in 10 minutes by one member; chore XP raised then completed by the creator within 48 h;
  undo+revoke rate >30% in a week (evaluated in closeWeeks). Alerts never claw back automatically. The velocity window
  is read after the XP transaction commits (`recentSubtaskTimes`, ledger composite index `memberId, source, createdAt`);
  a failed read logs and skips the alert.
- `deleteAccount` deletes `wallets/{uid}`, its ledger and `users/{uid}/inbox` (recursively, before the user doc). Zelo rows stay.
- `rebuildWallet(uid)` (admin callable) replays the wallet ledger and rewrites the projection.

### C10. Admin (apps/admin + callables)

Callables (code: `functions/src/admin-gamification/`, request/response types: `apps/admin/src/api-types.ts`) require the
Auth custom claim `admin: true` (`permission-denied` otherwise, `unauthenticated` without sign-in; granted with
`functions/scripts/set-admin-claim.mjs`) and write `gamification/audit/items/{id}` = `{ action, actorUid, at, before, after }`
for every mutation, in the transaction that makes the change. The full table of inputs, errors and effects is in
`docs/implementation/firebase-contract.md` ("Admin callables"). Final shapes:

- `adminGetConfig()` → `{ mode, activeVersion, previousVersion, cohortSalt, livePercent, controlPercent }`.
- `adminSetConfig({ mode, livePercent, controlPercent })` → the config. Percentages 0..100, sum ≤ 100; the salt is created
  once and never changed.
- `adminListRuleSets()` → `{ ruleSets: { version, status, notes, createdBy, createdAt, publishedAt, rules }[] }` newest first.
- `adminSaveDraft({ version?, notes, rules })` → `{ version, status: 'draft', createdAt }`; validation errors →
  `invalid-argument` whose message lists them.
- `adminPublish({ version })` → `{ activeVersion, previousVersion, publishedAt }`; `adminRollback()` →
  `{ activeVersion, previousVersion }` (the pair is swapped).
- `adminSimulate({ rules, days: 1..28 })` → `{ days, published, draft, perRule }`; each side is
  `{ ganhos, zelo, membersAffected, capHits, averagePerMember }` (`averagePerMember` = (Ganhos + Zelo) / members affected,
  one decimal), `perRule` is `{ ruleId, track, published: {total, membersAffected, capHits, averagePerMember} | null, draft: … | null }[]`
  sorted by rule id. The ledger rows are replayed in time order through each rule set with fresh projections (so every member
  starts without a welcome payout), without any write. A *cap hit* is a replayed event where the rule's award is smaller than
  the same rule's award with its caps removed. Events are rebuilt like the safety-net trigger does (current instance state).
- `adminLookupUser({ uid })` → `{ uid, wallet | null, ledger: (wallet row + explanation)[], pendingAdjustments[] }`, ledger
  newest first, at most 500 rows.
- `adminAdjust({ uid, amount, reasonCode, note })` → `{ id: null, status: 'applied' }` for |amount| ≤ 500, otherwise
  `{ id, status: 'pending' }`; `adminApproveAdjustment({ id })` (a different admin) → `{ id, status: 'applied', approvedBy, appliedAt }`.
  Applying writes the wallet ledger row `admin.adjust` (key `admin.adjust:{adjustmentId}:{uid}`, signed `amount`, `reason` = note,
  `reasonCode`, `adjustmentId`, `appliedBy`) and updates the projection (balance, and lifetimeEarned for a positive amount)
  in one transaction; a balance below 0 is `failed-precondition`.
- `adminListAlerts()` → `{ alerts }` (200 newest first); `adminRebuildWallet({ uid })` → `{ uid, rows, balance }`;
  `adminBackfillLevelFloors()` → `{ updatedMembers }`.

Publishing, rolling back and changing the config drop the config cache of the instance that served the call; other
instances read the new rule set within the 60 s cache window (C1).

`apps/admin`: Vite + React + TypeScript web app on a second Firebase Hosting site (target `admin`),
Firebase Auth Google sign-in, all writes through the callables. Screens: rollout/config, rule sets
(list, diff vs published, publish, roll back), earn-rule form with live toast preview, simulator,
ledger lookup with signed adjustments, alerts.

### C11. Implementation notes and deviations

Decisions taken while wiring the engine (`functions/src/gamification/*`), where the earlier text was silent or wrong:

- **Document paths** of `ruleSets`, `alerts`, `audit` and `adjustments` are `gamification/{name}/items/{id}` (C1).
- **Engine/contract deviations** (engine author): `EarnRule.clawback` is an array; `award` has `amount`, `perXp`, `overrides`,
  `milestones`, `tiers`; rules carry `ref`; reversal events carry `reversedAward` read from the original wallet rows;
  achievements with a single condition are bronze-only (C2). Welcome is declared on `member.joined` and paid at the
  first subtask credit of any user (the creator included).
- **Engine fixes made while wiring** (with tests): the badge celebration id now includes the tier
  (`cel:badge:{achievementId}:{tier}:{memberId}`) and the on-time toast id the completion generation
  (`cel:toast:{instanceId}|{finalRowId}:{memberId}`), so a tier upgrade or a re-completion is a new inbox row instead of
  colliding with the first; the wallet deserializer keeps `active: false` on lapsed active badges.
- **Atomic runs.** See C8. Ledger rows are created, never merged; server events and alerts use `set()` so a repeat can never
  abort the ledger writes.
- **Level-ups.** Member level-ups are `cel:level:member:{level}:{memberId}` and organizer level-ups
  `cel:level:organizer:{level}:{creatorUid}` (the two used to share an id). Organizer level-ups are celebrated (toast and
  `gami_level_up`) wherever Zelo is awarded: a subtask credit, setup or the week close. The `gami_level_up` event doc id is
  fixed per track, member and level (`evt:gami_level_up:{ganhos|zelo}:{memberId}:{level}`) and written only when absent, so a
  level crossed again after a clawback is recorded once.
- **Multi-member events.** `instance.completed_on_time` and `household.week_closed` call the engine once per affected wallet,
  chaining the organizer projection and unioning the emitted keys. Undo/revoke call it for the completer and, when the
  instance reopens, for every assignee.
- **Weekly close.** `afterWeekClosedHooks` runs the Part C hook on the run that created the week doc, and again on later
  passes for every closed week doc of the last 8 weeks without `gamification.processedAt`, oldest first from its stored
  stats (a week still failing holds the later ones back, so the engine never sees them out of order). It builds
  `household.week_closed` from the standings context plus the week's instances (on-time = done with the last completion
  before `dueAt`), the weekly goal (net week XP of the active members ≥ `weeklyGoalXp`), per-member undo/revoke counts and
  whether every member is away, and writes `weeks/{weekStart}.gamification = { onTimeRate (integer %), dueInstances,
  doneOnTime, goalReached, weeklyGoalXp }` whenever the engine writes (any mode but `off`), then `processedAt` once the
  engine run committed. The aggregates are a snapshot: a replay reuses the stored ones and only computes them (from the
  instances as they are then) when the doc has none. The run uses the throwing variant of the runner
  (`runGamificationStrict`), so a failure leaves the week without `processedAt`; the next hourly pass rebuilds the context
  from the week doc (same `closedAt` and member stats) and runs it again. A week closed while the program could not
  process it gets a terminal marker, `gamification = { processedAt, skipped: 'off' | 'cohort' | 'no-creator' }`, and is
  never replayed: switching the program on does not retro-process an old week (and the first deploy replays nothing
  for households whose engine is `off`). Weeks older than the 8-week window that never got a marker are not replayed
  either. Replays are safe: the ledger keys, the event ids and `lastActionWeek` make a second run a no-op.
  FCM and inbox rows only under `live`.
- **Cohort** is recomputed on every run and persisted when it differs (C1); the config is never cached in tests.
- **Rules** (`firestore.rules`): the owner reads `wallets/{uid}`, `wallets/{uid}/ledger/*` and `users/{uid}/inbox/*`; members
  read the household subcollections (organizer, organizerLedger, events, weeks, ...); nobody writes any of it from the
  client; `gamification/**` has no client access.

