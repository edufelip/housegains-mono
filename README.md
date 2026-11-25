# HouseGains

HouseGains is a household chores app with gym-style XP. Members create chores, share subtasks, and earn XP that is shown openly, so everyone can see who did what. It runs on iOS and Android (Expo / React Native) and uses Firebase for data, sign-in and server logic.

## Layout

- `apps/mobile`: the Expo SDK 54 / React Native app (Expo Router). See [apps/mobile/README.md](apps/mobile/README.md).
- `apps/admin`: the gamification admin web app (Vite + React + TypeScript). See [apps/admin/README.md](apps/admin/README.md).
- `apps/firebase`: Firestore rules and indexes, Cloud Functions (TypeScript, Node 22), and the hosting site in `hosting/public`.
- `docs`: product requirements, implementation contracts, store listing assets, and plans.

## Setup

You need Bun 1.3.14 (pinned in `.bun-version`), Node 22 and, for the emulators, Java 11 or newer.

1. Install the pinned Bun, if you do not already have it:

   ```bash
   bash scripts/install-pinned-bun.sh
   ```

2. Install all dependencies (root and `apps/mobile` with Bun, `apps/firebase/functions` with npm):

   ```bash
   bun run setup
   ```

## Run the mobile app

```bash
cp apps/mobile/.env.example apps/mobile/.env   # optional; fill in only what you need
bun run mobile:start
```

Open the app in Expo Go (SDK 54) or in a development build. For a native build, use `bun run mobile:ios` or `bun run mobile:android`. These need Xcode or the Android SDK.

## Run the Firebase emulators

```bash
bun run firebase:emulators
```

This starts Auth (port 9099), Firestore (8080) and Functions (5001). To point a debug app at them, set `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=1` in `apps/mobile/.env`.

## Run the tests

Mobile:

```bash
cd apps/mobile
bun x tsc --noEmit
bun run test:unit
bun run test:component
```

Firebase functions (unit tests and build):

```bash
cd apps/firebase/functions
npm ci
npm run build
npm test
```

Firebase emulator tests (needs Java):

```bash
cd apps/firebase
npx -y firebase-tools@14 emulators:exec --only auth,firestore,functions --project demo-housegains "cd functions && npm run test:emulator"
```

GitHub Actions (`.github/workflows/ci.yml`) runs the mobile, Firebase and admin checks on every pull request and on pushes to `main`.

## Admin app

`apps/admin` is the gamification rules engine admin (contract Part C10): rule-set drafts with a JSON diff, an earn-rule editor with a live toast preview, a
simulator, wallet ledger lookup with signed adjustments, alerts and maintenance. It is a
Vite + React + TypeScript workspace; sign-in is Firebase Auth (Google) and every write
goes through the `admin*` callables.

```bash
cp apps/admin/.env.example apps/admin/.env   # fill in the Firebase web config
cd apps/admin
bun run dev      # Vite dev server
bun run test     # Vitest
bun run build    # typecheck + production build
```

Firebase Hosting serves the built `dist/` on the second site, target `admin`
(`apps/firebase/firebase.json`; site links in `apps/firebase/.firebaserc`).

## Contributing

The native `ios/` and `android/` folders in `apps/mobile` are maintained by hand. Do not run `expo prebuild`.
