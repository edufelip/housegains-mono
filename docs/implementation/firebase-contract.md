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

`households/{hid}` — readable by members (`request.auth.uid in resource.data.memberUids`).
Client writes: none.
```
name (1..40)  icon  color  timeZone (IANA)  weeklyGoalXp: number|null
creatorUid  memberUids: string[] (max 12)  setupComplete: bool  createdAt  updatedAt
```

Subcollections of `households/{hid}` (all readable by members, client writes: none):

- `members/{uid}` — `name, initials, color, role: 'creator'|'member', joinedAt`.
  A deleted account leaves a tombstone: `name: 'Former member'`, `initials: '?'`,
  `deleted: true`, and the uid is removed from `memberUids`.
- `chores/{choreId}` — the `Chore` shape in `apps/mobile/features/household/types.ts`
  plus `recurrenceAnchor` (YYYY-MM-DD) and `generatedThrough` (YYYY-MM-DD).
- `instances/{instanceId}` — the `Instance` shape (with `choreSnapshot`, embedded
  `completions[]` and `bonusAwards` map). `dueAt` is a Timestamp. Id is
  `${choreId}_${YYYY-MM-DD}` so generation is idempotent.
- `ledger/{entryId}` — the `XpLedgerEntry` shape (`memberId` = uid).
- `feed/{postId}` — `instanceId, memberId, createdAt`. Id `${instanceId}_${uid}`
  (one post per member per instance).
- `meta/invite` — `code, expiresAt, uses, maxUses, revoked` (the current invite).

`inviteCodes/{code}` — no client access. `householdId, expiresAt, uses, maxUses, revoked`.
Codes: 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, TTL 7 days, max 8 uses.

`reports/{id}` — no client access. `reporterUid, householdId, kind: 'member'|'household'|'chore',
targetId, reason (0..500), createdAt`.

Composite indexes: `instances` by `dueAt` asc; `ledger` by `createdAt` desc;
`feed` by `createdAt` desc. Collection-group `instances` by `status, dueAt` for reminders.

## Callable functions (`onCall`, 2nd gen)

Inputs are validated; errors use `HttpsError` codes below. Every household-scoped
call takes `householdId` and fails `permission-denied` unless the caller is in `memberUids`.

| Name | Input | Effect / rules |
| --- | --- | --- |
| `ensureProfile` | `{displayName, locale, themeId}` | Create `users/{uid}` if missing (initials + color derived). Idempotent. Returns the profile. |
| `createHousehold` | `{name, icon, color, timeZone}` | `failed-precondition` if user already has a household. Creates household, creator member, invite (`meta/invite` + `inviteCodes`). Sets `users.householdId`. Returns `{householdId}`. |
| `updateHousehold` | `{householdId, name, icon, color, weeklyGoalXp?}` | Creator only. |
| `joinHousehold` | `{code}` | Uppercase/trim. `not-found` bad code; `failed-precondition` expired/revoked/full/already in a household; `resource-exhausted` if 12 members. Transaction increments `uses`. Returns `{householdId}`. |
| `rotateInvite` | `{householdId}` | Creator only. Revokes old code, issues new one. |
| `saveChore` | `{householdId, chore}` | Creator only (v1). Create or update; validates subtasks (1..12, xp 1..100), bonusXp 0..200, assigneeIds ⊆ members. Regenerates future open instances (keeps instances with completions). Returns `{choreId}`. |
| `setAssignments` | `{householdId, choreId, assigneeIds}` | Creator only. Updates chore + future open instances. |
| `setChoreActive` | `{householdId, choreId, isActive}` | Creator only. Pausing deletes future untouched instances. |
| `deleteChore` | `{householdId, choreId}` | Creator only. Deletes chore and future untouched instances; keeps history. |
| `completeSubtask` | `{householdId, instanceId, subtaskId}` | Any member. Transaction: `already-exists` if that subtask is done; append completion (`isAssist` = caller not in assignees), ledger `subtask` credit. When all subtasks are done: status `done`, compute `bonusAwards` with the existing `calculateBonusAwards` rule and write `bonus` ledger rows. Else status `partial`. |
| `undoSubtask` | `{householdId, instanceId, subtaskId}` | Only the completer, within 5 minutes. Reverses subtask credit and, if the instance was `done`, every bonus row (`undo-*` rows with negative amounts and `reversesEntryId`). |
| `finishSetup` | `{householdId}` | Creator only. `setupComplete = true`. |
| `postCompletion` | `{householdId, instanceId}` | Member who completed at least one subtask of a `done` instance. Idempotent by id. |
| `leaveHousehold` | `{householdId}` | Removes caller from `memberUids`, tombstones member doc, removes caller from chore and open-instance assignees, clears `users.householdId`. If the caller is the creator, ownership moves to the longest-standing remaining member. If nobody remains, the household and all subcollections and its invite codes are deleted. |
| `removeMember` | `{householdId, uid}` | Creator only, not self. Same cleanup as leave for that uid. |
| `reportContent` | `{householdId, kind, targetId, reason}` | Any member. Writes `reports/{id}`. |
| `deleteAccount` | `{}` | Runs `leaveHousehold` logic if in a household, deletes `users/{uid}`, then deletes the Auth user. Ledger and completion rows keep the uid; the tombstone gives them the name "Former member". |

## Scheduled functions

- `generateInstances` — daily 03:00 UTC: for each active chore, create instances up to
  14 days ahead in the household time zone (same rules as the current local client:
  `parseRecurrence`, `isRecurrenceDueOnDate`, due time, catch-up capped at 365 days).
- `sendReminders` — every 30 minutes: for instances due within the next 60 minutes,
  status `open`/`partial`, and no reminder sent (`reminderSentAt` missing), send FCM to
  each assignee with `remindersEnabled !== false`, localized to the user's `locale`
  (title: chore name; body: "Your turn: {chore} is due at {time}" in 6 languages).
  Set `reminderSentAt`. Remove tokens FCM reports as unregistered.

## Hosting

- `/.well-known/apple-app-site-association` — `Content-Type: application/json`,
  appIDs `L4N9Z3Z82V.com.housegains.app` and `L4N9Z3Z82V.com.housegains.app.dev`, paths `/j/*`, `/join/*`.
- `/.well-known/assetlinks.json` — packages `com.housegains.app` and `.dev`; SHA-256
  fingerprints are placeholders until the Play App Signing key exists (tracked).
- `/j/**` and `/join/**` rewrite to `/j/index.html`: shows the code and App Store / Play links.
- `/privacy`, `/terms`, `/support`, `/delete-account` in 6 languages (`/pt-BR/privacy` …),
  English at the root path.

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
