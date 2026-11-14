# HouseGains mobile

The HouseGains app for iOS and Android, built with Expo SDK 54, React Native 0.81 and Expo Router. Routes live in `housegains-app/`.

## Setup

Run from the repo root:

```bash
bun run setup
```

Optional: copy `.env.example` to `.env` and fill in only the values you need. Every value is optional.

## Scripts

Run these from `apps/mobile`:

| Script | What it does |
| --- | --- |
| `bun run start` | Start the Expo dev server (Metro) |
| `bun run ios:dev` / `bun run android:dev` | Build and run the dev app (`HouseGains Dev`) |
| `bun run ios:prod` / `bun run android:prod` | Build and run the production variant locally |
| `bun run web` | Start the web preview |
| `bun run web:export` | Export the web build to `dist/web` |
| `bun run typecheck` | TypeScript check (`tsc --noEmit`) |
| `bun run lint` | ESLint |
| `bun run lint:ci` | oxlint, as used in CI |
| `bun run format` / `bun run format:check` | Prettier write / check |
| `bun run test:unit` | Unit tests (`bun test`) |
| `bun run test:component` | Component tests (Jest) |
| `bun run test:all` | Unit and component tests |

Native builds (`ios:*`, `android:*`) need Xcode or the Android SDK. The `ios/` and `android/` folders are maintained by hand; do not run `expo prebuild`.

## Environment

Variables are read in `app.config.ts` and `features/`. See `.env.example` for the full list:

- `APP_VARIANT`: `dev` (default) or `prod`
- `EXPO_PUBLIC_USE_FIREBASE_EMULATORS`: set to `1` to use the local Firebase emulators in debug builds
- `EXPO_PUBLIC_GOOGLE_OAUTH_*_CLIENT_ID` and `EXPO_PUBLIC_APPLE_WEB_*`: sign-in client IDs (public values)
- `EXPO_PUBLIC_TERMS_*` and `EXPO_PUBLIC_PRIVACY_POLICY_URL`: terms and privacy links
