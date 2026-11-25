# HouseGains Firebase contract (v1)

Status: authoritative for v1. Replaces the Bun/Elysia `apps/server` (removed) and the
local-only `HouseholdClient` adapter. Decided 2026-11-13.

## Projects

| Variant | Firebase project | iOS bundle | Android package |
| --- | --- | --- | --- |
| dev | `housegains-dev` | `com.housegains.app.dev` | `com.housegains.app.dev` |
| prod | `housegains-prod` | `com.housegains.app` | `com.housegains.app` |

Region for Functions: `us-central1`. Firestore: `(default)` database, `nam5`.
Hosting serves `https://housegains.app` (prod) from `apps/firebase/hosting/public`.

## Repository layout

```
apps/firebase/
  firebase.json            # firestore, functions, hosting, emulators
  .firebaserc              # aliases: dev -> housegains-dev, prod -> housegains-prod
  firestore.rules
  firestore.indexes.json
  functions/               # TypeScript, Node 22, firebase-functions v6 (2nd gen)
    src/index.ts           # exports every function below
    src/domain/*.ts        # pure logic (recurrence, instances, bonus, invites) + unit tests
    test/                  # rules + functions tests against the emulators
  hosting/public/          # static site (landing, /j/<code>, legal, .well-known)
```

## Auth

Firebase Auth providers: Apple, Google, Email/Password (Firebase sends the reset email).
Every callable requires `request.auth`. `uid` is the member id everywhere.

## Data model (Firestore)

All timestamps are Firestore `Timestamp`. Ids are Firestore auto-ids unless stated.

`users/{uid}` — owner can read; owner may write only `displayName`, `locale`, `themeId`,
`fcmTokens` (array of strings, max 10), `remindersEnabled` (bool). Everything else is
function-only.
```
displayName: string (1..40)   initials: string (1..3)   color: string (#rrggbb)
householdId: string | null    locale: 'en-US'|'pt-BR'|'es-ES'|'fr-FR'|'de-DE'|'it-IT'
themeId: 'arcade'|'sticker'|'soft'   fcmTokens: string[]   remindersEnabled: bool
createdAt
```
`users/{uid}/inbox/{id}` — owner can read, nobody writes from the client (`ackCelebrations` marks rows seen).
Gamification celebrations queued while the app was away (`Celebration & { seen, createdAt }`, id = celebration id;
gamification contract C3).

`wallets/{uid}` — owner can read, client writes: none. The Ganhos wallet projection (gamification contract C3), and its
append-only `wallets/{uid}/ledger/{key}` rows (owner reads). Deleted with the account.

`gamification/**` — no client access: `gamification/config` (rollout mode, cohort, published rule set version),
`gamification/ruleSets/items/{version}`, `gamification/alerts/items/{id}`, `gamification/audit/items/{id}`,
`gamification/adjustments/items/{id}`. See gamification contract C1/C2/C9.

`households/{hid}` — readable by members (`request.auth.uid in resource.data.memberUids`).
Client writes: none.
```
name (1..40)  icon  color  timeZone (IANA)  weeklyGoalXp: number|null
creatorUid  memberUids: string[] (max 12)  setupComplete: bool  createdAt  updatedAt
gamificationCohort: 'live'|'control'|'shadow'   // server-written (createHousehold and every engine run)
```

Subcollections of `households/{hid}` (all readable by members, client writes: none):

- `members/{uid}` — `name, initials, color, role: 'creator'|'admin'|'member', xp, xpPeak, levelFloor, joinedAt`
  (`xpPeak` = max XP ever, written in the same transaction as `xp`; new members start at `xpPeak: 0, levelFloor: 1`).
  Exactly one `creator` (always an admin); "admin rights" means `role` is `creator` or
  `admin`. Existing creator-only callables stay creator-only; admin rights only add the
  moderation powers below. Creator succession (leave / remove / delete account) picks the
  longest-standing remaining admin, else the longest-standing member.
  A deleted account leaves a tombstone: `name: 'Former member'`, `initials: '?'`,
  `deleted: true`, and the uid is removed from `memberUids`.
- `chores/{choreId}` — the `Chore` shape in `apps/mobile/features/household/types.ts`
  plus `recurrenceAnchor` (YYYY-MM-DD), `generatedThrough` (YYYY-MM-DD) and the server-set
  `createdAt`, `updatedAt`, `createdBy` and `xpRaisedAt` (gamification engine inputs).
- `instances/{instanceId}` — the `Instance` shape (with `choreSnapshot`, embedded
  `completions[]` and `bonusAwards` map). `dueAt` is a Timestamp. Id is
  `${choreId}_${YYYY-MM-DD}` so generation is idempotent. Moderation adds
  `disputeStatus: 'open'|'resolved'|'expired'` (absent = never disputed) and
  `revocations[]`: `{ subtaskId, memberId, xp, actorUid, verdict: 'partial'|'not_done', at }`,
  appended when an admin revokes a completion. An instance that carries a `disputeStatus` or a
  non-empty `revocations[]` is a review record: chore edits (`saveChore`, `setAssignments`,
  `setChoreActive`, `deleteChore`) never rewrite or delete it, even when undo left it `open` with no completions.
  `retiredAt?: Timestamp` is set on such a record when it is still open in the future with no completions and its chore
  is deleted or paused: the record stays but is out of play (no reminders; `completeSubtask` fails with
  `failed-precondition`; not counted as assigned or missed in the week stats or the on-time counts). The overdue pass
  still closes it (`partial`); reactivating the chore clears `retiredAt` on the ones still in the future. Edits apply
  the new `assigneeIds` to a review record; its subtasks and due time stay as recorded. **Mobile type contract:** the
  instance type gains `retiredAt?: Date | null`, and clients hide an instance that has it.
- `ledger/{entryId}` — the `XpLedgerEntry` shape (`memberId` = uid). Sources are
  `subtask | bonus | undo-subtask | undo-bonus | revoke-subtask | revoke-bonus`; undo and
  revoke rows are signed reversals with `reversesEntryId`, and revoke rows also carry
  `moderation: { actorUid, disputeId | null, verdict }`.
- `disputes/{instanceId}` — one dispute per instance (doc id = instanceId), readable by
  members:
  `instanceId, choreName, status: 'open'|'resolved'|'expired', subtaskIds (union of every
  report), completerIds, completionIds? (the ids of the reported completions, union over reports; absent on
  older disputes), reports: { uid, subtaskIds, reason (0..280), createdAt }[],
  verdict?, revokedSubtaskIds?, resolverUid?, createdAt, resolvedAt?, expiresAt`
  (`expiresAt` = earliest disputed completion + 72 h). The hourly `closeWeeks` job
  (moderation contract Part B) marks open disputes past `expiresAt` as `expired` and sets
  `instances.disputeStatus = 'expired'`, one transaction per dispute that re-checks it is still open; a resolve
  refuses a past-window dispute in the meantime.
- `weeks/{weekStart}` — closed-week snapshot written only by the hourly `closeWeeks` job
  (moderation contract Part B); readable by members, never rewritten by later moderation.
  `weekStart` is the Monday's `YYYY-MM-DD`, `weekEnd` the Sunday's:
  `weekStart, weekEnd, timeZone, closedAt, gamiEligible,
  members: { [uid]: { xp, subtasks, assignedDue, missed } },
  topMember: { memberId, xp, subtasks } | null,
  wallOfShame: { memberId, missed, assignedDue } | null,
  gamification?: { onTimeRate, dueInstances, doneOnTime, goalReached, weeklyGoalXp, processedAt, skipped? }` (the Part C
  aggregates, a snapshot a replay reuses, written by the same close whenever the gamification engine is not `off`;
  `processedAt` is written only once the engine run for the week committed, and its absence is what makes `closeWeeks`
  replay the week, oldest first, within the last 8 weeks. A week closed while the program could not process it carries
  only `{ processedAt, skipped: 'off'|'cohort'|'no-creator' }` and is never replayed).
- `feed/{postId}` — `instanceId, memberId, createdAt`. Id `${instanceId}_${uid}`
  (one post per member per instance).
- `meta/invite` — `code, expiresAt, uses, maxUses, revoked` (the current invite).
- Gamification (gamification contract C3, server-written, members read): `organizer/{creatorUid}` (Zelo projection),
  `organizerLedger/{key}` (Zelo ledger), `events/{id}` (server events), `gamiProcessed/{ledgerRowId}` (XP rows an engine
  run covered) and `gamiReminders/{weekStart}:{member|creator}` (reminder claims).

`inviteCodes/{code}` — no client access. `householdId, expiresAt, uses, maxUses, revoked`.
Codes: 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, TTL 7 days, max 8 uses.

`reports/{id}` — no client access. `reporterUid, householdId, kind: 'member'|'household'|'chore',
targetId, reason (0..500), createdAt`.

Composite indexes: `instances` by `dueAt` asc; `ledger` by `createdAt` asc and desc (the `ledger.createdAt` field
override lists both: an override replaces the automatic single-field indexes, and the week close, the reminders and
the admin lookup need both orders; `functions/src/firestore-indexes.test.ts` pins this); `feed` by `createdAt` desc. Collection-group `instances` by `status, dueAt` for reminders;
`disputes` by `status, expiresAt`; `ledger` by `memberId, source, createdAt` (the gamification velocity window);
collection-group `ledger` by `source, createdAt` (the admin simulator reads the last N days of `households/*/ledger`).

Security rules (`firestore.rules`): members read the household subcollections; the owner reads `users/{uid}`,
`users/{uid}/inbox/*`, `wallets/{uid}` and `wallets/{uid}/ledger/*`; nothing but the whitelisted profile fields is
writable from the client; `inviteCodes`, `reports`, `gamification/**` and anything unlisted are closed.

## Callable functions (`onCall`, 2nd gen)

Inputs are validated; errors use `HttpsError` codes below. Every household-scoped
call takes `householdId` and fails `permission-denied` unless the caller is in `memberUids`.

| Name | Input | Effect / rules |
| --- | --- | --- |
| `ensureProfile` | `{displayName, locale, themeId}` | Create `users/{uid}` if missing (initials + color derived). Idempotent. Returns the profile. |
| `createHousehold` | `{name, icon, color, timeZone}` | `failed-precondition` if user already has a household. Creates household, creator member, invite (`meta/invite` + `inviteCodes`). Sets `users.householdId`. Returns `{householdId}`. |
| `updateHousehold` | `{householdId, name, icon, color, weeklyGoalXp?}` | Creator only. |
| `joinHousehold` | `{code}` | Uppercase/trim. `not-found` bad code; `failed-precondition` expired/revoked/full/already in a household; `resource-exhausted` if 12 members. Transaction increments `uses`. Returns `{householdId}`. New member docs start at `xpPeak: 0, levelFloor: 1`. |
| `rotateInvite` | `{householdId}` | Creator only. Revokes old code, issues new one. |
| `saveChore` | `{householdId, chore}` | Creator only (v1). Create or update; validates subtasks (1..12, xp 1..100), bonusXp 0..200, assigneeIds ⊆ members. Regenerates future open instances (keeps instances with completions). Returns `{choreId}`. |
| `setAssignments` | `{householdId, choreId, assigneeIds}` | Creator only. Updates chore + future open instances. |
| `setChoreActive` | `{householdId, choreId, isActive}` | Creator only. Pausing deletes future untouched instances. |
| `deleteChore` | `{householdId, choreId}` | Creator only. Deletes chore and future untouched instances; keeps history. |
| `completeSubtask` | `{householdId, instanceId, subtaskId}` | Any member. Transaction: `already-exists` if that subtask is done; append completion (`isAssist` = caller not in assignees), ledger `subtask` credit. When all subtasks are done: status `done`, compute `bonusAwards` with the existing `calculateBonusAwards` rule and write `bonus` ledger rows. Else status `partial`. Writes `xp` and `xpPeak` (never decreasing) in the same transaction, then runs the gamification engine (mode `off`: no-op). Returns `{instanceId, subtaskId, status, completionId, celebrations}`: `celebrations` is the caller's `Celebration[]` under mode `live` + cohort `live`, else `[]`. |
| `undoSubtask` | `{householdId, instanceId, subtaskId}` | Only the completer, within 5 minutes. Reverses subtask credit and, if the instance was `done`, every still-active bonus row (`undo-*` rows with negative amounts and `reversesEntryId`). A revoked (already reversed) row is never reversed again. The engine claws back exactly what the rows paid. `xpPeak` is not lowered. |
| `setMemberRole` | `{householdId, memberId, role: 'admin'\|'member'}` | Creator only (`permission-denied`). `invalid-argument` if `memberId` is the caller; `not-found` if not in `memberUids`. Idempotent. Returns `{memberId, role}`. |
| `reportCompletion` | `{householdId, instanceId, subtaskIds?, reason?}` | Any member **without** admin rights; admins get `permission-denied`. `subtaskIds` defaults to every completed subtask the caller did not complete; each id must be completed (`failed-precondition`) and not the caller's own (`invalid-argument`). `failed-precondition` for an instance without completions, an empty target list, completions older than 72 h, or a resolved/expired dispute. Creates or appends to `households/{hid}/disputes/{instanceId}` (`already-exists` if the caller already reported), sets `instances.disputeStatus = 'open'`, pushes FCM to every admin-rights member. Returns `{disputeId}`. |
| `resolveDispute` | `{householdId, disputeId, verdict: 'done'\|'partial'\|'not_done', subtaskIds?}` | Admin rights required. `not-found` / `failed-precondition` for a missing / not-open (or past-window) dispute. Conflict of interest: `permission-denied` if any disputed completion was made by the caller, unless they are the only admin. A verdict only touches the completions a report named (`completionIds`): a subtask the reported member undid and somebody else then completed stands, and is not part of the conflict check or the notifications. Disputes without `completionIds` match by subtask id. `done` keeps everything; `not_done` revokes every disputed subtask; `partial` needs a strict subset of the disputed subtasks (`invalid-argument`, also when only one subtask is disputed). If the dispute's instance no longer exists the dispute resolves without revocations (nothing is left to revoke). Revocation per contract A3; notifies the completers and reporters who are still members via FCM only (no inbox row). Returns `{disputeId, verdict, revokedSubtaskIds}`. |
| `moderateInstance` | `{householdId, instanceId, verdict: 'partial'\|'not_done', subtaskIds?}` | Admins mark a logged completion directly. `not_done` targets every completed subtask (or `subtaskIds`); `partial` needs a strict subset of the completed subtasks. Same 72 h window and conflict-of-interest rule as `resolveDispute`; when an open dispute exists the rule covers the targets and the completions the dispute covers (the call closes that dispute). Resolves an open dispute for the instance with this verdict and stamps its id in `moderation.disputeId` of the revoke rows. Returns `{instanceId, verdict, revokedSubtaskIds}`. |
| `finishSetup` | `{householdId}` | Creator only. `setupComplete = true`. Pays the one-off Zelo setup award (engine, once per household). |
| `postCompletion` | `{householdId, instanceId}` | Member who completed at least one subtask of a `done` instance. Idempotent by id. Returns `{postId, created, celebrations}` (the 2-Ganhos share earn, once per day, under live + live cohort). |
| `ackCelebrations` | `{ids: string[]}` | Marks the caller's `users/{uid}/inbox/{id}` rows seen. 1..50 ids (`invalid-argument`); unknown ids and other users' rows are ignored. Returns `{ok, acknowledged}`. |
| `setAwayWeeks` | `{householdId?, weekStarts: string[]}` | Away mode (gamification C7): future Mondays in the household time zone, at most 3 per calendar year (past away weeks count). Replaces the future list; stores `wallets/{uid}.streak.awayWeeks`. `invalid-argument` (format, not a Monday), `failed-precondition` (not in the future, yearly limit, no household), `permission-denied` (not a member). Returns `{weekStarts}`. |
| `leaveHousehold` | `{householdId}` | Removes caller from `memberUids`, tombstones member doc, removes caller from chore and open-instance assignees, clears `users.householdId`. If the caller is the creator, ownership moves to the longest-standing remaining member. If nobody remains, the household and all subcollections and its invite codes are deleted. |
| `removeMember` | `{householdId, uid}` | Creator only, not self. Same cleanup as leave for that uid. |
| `reportContent` | `{householdId, kind, targetId, reason}` | Any member. Writes `reports/{id}`. |
| `deleteAccount` | `{}` | Runs `leaveHousehold` logic if in a household, deletes `wallets/{uid}` with its ledger and `users/{uid}/inbox` (Zelo rows stay), deletes `users/{uid}`, then deletes the Auth user. Ledger and completion rows keep the uid; the tombstone gives them the name "Former member". |

### Admin callables (gamification back office, contract C10)

Code in `functions/src/admin-gamification/`. Every one requires `request.auth.token.admin === true`
(`unauthenticated` without sign-in, `permission-denied` without the claim; grant it with
`functions/scripts/set-admin-claim.mjs`). The request/response shapes are `apps/admin/src/api-types.ts`
(`functions/src/admin-gamification/api-types.ts` is a checked copy). Dates are ISO strings. Every mutation writes
`gamification/audit/items/{id}` — `{action, actorUid, at, before, after}` — in the same transaction as the change.
Paths: `gamification/config`, `gamification/ruleSets/items/{version}`, `gamification/alerts/items/{id}`,
`gamification/audit/items/{id}`, `gamification/adjustments/items/{id}`.

| Name | Input | Effect / rules |
| --- | --- | --- |
| `adminGetConfig` | `{}` | The config; a missing document reads as `mode: 'off'`, no versions, empty salt. |
| `adminSetConfig` | `{mode, livePercent, controlPercent}` | `invalid-argument` unless mode is off/shadow/live, both percentages are numbers 0..100 and their sum is ≤ 100. Creates `cohortSalt` the first time and never changes it; leaves `activeVersion`/`previousVersion` alone. Audit `config.set`. |
| `adminListRuleSets` | `{}` | Every rule set, newest version first, rules inlined. |
| `adminSaveDraft` | `{version?, notes, rules}` | `rules` goes through `validateRuleSet`; failures are `invalid-argument` with every error in the message. No `version`: creates the next integer as a `draft`. With `version`: overwrites that draft (`not-found`; `failed-precondition` if it is not a draft). Audit `ruleSet.createDraft` / `ruleSet.updateDraft`. |
| `adminPublish` | `{version}` | One transaction: draft (re-validated) → `published`, the previously active set → `archived`, `activeVersion` = version, `previousVersion` = the old active. `not-found`; `failed-precondition` if not a draft. The config cache of the serving instance is dropped; other instances pick it up within 60 s. Audit `ruleSet.publish`. |
| `adminRollback` | `{}` | Swaps `activeVersion` and `previousVersion` (statuses follow). `failed-precondition` without a previous version. Audit `ruleSet.rollback`. |
| `adminSimulate` | `{rules, days: 1..28}` | Validates `rules`, replays the last N days of `households/*/ledger` XP rows (events rebuilt by the trigger's `buildReplayEvents`) in time order through the published rule set (or `DEFAULT_RULE_SET`) and the draft, against fresh in-memory projections. **No writes.** Returns per-side Ganhos/Zelo totals, members affected, cap hits (an award the caps trimmed or blocked), average per member, and a per-rule table (a side that does not define a rule is `null`). `failed-precondition` above 20 000 rows. |
| `adminLookupUser` | `{uid}` | The wallet summary (`null` without a wallet), up to 500 wallet ledger rows newest first each with an `explanation`, and the pending adjustments for that uid. |
| `adminAdjust` | `{uid, amount, reasonCode, note}` | Integer, non-zero `amount`; `reasonCode` ∈ correction/abuse/support-goodwill; non-empty `note` ≤ 500. `not-found` without a wallet. \|amount\| ≤ 500: applied at once (`{id: null, status: 'applied'}`); otherwise a `pending` adjustment (`{id, status: 'pending'}`). Applying = ledger row `admin.adjust` (key `admin.adjust:{adjustmentId}:{uid}`, signed amount, `reason` = note) plus the projection, in one transaction; `failed-precondition` if the balance would go below 0. Audit `adjust.apply` / `adjust.request`. |
| `adminApproveAdjustment` | `{id}` | The requester gets `permission-denied`; an adjustment that is not pending gets `failed-precondition` (so a double approval applies once); `not-found`. Applies as above, marks it `applied` with `approvedBy`/`appliedAt`. Audit `adjust.approve`. |
| `adminListAlerts` | `{}` | The 200 newest alerts (C9). |
| `adminRebuildWallet` | `{uid}` | Replays `wallets/{uid}/ledger` into balance, lifetimeEarned, pendingBalance, nextSpendableAt and level; keeps streak, achievements, stats and caps; `xpPeak` never decreases; `projectionVersion` + 1. One transaction. Returns `{uid, rows, balance}`; `not-found` without wallet and ledger. Audit `wallet.rebuild`. |
| `adminBackfillLevelFloors` | `{}` | Every `households/*/members/*` without `levelFloor` gets `levelFloor = floor(xp/100)+1` and `xpPeak = max(xpPeak, xp, 0)`; chunks of 200 in transactions. Returns `{updatedMembers}`. Audit `members.backfillLevelFloors`. |

## Scheduled functions

- `generateInstances` — daily 03:00 UTC: for each active chore, create instances up to
  14 days ahead in the household time zone (same rules as the current local client:
  `parseRecurrence`, `isRecurrenceDueOnDate`, due time, catch-up capped at 365 days).
- `sendReminders` — every 30 minutes: for instances due within the next 60 minutes,
  status `open`/`partial`, and no reminder sent (`reminderSentAt` missing), send FCM to
  each assignee with `remindersEnabled !== false`, localized to the user's `locale`
  (title: chore name; body: "Your turn: {chore} is due at {time}" in 6 languages).
  Set `reminderSentAt`. Remove tokens FCM reports as unregistered.
- `closeWeeks` — every 60 minutes, for every household: close the finished week
  (moderation contract Part B) once local time passes Monday 03:00 of the following week
  — write `households/{hid}/weeks/{weekStart}` with `create()` (idempotent), then push
  localized FCM ("Top member of the week" / "Wall of shame", pt-BR "Destaque da semana" /
  "Mural da vergonha") only on the run that created the doc. Every run also expires open
  disputes past `expiresAt` (`status: 'expired'`, `instances.disputeStatus = 'expired'`,
  completions stand; a dispute whose instance is gone only has its own doc expired) whether or not a week closed that
  hour. The week close, the notifications, the hooks and the dispute expiry are isolated steps: one failing is logged
  and never skips the others. Per-household errors are logged and never stop the other households. Pure logic lives in
  `functions/src/domain/standings.ts`; the gamification engine (contract Part C) hooks
  into the exported `afterWeekClosed(context)` after a fresh close: `scheduled.ts` registers the
  `gamiWeekClosedHook`, which runs `household.week_closed` through the engine (goal, streak, Zelo, achievements,
  localized FCM for the week's earnings under live) and writes `weeks/{weekStart}.gamification`, with `processedAt`
  once the engine run committed. A pass that finds closed week docs of the last 8 weeks without `processedAt` runs the
  hook again, oldest first, from each stored week doc (same `closedAt`, same member stats, same stored aggregates); the
  engine's keys make that idempotent, and weeks with a doc are never replayed as gap weeks. The week doc stores
  `gamiEligible` at creation. A week closed while the program was `off` (`gamiEligible` false or absent) or without a
  creator gets a terminal `skipped` marker, so switching the program on later does not retro-process it; a week closed
  while the program could run stays pending while the kill switch is `off` and is processed once it is back on.
- `gamificationReminders` — every 60 minutes: streak-at-risk push on Sunday 18:00 local and house-running-late push on
  Saturday 10:00 local, `live` households only, once per household per week and kind (the claim doc
  `gamiReminders/{weekStart}:{kind}` is created first), localized in 6 languages, `remindersEnabled` respected, then a
  `gami_reminder_sent` server event (gamification contract C7).

## Firestore triggers

- `replayGamiLedgerRowTrigger` — `onDocumentCreated('households/{hid}/ledger/{entryId}')`, the gamification safety net
  (contract C8). Skips rows the callable already marked in `gamiProcessed/{rowId}`; otherwise waits 3 s, re-checks, and
  re-runs the engine for the row. Ledger keys are deterministic and created with `create()` in the engine's
  transaction, so the callable and the trigger never double-pay. A no-op under mode `off`.

## Hosting

- `/.well-known/apple-app-site-association` — `Content-Type: application/json`,
  appIDs `L4N9Z3Z82V.com.housegains.app` and `L4N9Z3Z82V.com.housegains.app.dev`, paths `/j/*`, `/join/*`.
- `/.well-known/assetlinks.json` — packages `com.housegains.app` and `.dev`; SHA-256
  fingerprints are placeholders until the Play App Signing key exists (tracked).
- `/j/**` and `/join/**` rewrite to `/j/index.html`: shows the code and App Store / Play links.
- `/privacy`, `/terms`, `/support`, `/delete-account` in 6 languages (`/pt-BR/privacy` …),
  English at the root path.

### Admin site (target `admin`)

A second Firebase Hosting site serves the gamification admin app (contract Part C10):
`firebase.json` maps hosting target `admin` to `apps/admin/dist` (a Vite + React +
TypeScript SPA; every route rewrites to `/index.html`). The site ids are linked in
`.firebaserc` (`housegains-admin-dev` / `housegains-admin-prod`; the main site is target
`site`). The admin sites must be created in the Firebase console before the first
`firebase deploy --only hosting:admin`. The app signs in with Firebase Auth (Google) and
only ID tokens carrying the `admin: true` custom claim may call the `admin*` callables.

## Remote Config

The appearance picker's pages come from one Firebase Remote Config parameter, `style_picker_config`.

- **Value:** a JSON string in contract v1: `{ "schemaVersion": 1, "styles": [...] }`. Each style sets `id`, `enabled`, `order`, `composition`, `nameTreatment`, `headingFont`, `copy` (`name` and `description`, each `{ key }` or `{ text }`) and `tokens`. Types: `apps/mobile/features/appearance/picker-config-types.ts`. Validator: `picker-config.ts`.
- **Bundled fallback:** the config bundled in the app is used whenever the parameter is missing, unparseable, or fails rules R1 and R3.
- **Activation:** the provider reads the already-activated value once at start. A background `fetchAndActivate` stores the newer value, which takes effect at the next cold start, never mid-screen.
- **Client package:** `@react-native-firebase/remote-config` 23.8.8.
- **Validation rules:**
  - R1: not an object, `schemaVersion !== 1`, or `styles` not an array; the whole config is ignored.
  - R2: a style failing a check is dropped with one error line and other styles are kept; unknown fields are ignored. R2a: `id` matches `STYLE_ID_PATTERN` and is unique. R2b: `composition`, `nameTreatment` and `headingFont` are in their allowed sets, `order` is a finite number, `enabled` is boolean or absent. R2c: every color token is `#RRGGBB`, `radius` is 0–32, `borderWidth` is 0–4.
  - R3: fewer than 2 valid enabled styles; the whole config is ignored.
  - R4: contrast of text/canvas, text/surface, muted/canvas and onPrimary/primary below 3:1 drops the style; below 4.5:1 keeps it with a warning.
  - R5: `copy.name` and `copy.description` are either a `{ key }` present in all six locale bundles, or a non-empty `{ text }` for each of en-US, pt-BR, es-ES, fr-FR, de-DE and it-IT.
  - R6: a saved style that is hidden or missing still resolves: the full `styles` list first, then the bundled style with that id, then the bundled style with the saved composition, then the first bundled visible style.
  - R7: new ids are allowed; they reuse a shipped composition.
  - R8: the value is read once at start; the background fetch applies at the next cold start.
  - R9: a style's tokens apply app-wide while that style is active.
  - R10: a bundled id whose canvas, primary or accent differs from the bundled value but whose description is still the bundled key gets the warning "description may no longer match".
- **Visible pages:** styles with `enabled !== false`, sorted by `order`, then `id`. Page order comes from this config: Sticker Pop, Arcade, Soft Home.

## Mobile client

`apps/mobile/features/household/firebase-household-client.ts` implements the same
`HouseholdViewModel` surface used by the screens, backed by Firestore listeners (reads)
and the callables above (writes). `loadDemo` and `dataMode: 'local-demo'` are removed.
Derived values (`weeklyTotals`, `streak`) are computed client-side from `ledger` with the
existing pure functions.
