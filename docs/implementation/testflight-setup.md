# HouseGains TestFlight setup — 2026-11-15

- App Store Connect app: [HouseGains](https://appstoreconnect.apple.com/apps/6835092605/distribution), Apple ID `6835092605`.
- Bundle ID `com.housegains.app` was already registered and was selected from Apple's New App form. App created with English (U.S.) primary language, SKU `housegains`, and full existing-team access.
- Dedicated `HouseGains CI` team API key uses the App Manager role. The private key is backed up outside the repository with restricted permissions and transferred directly into GitHub secrets. No key contents are committed or included in logs.
- GitHub secret names: `APP_STORE_CONNECT_API_KEY_CONTENT`, `APP_STORE_CONNECT_API_KEY_ID`, `APP_STORE_CONNECT_API_KEY_ISSUER_ID`.
- The manual `iOS TestFlight` workflow archives the production bundle, requests automatic signing, checks the archived version, then uploads to App Store Connect.

## Build-number correction

The native Info.plist previously hardcoded `CFBundleVersion` to `1`, so passing `CURRENT_PROJECT_VERSION` on the Xcode command line did not update the app's reported build number. Info.plist now expands that setting. The TestFlight workflow uses its run number and verifies the actual archive matches before upload. The configuration regression reproduced the old value and now passes (4 configuration tests); plist syntax and workflow YAML also pass.

App creation and credentials are verified. Native archive, upload, Apple processing and internal tester access are separate checks and must be confirmed from the workflow and TestFlight; setup alone does not prove availability. This setup does not submit the app for public App Store review.
