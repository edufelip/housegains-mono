# HouseGains TestFlight setup — 2026-11-15

- App Store Connect app: [HouseGains](https://appstoreconnect.apple.com/apps/6835092605/distribution), Apple ID `6835092605`.
- Bundle ID `com.housegains.app` was already registered and was selected from Apple's New App form. App created with English (U.S.) primary language, SKU `housegains`, and full existing-team access.
- Dedicated `HouseGains CI Signing` team API key uses the Admin role required by Apple cloud-managed distribution signing. The initial App Manager key authenticated successfully but could not cloud-sign the export; it was replaced and revoked. The private key is backed up outside the repository with restricted permissions and transferred directly into GitHub secrets. No key contents are committed or included in logs.
- GitHub secret names: `APP_STORE_CONNECT_API_KEY_CONTENT`, `APP_STORE_CONNECT_API_KEY_ID`, `APP_STORE_CONNECT_API_KEY_ISSUER_ID`.
- The manual `iOS TestFlight` workflow archives the production bundle, requests automatic signing, checks the archived version, then uploads to App Store Connect.

## Build-number correction

The native Info.plist previously hardcoded `CFBundleVersion` to `1`, so passing `CURRENT_PROJECT_VERSION` on the Xcode command line did not update the app's reported build number. Info.plist now expands that setting. The TestFlight workflow uses its run number and verifies the actual archive matches before upload. The configuration regression reproduced the old value and now passes (4 configuration tests); plist syntax and workflow YAML also pass.

App creation and credentials are verified. Native archive, upload, Apple processing and internal tester access are separate checks and must be confirmed from the workflow and TestFlight; setup alone does not prove availability. This setup does not submit the app for public App Store review.

## First upload progress

- [Workflow run 43717597989](https://github.com/edufelip/housegains-mono/actions/runs/43717597989) builds commit `1969360e3715af5d88c9aa10f76813d909d998b2` from `main`.
- Internal group [HouseGains Internal](https://appstoreconnect.apple.com/teams/0d799229-0506-4860-92fb-2ecd19fb5233/apps/6835092605/testflight/groups/99f69477-aa95-4c18-b630-12241d8e5e01) exists with automatic distribution enabled and the owner account added as its only tester.
- Attempt 1: archive and archived build-number check succeeded. Export failed with `Cloud signing permission error`, `No signing certificate "iOS Distribution" found`, and no App Store profile. Apple [documents Account Holder/Admin access](https://developer.apple.com/help/account/certificates/cloud-managed-certificates/) for the cloud-managed signing path. The initial App Manager key could read app/certificate metadata but did not authorize that export.
- Attempt 2 uses the replacement Admin signing key and rebuilds on a fresh GitHub runner. No existing distribution certificates were revoked or replaced. Availability remains unconfirmed while the retry runs.
