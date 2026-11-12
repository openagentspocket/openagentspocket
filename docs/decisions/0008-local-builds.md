# 0008. Local native builds; EAS only for store submission

Status: accepted (2026-11-01)

## Decision

`expo run:ios` / `expo run:android` locally. EAS is used only to submit to the stores.

## Why

No cloud account needed to develop; faster feedback.

## Build values from the environment

`apps/mobile/app.config.js` reads two variables. Set them in the same shell for `expo prebuild` and for
the native build: prebuild writes the entitlement and the build number into `ios/` and `android/`, and the
native build embeds the resolved config the app reads at runtime (`Constants.expoConfig`).

| Variable | Default | Store build |
|---|---|---|
| `APNS_ENVIRONMENT` | `development` | `production` |
| `BUILD_NUMBER` | `ios.buildNumber` in `app.json` | the next number, higher than any upload |

- `APNS_ENVIRONMENT` sets the `aps-environment` entitlement and must match the provisioning profile:
  `development` for device installs signed with a development profile, `production` for App Store and
  TestFlight. The app reads the same value to tag its push token as sandbox or production, so a mismatch
  sends pushes and Live Activity updates to the wrong APNs host. Any other value fails the config.
- `APNS_ENVIRONMENT` can also live in the gitignored `apps/mobile/app.local.json` as
  `"apnsEnvironment": "production"`; the variable wins over the file. Use the file when the archive is
  made from Xcode opened from the Dock, which does not see shell variables: without it the build phase
  that embeds the config would say `development` while the entitlement says `production`.
  Remove it after the release, or development-profile installs fail to sign.
- `BUILD_NUMBER` becomes `ios.buildNumber` and `android.versionCode` (one integer, 1 to 2100000000). Each
  store rejects an upload whose number it has seen. Either pass it, or bump `ios.buildNumber` in `app.json`
  in the release commit so the next prebuild repeats it.

```sh
cd apps/mobile
export APNS_ENVIRONMENT=production BUILD_NUMBER=2
npx expo prebuild --clean
# then archive from this shell (xcodebuild archive), or from Xcode with app.local.json set as above
```
