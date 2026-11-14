# Releasing the iOS app

The one path from a green `main` to a build in App Store Connect / TestFlight. Builds are local, no EAS
([ADR 0008](../decisions/0008-local-builds.md)). `scripts/release-ios.mjs` does everything up to the upload
and stops; the upload and the App Store Connect steps are below.

## 0. What ships first

The app, the Host plugin, the site and the relay ship separately. Old app builds stay installed, so the
plugin and the relay must keep working with them.

| Piece | Ships | When, relative to the app |
|---|---|---|
| Host plugin (`plugin` branch) | `git subtree split --prefix=packages/plugin -b plugin`, then `git push origin plugin` (never `--force`) | **Before** the app, whenever `packages/plugin` changed: the app recommends updating a Host whose plugin is older than the one it bundles, and that update installs from the branch. The script refuses to build while `origin/plugin` carries another version. |
| Site (`apps/site`) | `pnpm -C apps/site run deploy` | Right after the plugin: it serves `install.sh` with the plugin version. |
| Relay (`packages/relay`) | `node scripts/deploy.mjs` in `packages/relay` | Before the app, when the app relies on a relay change; it also serves the privacy policy the listing links. |

Check that each is out:

```sh
git fetch origin main plugin
git show origin/plugin:herdr-plugin.toml | grep '^version'      # = packages/plugin/herdr-plugin.toml
curl -fsSL https://openagentspocket.com/install.sh | grep -m1 PLUGIN_VERSION
curl -s -o /dev/null -w '%{http_code}\n' https://relay.openagentspocket.com/privacy   # 200
```

TestFlight and App Store builds use **production** APNs. Before the first one, check that the relay's APNs key
is enabled for production (Apple Developer › Keys: "Sandbox & Production" or "Production").

## 1. Once per machine

- Xcode › Settings › Accounts signed in with an Apple ID of your team (Admin, or App Manager with access to
  Certificates, Identifiers & Profiles). This is the path with no secret on disk: archive, export and upload
  all use it. `-allowProvisioningUpdates` lets Xcode create the distribution certificate, the App IDs
  (`com.openagentspocket.app`, `.notification-service`, `.widget`) with the App Group and push, and the App
  Store profiles.
- Without a sign-in, an App Store Connect Team API key (`.p8`, App Manager or Admin) instead: put it at
  `~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8` and export `ASC_API_KEY_PATH`, `ASC_API_KEY_ID`,
  `ASC_API_ISSUER_ID` in the release shell; the script passes them to `xcodebuild`. Letting Xcode create the
  distribution certificate through a key may need an Admin key.
- `apps/mobile/app.local.json` holds `{ "appleTeamId": "<your team id>" }` (gitignored), or `APPLE_TEAM_ID`.
- Over-the-air updates (optional, [updates guide](updates.md)): `"updatesUrl": "https://<update domain>/manifest"`
  in the same file, or `UPDATES_URL`, with the certificate committed at `apps/mobile/certs/updates.pem`.
  Without it the build has updates off; the run prints which.
- The app exists in App Store Connect (My Apps › + › New App, bundle id `com.openagentspocket.app`).

## 2. Preconditions and the bump

Version and build number live in `apps/mobile/app.json`: `expo.version` (X.Y.Z, the App Store version) and
`expo.ios.buildNumber` (one integer; also `android.versionCode`). Every upload needs a build number App Store
Connect has not seen, so raise it every time; raise the version after a version has been released.

```sh
git switch main && git pull --ff-only
# edit apps/mobile/app.json: expo.version, expo.ios.buildNumber
pnpm verify-fast
git commit -am "Release 1.0.0 (2)"
git push origin main                                            # the archived commit must be on origin
```

The script then refuses unless: on `main`, clean, level with `origin/main`, version X.Y.Z, build an integer,
no stray `BUILD_NUMBER` in the shell, a team id set, and `origin/plugin` at the bundled plugin version.

## 3. Build and check

```sh
node scripts/release-ios.mjs --dry-run      # preconditions and every command, nothing runs
node scripts/release-ios.mjs                # add --skip-tests if pnpm test already passed on this commit
```

It runs, with `APNS_ENVIRONMENT=production BUILD_NUMBER=<app.json>` in the same environment for every step
(prebuild writes the entitlement, the build phases embed the config the app reads to tag its push token):

1. `pnpm test`: the milestone gate.
2. `CI=1 npx expo prebuild --clean --platform ios --no-install` in `apps/mobile`: fresh `ios/` for this build.
3. `pod install` in `apps/mobile/ios`.
4. `xcodebuild -workspace apps/mobile/ios/AgentsPocket.xcworkspace -scheme AgentsPocket -configuration Release
   -destination generic/platform=iOS -archivePath build/release/ios-V-B/AgentsPocket.xcarchive
   -allowProvisioningUpdates archive`.
5. `xcodebuild -exportArchive ... -exportOptionsPlist build/release/ios-V-B/ExportOptions.plist`: signs for
   App Store Connect and writes `export/AgentsPocket.ipa`, no upload.
6. The pre-upload checks below. Any failure stops with "do not upload".

`build/release/ios-V-B/ExportOptions.plist` (written by the script):

```xml
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>          <!-- ExportOptions-upload.plist: upload -->
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>        <!-- the build number is app.json's -->
</dict>
```

### The checks

Re-run them alone on any IPA: `node scripts/release-ios.mjs check <ipa> --archive <xcarchive>`.

| Check | Why |
|---|---|
| `codesign --verify --deep --strict` on the app | the signature is whole |
| app `aps-environment` = `production`; an extension that has the key, too | pushes and Live Activities reach the production APNs host |
| no `get-task-allow` in the app or an extension | signed for distribution, not development |
| `application-identifier` ends in the bundle's id; App Group in every bundle | the extensions share keys with the app |
| version and build equal in the app and both extensions (`widgets.appex`, `notification-service.appex`) | App Store Connect rejects a mismatch |
| `EXConstants.bundle/app.config`: `aps-environment` production, build number | the app tags its push token with this value |
| every purpose string (keys of `apps/mobile/locales/es.json`) in `Info.plist` and `es.lproj` | App Review rejects a missing one |
| no `ITSAppUsesNonExemptEncryption` in `Info.plist` | the encryption answer is given per build in App Store Connect |
| a dSYM per bundle in the archive | crash symbolication |
| `EXUpdates.bundle/fingerprint` equals the runtime version this commit computes | updates are published for the recorded runtime; a different one would reach no device |
| `Expo.plist`: updates disabled without `UPDATES_URL`; with it, enabled, that URL, a code signing certificate, key id `main` / `rsa-v1_5-sha256`, runtime `file:fingerprint` | an official build never accepts unsigned updates, and a build from source never asks for any |

By hand, on the exported IPA:

```sh
R=build/release/ios-1.0.0-2
mkdir -p /tmp/ipa && ditto -x -k $R/export/AgentsPocket.ipa /tmp/ipa && A=/tmp/ipa/Payload/AgentsPocket.app
for b in $A $A/PlugIns/*.appex; do
  /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' -c 'Print :CFBundleShortVersionString' -c 'Print :CFBundleVersion' $b/Info.plist
  codesign -d --entitlements - --xml $b 2>/dev/null | plutil -p -
done
plutil -p $A/Info.plist | grep UsageDescription
cat $A/EXUpdates.bundle/fingerprint; plutil -p $A/Expo.plist | grep -v CERTIFICATE
ls $R/AgentsPocket.xcarchive/dSYMs
```

## 4. Upload

Pick the one that matches your credentials. Both send the IPA the checks passed, signed the same way.

```sh
R=build/release/ios-1.0.0-2
# Xcode sign-in (no secret on disk): export again, this time to Apple.
xcodebuild -exportArchive -archivePath $R/AgentsPocket.xcarchive -exportPath $R/upload \
  -exportOptionsPlist $R/ExportOptions-upload.plist -allowProvisioningUpdates

# API key: validate, then upload the checked IPA itself.
xcrun altool --validate-app $R/export/AgentsPocket.ipa --api-key "$ASC_API_KEY_ID" --api-issuer "$ASC_API_ISSUER_ID"
xcrun altool --upload-package $R/export/AgentsPocket.ipa --api-key "$ASC_API_KEY_ID" --api-issuer "$ASC_API_ISSUER_ID"
```

(`altool` 27 spells them `--api-key` / `--api-issuer`; it finds `AuthKey_<id>.p8` in
`~/.appstoreconnect/private_keys`.) Xcode Organizer (`open $R/AgentsPocket.xcarchive`, Distribute App) is the
manual fallback.

Then tag the archived commit: `git tag -a ios-1.0.0-2 -m "iOS 1.0.0 (2)" && git push origin ios-1.0.0-2`.

## 5. Keep the archive

`build/release/ios-V-B/` holds the archive, its dSYMs and the IPA. `build/` is gitignored and survives
`prebuild --clean`, but not `git clean -fdx`: copy the folder somewhere backed up. `uploadSymbols` also sends
the symbols to Apple, so crash reports in App Store Connect and Xcode Organizer arrive symbolicated.

A finished run also appends the build and its runtime version (the fingerprint) to
`docs/releases/builds.json`. Commit it after the upload: over-the-air updates are only published for a
runtime version recorded there ([updates guide](updates.md)).

## 6. In App Store Connect

1. **TestFlight processing**: the build shows as Processing, then Ready (an email arrives). Minutes to an hour.
2. **Export compliance** (the build shows "Missing Compliance"): the owner declares it per build. The app links
   libssh2 with OpenSSL, so the answer is standard encryption algorithms, not the ones the operating system
   provides; the app is not distributed in France, so no French declaration. No `Info.plist` key is set.
3. **TestFlight**: What to Test, internal testers; external testers need Beta App Review (the same review notes).
4. **App Store version page**: select the build, then the fields that live only in App Store Connect:
   - name, subtitle, category, age rating questionnaire
   - description, keywords, promotional text, support URL, marketing URL (optional)
   - privacy policy URL: `https://relay.openagentspocket.com/privacy`
   - App Privacy (data collection) answers
   - screenshots: iPhone only (`TARGETED_DEVICE_FAMILY` is iPhone; no iPad screenshots)
   - price, availability (France excluded), copyright, EU trader status
   - App Review contact, "sign-in required" off, review notes (below)
   - release: manual or automatic, phased release on or off

### Review notes (draft; check it against the build)

> Agents Pocket is a client for a computer the user owns (their "Host"), reached over SSH. There is no account
> and no sign-in. Because a reviewer has no Host, the app includes a demo mode with built-in sample data:
>
> 1. On first launch, Home shows no Hosts. Tap **Try the Demo**.
> 2. Demo mode can also be switched on or off in **Settings › General › Demo Mode**.
>
> In demo mode you can browse Agents, Chat, Terminals and the other screens. Pairing a real Host (by scanning
> its Pairing Code with the camera), notifications and Live Activities need the user's own computer.
>
> Permissions: camera only to scan a Pairing Code; microphone and speech recognition only for dictation;
> Face ID to unlock the app; local network to reach a Host on the same network.

## 7. Back to development

The release left `ios/` with the production entitlement, which a development-signed device install cannot use.

```sh
cd apps/mobile
CI=1 npx expo prebuild --clean --platform ios --no-install && (cd ios && pod install)
```

Run it in a shell without `APNS_ENVIRONMENT` / `BUILD_NUMBER`. If you put `"apnsEnvironment": "production"` in
`app.local.json` (the Xcode-from-the-Dock route in ADR 0008), remove it first.

## 8. Rollback

- **Rejected or broken before release**: fix on `main`, raise `expo.ios.buildNumber` (the version can stay
  until it is released), commit, push, and repeat from step 3. A build number is never reused.
- **Broken build in TestFlight**: TestFlight › the build › Expire Build, then ship the next build as above.
- **Broken on the App Store**: there is no binary rollback. Pause the phased release if one is running, then
  ship a fix as a new version (raise `expo.version` and the build number) and request an expedited review.
