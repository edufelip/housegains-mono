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
token carries the `admin: true` custom claim. Grant it with the Firebase Admin
SDK (`auth.setCustomUserClaims(uid, { admin: true })`).

## Deploy

`dist/` is served by Firebase Hosting on the second site, target `admin`
(`apps/firebase/firebase.json`, site links in `apps/firebase/.firebaserc`):

```bash
cd apps/firebase
firebase deploy --only hosting:admin
```

The admin Hosting sites must exist first (Firebase console → Hosting → Add site)
and their ids must match `.firebaserc`.
