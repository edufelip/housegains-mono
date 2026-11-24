# HouseGains Admin

Web app for the gamification rules engine (contract Part C10 in
[docs/implementation/gamification-moderation-contract.md](../../docs/implementation/gamification-moderation-contract.md)).
Vite + React 18 + TypeScript; every read and write goes through the `admin*`
Cloud Functions callables — the client never touches Firestore directly.

`src/api-types.ts` is the API contract: the backend implements exactly those
request/response shapes. `src/engine-types.ts` copies the engine's rule types
(`RuleSet`, `EarnRule`, …) from
`apps/firebase/functions/src/domain/gamification/types.ts` — no cross-package
import — and `src/engine-types.test.ts` fails if the copy drifts from the
source. Saving an earn rule writes it into a draft via `adminSaveDraft`;
publishing and rolling back always ask for confirmation.

## Setup

```bash
bash scripts/install-pinned-bun.sh        # from the repo root, if needed
bun install                               # repo root; apps/admin is a workspace
cp apps/admin/.env.example apps/admin/.env # fill in the Firebase web config
```

## Environment variables

| Variable | Meaning |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Firebase web app config (never commit real values). |
| `VITE_FIREBASE_AUTH_DOMAIN` | Usually `<project>.firebaseapp.com`. |
| `VITE_FIREBASE_PROJECT_ID` | The Firebase project id. |
| `VITE_FIREBASE_APP_ID` | The Firebase web app id. |
| `VITE_USE_EMULATORS` | `1` points Auth at `http://localhost:9099` and Functions at `localhost:5001` (the emulator ports from `apps/firebase/firebase.json`). |

## Run

```bash
cd apps/admin
bun run dev        # Vite dev server
bun run test       # Vitest
bun run typecheck  # tsc --noEmit
bun run build      # typecheck + production build into dist/
```

Sign-in is Google via Firebase Auth; the app only works for accounts whose ID
token carries the `admin: true` custom claim.

### Granting the admin claim

The callables (`apps/firebase/functions/src/admin-gamification/`) reject every
caller whose ID token has no `admin: true`. Grant it with the ops script, then
sign out and back in (the claim is read from a fresh ID token):

```bash
cd apps/firebase/functions
# real project: service-account key or application-default credentials
GOOGLE_APPLICATION_CREDENTIALS=/path/key.json node scripts/set-admin-claim.mjs <uid> --project <projectId>
node scripts/set-admin-claim.mjs <uid> --remove --project <projectId>   # revoke
```

Other custom claims on the user are kept. A large adjustment (|amount| > 500)
needs a *second* admin to approve it, so grant the claim to at least two people.

### Run against the emulators

```bash
cd apps/firebase
npx firebase-tools@14 emulators:start --only auth,firestore,functions --project demo-housegains
# second terminal: create a user in the Auth emulator UI (http://localhost:4000),
# then grant the claim against the emulator:
cd functions && npm run build
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-housegains \
  node scripts/set-admin-claim.mjs <uid>
# third terminal:
cd apps/admin && VITE_USE_EMULATORS=1 bun run dev
```

The backend tests for every callable are `apps/firebase/functions/test/emulator/admin-gamification.test.ts`
(run with `npm run test:emulator` under `firebase emulators:exec`).

## Deploy

`dist/` is served by Firebase Hosting on the second site, target `admin`
(`apps/firebase/firebase.json`, site links in `apps/firebase/.firebaserc`):

```bash
cd apps/firebase
firebase deploy --only hosting:admin
```

The admin Hosting sites must exist first (Firebase console → Hosting → Add site)
and their ids must match `.firebaserc`.
