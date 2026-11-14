# 0028. Over-the-air JS updates: expo-updates, a signed static server on our Cloudflare account

Status: accepted (2026-11-14). Researched 2026-11-13; the owner decided the open points on 2026-11-14
(section "Decided"). Built: the update server (`packages/updates-server`), the publish script
(`scripts/publish-update.mjs`) with the real R2 upload, the Worker's deploy script, and the app side;
how to use them is in the [updates guide](../guides/updates.md). Not yet: a key, a deployment, a store
build with `expo-updates`; the R2 upload and the deploy have not run against a real account.

## Context

The owner wants small changes (copy, layout, Chat, menus) to reach users without an App Store review. Microsoft
retired App Center, CodePush included, on 2025-03-31 ([Expo blog](https://expo.dev/blog/what-to-do-without-codepush)).
The app builds locally without EAS ([0008](./0008-local-builds.md)), ships through `scripts/release-ios.mjs`
([release guide](../guides/release.md)), is MIT and public, keeps SSH private keys in the Keychain, and tells users and
App Review that nothing of ours sits between the phone and their computer ([listing](../store/listing.md),
`packages/relay/src/privacy.js`).

Today nothing in `apps/mobile` (app.json, app.config.js, package.json) mentions `expo-updates`.

The core fact behind every section below: **whoever can publish an update runs JavaScript, with the app's full
privileges, on every phone that accepts it.** That JavaScript can read the Keychain through `expo-secure-store` and
open SSH sessions to every paired Host. An update channel is a remote code path into users' computers, so it is
designed as one.

Sources were read on 2026-11-13, and the expo-updates SDK 58 source again on 2026-11-14 while building
plan steps 2 and 3 (marked "settled 2026-11-14"). "Not verified" means the documentation or the code we
read does not answer it.

## 1. Options

| Option | Cost | Operations | Third party between us and users |
|---|---|---|---|
| **EAS Update** (now "Expo Update") | Free: 1,000 MAU, hard cap, no code signing. Starter $19/mo + usage, no code signing. **Production $199/mo** (50,000 MAU, 1 TiB) is the cheapest plan with end-to-end code signing ([pricing](https://expo.dev/pricing), [code signing](https://docs.expo.dev/eas-update/code-signing/): "only available to accounts subscribed to the Production or Enterprise plans") | None; dashboard, channels, rollouts, republish | Expo serves the code. With signing, Expo cannot alter it, but it sees every update check |
| **Self-hosted, Expo Updates protocol, on our Cloudflare account** | Workers Free: 100,000 requests/day; Paid $5/mo for 10 M ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)). R2: 10 GB-month and 10 M reads free, no egress fees ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)). Likely $0 at our size | We write and keep a small Worker and a publish script. Expo's example server is "not guaranteed to be complete, stable, or performant enough for production" and unsupported ([repo](https://github.com/expo/custom-expo-updates-server)) | Cloudflare, already our processor for the relay. No new company |
| **CodePush-compatible service** (Revopush, Stallion, Codemagic; self-hostable hot-updater, MIT with an attribution clause, R2 + D1 storage) ([Revopush](https://revopush.org/react-native-codepush-alternative), [hot-updater](https://github.com/gronxb/hot-updater)) | Vendor pricing (not compared) | A second update stack beside Expo's; hot-updater's signing is "an adapter slot" with no details | A new vendor (hosted) or a new codebase to trust (hot-updater). Signing guarantees not verified |
| **Don't** | $0 | Every change is a store release; expedited review for emergencies ([release guide §8](../guides/release.md)) | None |

Recommendation: **self-hosted on Cloudflare**, using `expo-updates` (the Expo-native client, already a sibling of
every module we ship) with our own signing. EAS Update is the fallback if we ever do not want to own the Worker,
and only on a plan with signing. A CodePush-compatible service is rejected: a second stack, weaker documented
signing, and either a new vendor or a new codebase.

## 2. Does `expo-updates` fit this project

What the docs say ([SDK 58 Updates](https://docs.expo.dev/versions/v58.0.0/sdk/updates/),
[app config](https://docs.expo.dev/versions/v58.0.0/config/app/)):

- **CNG / prebuild:** the `updates` fields in app config are written into `Expo.plist` and `AndroidManifest.xml` by
  prebuild; projects without CNG set them in those files by hand. We use CNG, so app config is enough.
- **Release builds only.** Debug builds load JS from Metro; most of the API rejects in development builds. A local
  Xcode Release build (what `release-ios.mjs` makes) embeds the bundle and runs `expo-updates`.
- **New Architecture, Hermes, RN 0.88:** the SDK 58 page states no restriction; not verified on a device.
- **Hermes bytecode:** `npx expo export` emits Hermes bytecode by default; `--no-bytecode` exists but "never ship UTF-8
  bundles to native platforms" ([Expo CLI](https://docs.expo.dev/more/expo-cli/)). Bytecode is tied to the Hermes
  version in the binary, which the runtime version (section 4) must capture.
- **It is a native module.** The first build that contains it is a full store release (integrator builds it; agents
  never run native builds).

Fields, with the recommended value:

| Field | Value | Why |
|---|---|---|
| `updates.url` | the manifest endpoint on our domain, injected by `app.config.js` only for official builds | Forks get no update URL (section 8) |
| `runtimeVersion` | `{ "policy": "fingerprint" }` | Section 4 |
| `updates.codeSigningCertificate` | `./certs/updates.pem` (public, committed) | Section 3 |
| `updates.codeSigningMetadata` | `{ "keyid": "main", "alg": "rsa-v1_5-sha256" }` | The only listed `alg` |
| `updates.checkAutomatically` | `ON_LOAD` (default) | Check on each launch |
| `updates.fallbackToCacheTimeout` | `0` (default; range 0 to 300000) | Never block launch on the network; the update applies on the next cold start |
| `updates.requestHeaders` | none | Baked at build time; TestFlight and App Store share one binary, so it cannot carry a channel (section 5) |
| `updates.disableAntiBrickingMeasures` | `false` (default) | `true` is only needed to change the URL at runtime, which we do not want |
| `updates.useEmbeddedUpdate`, `maxUpdatesToKeep` | defaults (`true`, `2`) | |

The release script gains a separate command (sketch in section 9): export, build and sign the manifest, upload.
`npx expo export --platform ios` writes `dist/` with the bundle, the assets and a `metadata.json` listing them per
platform; Expo's docs do not describe `metadata.json`, the example server reads it
([manifest.ts](https://github.com/expo/custom-expo-updates-server/blob/main/expo-updates-server/pages/api/manifest.ts)).
Settled 2026-11-14 from `@expo/cli` `src/export/createMetadataJson.ts` and a real export of this app:
`{ version: 0, bundler: "metro", fileMetadata: { ios: { bundle: "_expo/static/js/ios/entry-<hash>.hbc",
assets: [{ path: "assets/<md5>", ext: "png" }] } } }`; each asset file is named by its MD5.
The manifest ([protocol v1](https://docs.expo.dev/technical-specs/expo-updates-1/)) is JSON: `id` (UUID),
`createdAt` (ISO 8601), `runtimeVersion`, `launchAsset`, `assets[]` each with `key`, `contentType`, `url` and `hash`
(base64url SHA-256), `metadata`, `extra`. The server answers `multipart/mixed` with a `manifest` part and, when
asked, an `expo-signature` part header.

Settled 2026-11-14 from the iOS client (`ExpoUpdatesUpdate.swift`, expo-manifests `ExpoUpdatesManifest.swift`):
`fileExtension` is **required** for every asset except the launch asset (the spec says optional); asset
URLs may be relative to `updates.url` on iOS (we use absolute ones, which every client reads); and an
update's `Constants.expoConfig` is the manifest's `extra.expoClient`, so the publish script puts the
public Expo config there (the app reads the APNs environment from it).

## 3. Security model

### Signing

- **Algorithm:** RSASSA-PKCS1-v1_5 with SHA-256 over the exact bytes of the manifest (or directive) part. The iOS
  client says "For now only SHA256withRSA is supported" and hashes the part body it received
  ([CodeSigningConfiguration.swift](https://github.com/expo/expo/blob/sdk-58/packages/expo-updates/ios/EXUpdates/CodeSigning/CodeSigningConfiguration.swift),
  [FileDownloader.swift](https://github.com/expo/expo/blob/sdk-58/packages/expo-updates/ios/EXUpdates/AppLoader/FileDownloader.swift)).
  Keys come from `npx expo-updates codesigning:generate`, which makes an RSA key pair and a self-signed certificate
  ([code signing guide](https://docs.expo.dev/eas-update/code-signing/)). Key size settled 2026-11-14: RSA 2048,
  node-forge's default (`@expo/code-signing-certificates` calls `pki.rsa.generateKeyPair()` with no size), with
  the code signing extended key usage.
- **Assets are covered.** The signed manifest carries each asset's SHA-256, and the client "MUST verify" it
  ([spec](https://docs.expo.dev/technical-specs/expo-updates-1/)): "Code signing the manifest also transitively
  signs the assets."
- **Directives are covered.** With signing configured, the iOS client verifies directive parts too
  (`rollBackToEmbedded`, `noUpdateAvailable`) and rejects the whole response on a bad one (FileDownloader.swift).
- **Missing or bad signature:** a missing `expo-signature` throws `SignatureHeaderMissing` unless
  `allowUnsignedManifests` is set (it is not by default); an invalid one fails the download and nothing is applied.
  The app keeps running what it has. Read in the iOS source. Settled in source 2026-11-14 for Android
  (`CodeSigningConfiguration.kt`, `FileDownloader.kt`): a missing signature throws "No expo-signature header
  specified" unless `allowUnsignedManifests`, an invalid one throws "Incorrect signature", the same for
  directives. **Not verified on an Android device**, so Android stays off (Decided).
- **The key never touches the server or CI.** Expo's example server signs per request with `PRIVATE_KEY_PATH` on
  the server (helpers.ts in the example repo). **We do not copy that.** Our manifest is static per update, so the
  publish script signs it once on the owner's machine and uploads manifest bytes and signature together; the
  Worker serves them verbatim and holds no secret. For "nothing new", the Worker serves the current manifest anyway
  (the client ignores an update whose `createdAt` is not newer, below) or a `204` (a no-op in the spec).
  Settled 2026-11-14: both clients accept a `204` with no body and no signature when the response carries
  `expo-protocol-version` above 0, before any signature check (`FileDownloader.swift` / `.kt`). The Worker
  answers `204` with the protocol headers. Any directive we use is pre-signed the same way.
- **Where the key lives:** an encrypted PEM in the owner's password manager, decrypted into a temporary file only
  for a publish, then deleted. Signing from a hardware token is possible in principle (plain RSA PKCS#1 v1.5), not
  verified with Expo's tooling. Never in the repo, CI, the Worker, Cloudflare secrets or a backup that syncs in clear.

### What the client checks

1. TLS to the update URL (iOS App Transport Security requires HTTPS by default). Certificate pinning: not offered by
   `expo-updates`, not verified.
2. The manifest signature against the certificate embedded in the binary (`keyid` must match).
3. `runtimeVersion` equals the binary's.
4. **Downgrade:** a new update loads only if its `createdAt`/commit time is strictly newer than the running one's;
   equal or older is ignored. A `rollBackToEmbedded` directive is gated the same way by its own `commitTime`
   ([LoaderSelectionPolicyFilterAware.swift](https://github.com/expo/expo/blob/sdk-58/packages/expo-updates/ios/EXUpdates/SelectionPolicy/LoaderSelectionPolicyFilterAware.swift)).
   Since `createdAt` is inside the signed bytes, a server cannot forge it.
5. Each asset's hash before use.

### What a compromised server (or Cloudflare account) can and cannot do

- **Cannot** publish new code, alter an update, or downgrade a device below what it runs.
- **Can** withhold updates (freeze users on what they have), and **replay** an older signed update that is still
  newer than what a given device runs (for example a superseded, buggy one). Signatures do not expire per update and
  cannot be revoked; keep superseded updates harmless, and use a new runtime version (store release) to cut off a bad one.
- **Can** serve any signed update to any channel (the channel is server-side routing, not inside the
  signed bytes), within the same "newer than what the device runs" bound.
- **Cannot** use `expo-manifest-filters` to get around the downgrade check, as long as manifests carry no
  `metadata`. Found 2026-11-14 (`LoaderSelectionPolicyFilterAware.swift`): when the update a device runs
  fails the server's filters, the client loads a new update **whatever its createdAt**. A filter only
  excludes an update whose metadata has the filtered key with another value, so the publish script keeps
  `metadata` empty, `verify` rejects a non-empty one, and the Worker never sends filters.
- **Can** read what the client sends (section 7).

### Rotation, loss, leak

- **Certificate expiry:** "Binaries with expired certificates won't apply new updates"; already downloaded updates
  keep working. Validity is set at generation (Expo uses 1 to 20 years).
- **Rotation** ([guide](https://docs.expo.dev/eas-update/code-signing/)): back up, generate a new pair (new `keyid`),
  ship it in a store release with a new runtime version, sign later updates with the new key. Old binaries keep
  trusting the old certificate.
- **Lost key:** existing binaries can never receive another update; the next store release carries a new certificate.
  Nothing breaks for users.
- **Leaked key:** the leak alone is not enough; the attacker also needs to serve the update (our Worker or Cloudflare
  account, or the domain). Leak plus server is full compromise of every binary that trusts that certificate, **until
  it expires or users update the app; there is no revocation**. Response: take the endpoint down (answer nothing),
  rotate in an expedited store release, disclose. This is why the validity should not be 20 years.
- `expo-updates` can also verify a certificate chain sent with the response (`includeManifestResponseCertificateChain`
  in the client), which would allow an offline root with rotating leaves. It is not in the documented app config:
  not verified as supported for our builds; not planned.

### Residual risk, compared with a store release

Remaining: the holder of the signing key, and the machine it is used on. A compromised developer machine at publish
time can sign malicious code; so can the person with the key. A normal App Store release has the same root (the
same machine builds and signs the binary) plus two extra gates: Apple's review and the delay it adds, and Apple's
ability to pull a build. An OTA update removes both gates and reaches users within one launch. Mitigations: publish
only from a clean `main` commit that passed `pnpm test`, print the diff since the last update and the manifest hash
before signing, and keep a public log of published update ids next to their commit (the repo is public, so anyone
can rebuild an update and compare hashes).

## 4. Runtime version

| Policy | Risk | Fit |
|---|---|---|
| `appVersion` | Two builds with the same `version` but different native code (1.0.1 (2) and 1.0.1 (3) is how we already release) share a runtime: an update for one can crash the other | No |
| manual string | Correct only if someone remembers to bump it on every native change | No |
| `fingerprint` | Makes mismatches "extremely unlikely", at the cost of more builds ([runtime versions](https://docs.expo.dev/eas-update/runtime-versions/)) | **Yes** |

The fingerprint hashes "app dependencies, custom native code, native project files, and configuration"
([Fingerprint](https://docs.expo.dev/versions/v58.0.0/sdk/fingerprint/)): dependency name@version, native modules,
the Expo config (so every config plugin's output, including `./plugins/withLocalPreview`), with `fingerprint.config.js`
and `.fingerprintignore` to tune it. Two gaps for us:

- **`patches/expo-libghostty@0.8.1.patch`** (a pnpm patch). Settled 2026-11-14 with `@expo/fingerprint` 0.21.8
  on this repo: the fingerprint hashes a `patches/` folder only inside the project root (`apps/mobile`, the
  patch-package convention, `sourcer/PatchPackage.ts`); ours is at the repository root and the patched
  package keeps its name@version, so **a patch change does not change the runtime**. With
  `extraSources: [{ type: 'dir', filePath: '../../patches' }]` in `apps/mobile/fingerprint.config.js` the folder
  is hashed (checked: the source appears and the hash changes). Config in the updates guide.
- The fingerprint hashes the resolved config, so it depends on the build environment: measured 2026-11-14,
  `APNS_ENVIRONMENT` (the `aps-environment` entitlement) changes it, `BUILD_NUMBER` does not. The scripts
  compute it with `APNS_ENVIRONMENT=production`, as store builds are made (`scripts/lib/runtime-version.mjs`).
- Anonymous config plugins are identified as `withAnonymous`, so editing their body may not change the hash; keep
  local plugins named.

Guard rail (built 2026-11-14): `release-ios.mjs` records each archived build and its fingerprint in
`docs/releases/builds.json` (and, once expo-updates is in, refuses a build whose embedded
`EXUpdates.bundle/fingerprint` differs); the publish command recomputes it and refuses to publish an
update whose runtime matches no released build.

## 5. Rollout

- **Channels.** The protocol has no channel concept; `expo-channel-name` is an EAS header, not in the spec. A TestFlight
  build is promoted to the App Store unchanged, so a channel cannot be baked into the binary. Option: the app sets
  `Updates.setExtraParamAsync('channel', 'beta')` (sent as `Expo-Extra-Params`) when it detects a TestFlight install
  (detection method not verified) or from a hidden setting; the Worker serves "beta" updates only to that value.
  Built 2026-11-14 on the server side: the channel is the `channel` key of `Expo-Extra-Params` (an SFV
  dictionary of strings, `FileDownloader.swift`), `beta` or `production`, absent meaning `production`; storage
  is keyed by (platform, runtime version, channel). The same signed bundle is uploaded to `beta`, then to
  `production`. Channels do not use manifest filters (section 3). The app picks its channel from an "Early
  Updates" setting, off by default (built 2026-11-14, updates guide).
- **Staged percentage:** not in the protocol. The Worker could bucket by a hash of `EAS-Client-ID` computed per
  request and never stored. Not needed at our size; start with beta then everyone.
- **Rollback:** prefer re-publishing the last good commit as a new signed update (newer `createdAt`, so every device
  takes it). The `rollBackToEmbedded` directive (signed, with a `commitTime` newer than the bad update) is the other
  tool; Expo warns an older bundle may not read state a newer one wrote ([error recovery](https://docs.expo.dev/eas-update/error-recovery/)).
- **Crash on launch:** if a new update throws a fatal JS error before its first render is reported, it is marked
  failed on that device, the client checks for a newer update for 5 s, and otherwise rolls back to the last update
  that launched. An error more than 10 s after first render is not caught. Native crashes are not covered (not
  verified). So: test the exact update on TestFlight first; keep the Chat and Home free of launch-time JS that a
  bad update could break.
- **UX:** download in the background, apply on the next cold start, show nothing. No forced reload: a reload would
  drop live SSH sessions. A "What's new" line can come later.

## 6. Store rules

- Apple, Developer Program License Agreement §3.3.1(B): "Interpreted code may be downloaded to an Application but
  only so long as such code: (a) does not change the primary purpose of the Application ... (b) does not bypass
  signing, sandbox, or other security features of the OS; and (c) ... does not create a store or storefront"
  ([DPLA](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/)).
- Apple, Review Guideline 2.5.2: apps may not "download, install, or execute code which introduces or changes
  features or functionality of the app"; 2.3.1(a): new features must be described for review; 2.5.19: no hidden or
  dormant features ([guidelines](https://developer.apple.com/app-store/review/guidelines/)). Read together: bug fixes
  and refinements of reviewed features are the accepted use; new features go through review. Whether Apple treats
  Hermes bytecode as "interpreted code" is not stated anywhere we found: not verified (it is what EAS Update ships).
- Google Play: apps "may not modify, replace, or update itself using any method other than Google Play's update
  mechanism" and may not download dex, JAR or .so, but "This restriction does not apply to code that runs in a
  virtual machine or an interpreter" ([Device and Network Abuse](https://support.google.com/googleplay/android-developer/answer/9888379)).

**Rule of thumb for this project.** OTA is for fixing and polishing what App Review has seen: copy and translations,
layout and spacing, Chat rendering, menus, program parsers and Blocked detection, crash fixes. A store release is
required for: anything native (impossible over the air anyway), new screens or features, new permissions or data
flows, anything touching keys, pairing, the relay or what leaves the device, and anything the listing would need to
describe. No server-side switches that turn on unreviewed features.

## 7. Privacy

What every update check sends (iOS source, FileDownloader.swift): the IP address; `Expo-Platform`,
`Expo-Runtime-Version`, `Expo-Protocol-Version`, `Expo-API-Version`, `Expo-Updates-Environment`; `Expo-Current-Update-ID`
and `Expo-Embedded-Update-ID`; `Expo-Recent-Failed-Update-IDs`; **`EAS-Client-ID`, a random per-install UUID**;
**`Expo-Fatal-Error`, the text of the last fatal JS error (up to 1,024 characters)**, which can contain Host names,
paths or message text; `Expo-Extra-Params` if set. No app config field disables `EAS-Client-ID` or the error header
(not verified beyond the app config reference).

- **The Worker must not log or store** any of it: `[observability] enabled = false` as in the relay, no Logpush, no
  analytics, no counters keyed on the client id. Rate limits, if any, in memory only, as the relay does.
- **App Privacy label:** "Collect" means keeping data "longer than what is necessary to service the transmitted request
  in real time" ([App Privacy details](https://developer.apple.com/app-store/app-privacy-details/)). With no
  retention, "Data Not Collected" still holds. Logging the client id or the error header would make it Device ID and
  Diagnostics, so the no-logging rule is what keeps the label.
- **Privacy policy:** add an "App updates" section: the app asks the developer's update server on Cloudflare for
  updates to its own code at launch; the request carries the IP, platform, app and update versions, a random install
  identifier and, after a crash, the error message; none is stored.
- **Listing:** "Your code and prompts go from one to the other, not through our servers" stays true. The App Review
  note "it does not download or run code on the device" becomes false and must change to say the app downloads
  signed updates to its own JavaScript from the developer's server, and that no user content passes through it.
  Store copy should say "no account" and "your sessions never pass through our servers", not "no server of ours".

## 8. Open source

- The certificate is public: `apps/mobile/certs/updates.pem`, committed. The private key never is.
- `app.config.js` adds `updates.url` and the certificate only when an official-build flag is set (environment
  variable or `app.local.json`, the pattern 0008 already uses). A build from source has updates disabled or
  pointed at the fork's own server and certificate.
- A fork that keeps our URL and certificate can only receive our signed updates; it cannot publish to our users, and
  official builds reject anything not signed by our key (section 3).

## 9. Plan

Owner-only steps are marked **(owner)**.

1. Accept or amend this ADR **(owner)**; decide the "Not decided" list. Done 2026-11-14.
2. Worker + R2 in `packages/updates-server` (new, separate from the relay to limit blast radius): routes for the
   manifest (pick latest by platform, runtime, channel; serve stored bytes and signature) and immutable assets.
   Tests with `node --test` against the protocol rules. No secret in it. Built 2026-11-14.
3. `scripts/publish-update.mjs`: refuses unless clean `main` and green `pnpm test`; `npx expo export --platform ios`;
   checks the runtime fingerprint against released builds; builds the manifest; signs it with the key file given on
   the command line; `--dry-run` writes everything to a folder; upload is a separate step. Built 2026-11-14.
   The R2 upload (built 2026-11-14, `wrangler r2 object --remote` with the owner's login or API token)
   writes assets, then the signed body and signature, reads everything back, and moves the channel
   pointer last; it never overwrites an object, refuses `--local-test` bundles and production before
   beta (`--skip-beta` to override), checks the deployed Worker after the pointer moves and puts the
   pointer back if that fails, and appends the public log line for the owner to commit.
4. Local end-to-end without publishing: the Worker under `wrangler dev`, a Release simulator build pointed at it with a
   throwaway test key and test certificate (integrator builds it). Checks: an update applies on the next cold start;
   a bad signature, a wrong runtime and an older `createdAt` are all refused; a crash on launch rolls back.
5. Generate the production key pair and certificate, store the key offline **(owner)**. Commit the certificate.
6. Create the R2 bucket, deploy the Worker, route it on the project domain **(owner)**. The deploy is
   `packages/updates-server/scripts/deploy.mjs` (built 2026-11-14): the domain and account id come from
   a gitignored `deploy.local.json`, it checks the bucket binding and that Workers Logs stay off, then
   runs `wrangler deploy --domain`.
7. `npx expo install expo-updates`, the app config fields, `fingerprint.config.js` with `patches/`, the
   official-build flag; the release script records the fingerprint. Built 2026-11-14 (flag `UPDATES_URL`, on only with
   production APNs; the `updates` block is left out of the fingerprint so the flag does not change the
   runtime; Android forced off; the app's channel is an "Early Updates" setting; updates guide).
8. Privacy policy section, App Review note, listing wording (section 7).
9. First store release that contains `expo-updates`, through TestFlight **(owner)**, then App Store.
10. First real update to the beta channel only, then everyone **(owner publishes)**.

## Decision

Recommended: `expo-updates` against our own static, pre-signed update server on the project's Cloudflare account
(Worker + R2), runtime version by fingerprint, code signing required, signing key offline with the owner, updates
applied silently on the next cold start, used only for fixes and polish of reviewed features.

## Decided (owner, 2026-11-14)

- **Certificate validity: 3 years.**
- **Key custody:** the owner's choice; nothing in the repo reads, generates or stores a production key
  (the publish script takes a file path at publish time; tests make a throwaway key in a temp folder).
- **Beta versus everyone:** a channel the app sets at runtime (section 5); the server and the publish
  script handle `beta` and `production`. How the app decides is a later step. No staged percentage.
- **The Worker is its own package**, `packages/updates-server`, not a route of the relay.
- **iOS first.** Android is not enabled (the publish script refuses it) until its client's behaviour on
  a missing or bad signature is verified on a device.
- **A public log of published updates is kept**, as `docs/releases/updates.jsonl` in the repository,
  appended by the upload step and committed by the owner. A file the Worker served would be a file the
  server can rewrite, and the server is what the log must hold to account; git history on the public
  repository is outside the Worker's and the Cloudflare account's reach. Each entry has the update id,
  runtime version, channel, `createdAt`, commit, the SHA-256 of the signed bytes and the signature, so
  anyone can compare what the server serves with the log (`publish-update.mjs verify --url`) and rebuild
  the update from the commit.

## Not verified

- Android client's handling of missing or invalid signatures on a device (read in source 2026-11-14: same
  as iOS; request headers also read there and match iOS).
- `expo-updates` on RN 0.88 with the New Architecture on a device.
- The path of the embedded fingerprint in an archived app (`EXUpdates.bundle/fingerprint`, read from
  `create-updates-resources-ios.sh`; the release script checks it when present).
- Apple's position on Hermes bytecode as interpreted code.
- Whether native crashes trigger error recovery.
- Certificate pinning for the update URL.
