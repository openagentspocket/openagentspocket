# 0028. Over-the-air JS updates: expo-updates, a signed static server on our Cloudflare account

Status: proposed (2026-11-13). Research only: nothing is installed, no key exists, no server runs.

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

Sources were read on 2026-11-13. "Not verified" means the documentation or the code we read does not answer it.

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
The manifest ([protocol v1](https://docs.expo.dev/technical-specs/expo-updates-1/)) is JSON: `id` (UUID),
`createdAt` (ISO 8601), `runtimeVersion`, `launchAsset`, `assets[]` each with `key`, `contentType`, `url` and `hash`
(base64url SHA-256), `metadata`, `extra`. The server answers `multipart/mixed` with a `manifest` part and, when
asked, an `expo-signature` part header.

## 3. Security model

### Signing

- **Algorithm:** RSASSA-PKCS1-v1_5 with SHA-256 over the exact bytes of the manifest (or directive) part. The iOS
  client says "For now only SHA256withRSA is supported" and hashes the part body it received
  ([CodeSigningConfiguration.swift](https://github.com/expo/expo/blob/sdk-58/packages/expo-updates/ios/EXUpdates/CodeSigning/CodeSigningConfiguration.swift),
  [FileDownloader.swift](https://github.com/expo/expo/blob/sdk-58/packages/expo-updates/ios/EXUpdates/AppLoader/FileDownloader.swift)).
  Keys come from `npx expo-updates codesigning:generate`, which makes an RSA key pair and a self-signed certificate
  ([code signing guide](https://docs.expo.dev/eas-update/code-signing/)); key size is node-forge's default, not verified.
- **Assets are covered.** The signed manifest carries each asset's SHA-256, and the client "MUST verify" it
  ([spec](https://docs.expo.dev/technical-specs/expo-updates-1/)): "Code signing the manifest also transitively
  signs the assets."
- **Directives are covered.** With signing configured, the iOS client verifies directive parts too
  (`rollBackToEmbedded`, `noUpdateAvailable`) and rejects the whole response on a bad one (FileDownloader.swift).
- **Missing or bad signature:** a missing `expo-signature` throws `SignatureHeaderMissing` unless
  `allowUnsignedManifests` is set (it is not by default); an invalid one fails the download and nothing is applied.
  The app keeps running what it has. Read in the iOS source; **Android behaviour not verified**.
- **The key never touches the server or CI.** Expo's example server signs per request with `PRIVATE_KEY_PATH` on
  the server (helpers.ts in the example repo). **We do not copy that.** Our manifest is static per update, so the
  publish script signs it once on the owner's machine and uploads manifest bytes and signature together; the
  Worker serves them verbatim and holds no secret. For "nothing new", the Worker serves the current manifest anyway
  (the client ignores an update whose `createdAt` is not newer, below) or a `204` (a no-op in the spec; whether
  the client accepts an unsigned `204` with signing on is not verified). Any directive we use is pre-signed the same way.
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

- **`patches/expo-libghostty@0.8.1.patch`** (a pnpm patch): the docs do not say patches are hashed; not verified.
  Add `patches/` through `extraSources` in `fingerprint.config.js` so a patch change always changes the runtime.
- Anonymous config plugins are identified as `withAnonymous`, so editing their body may not change the hash; keep
  local plugins named.

Guard rail: `release-ios.mjs` records the fingerprint of each archived build in the repo; the publish command
recomputes it and refuses to publish an update whose runtime matches no released build.

## 5. Rollout

- **Channels.** The protocol has no channel concept; `expo-channel-name` is an EAS header, not in the spec. A TestFlight
  build is promoted to the App Store unchanged, so a channel cannot be baked into the binary. Option: the app sets
  `Updates.setExtraParamAsync('channel', 'beta')` (sent as `Expo-Extra-Params`) when it detects a TestFlight install
  (detection method not verified) or from a hidden setting; the Worker serves "beta" updates only to that value.
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

1. Accept or amend this ADR **(owner)**; decide the "Not decided" list.
2. Worker + R2 in `packages/updates-server` (new, separate from the relay to limit blast radius): routes for the
   manifest (pick latest by platform, runtime, channel; serve stored bytes and signature) and immutable assets.
   Tests with `node --test` against the protocol rules. No secret in it.
3. `scripts/publish-update.mjs`: refuses unless clean `main` and green `pnpm test`; `npx expo export --platform ios`;
   checks the runtime fingerprint against released builds; builds the manifest; signs it with the key file given on
   the command line; `--dry-run` writes everything to a folder; upload is a separate step.
4. Local end-to-end without publishing: the Worker under `wrangler dev`, a Release simulator build pointed at it with a
   throwaway test key and test certificate (integrator builds it). Checks: an update applies on the next cold start;
   a bad signature, a wrong runtime and an older `createdAt` are all refused; a crash on launch rolls back.
5. Generate the production key pair and certificate, store the key offline **(owner)**. Commit the certificate.
6. Create the R2 bucket, deploy the Worker, route it on the project domain **(owner)**.
7. `npx expo install expo-updates`, the app config fields, `fingerprint.config.js` with `patches/`, the
   official-build flag; the release script records the fingerprint.
8. Privacy policy section, App Review note, listing wording (section 7).
9. First store release that contains `expo-updates`, through TestFlight **(owner)**, then App Store.
10. First real update to the beta channel only, then everyone **(owner publishes)**.

## Decision

Recommended: `expo-updates` against our own static, pre-signed update server on the project's Cloudflare account
(Worker + R2), runtime version by fingerprint, code signing required, signing key offline with the owner, updates
applied silently on the next cold start, used only for fixes and polish of reviewed features.

## Not decided

- Certificate validity (suggested 3 years: long enough to outlive installed builds, short enough to bound a leak).
- Key custody: password manager PEM, or a hardware token (needs a spike).
- How beta users are told apart (TestFlight detection or a hidden setting) and whether a staged percentage is wanted.
- Whether the Worker lives in its own package (recommended) or as a route of the relay.
- Whether Android ships with it at the same time (its client behaviour on a missing signature is not verified).
- Whether to keep a public log of published updates (recommended).

## Not verified

- Android client's handling of missing or invalid signatures, and its request headers (read on iOS only).
- Whether pnpm patches enter the fingerprint.
- `expo-updates` on RN 0.88 with the New Architecture on a device.
- Whether the client accepts an unsigned `204` when signing is on.
- RSA key size from `codesigning:generate`.
- Apple's position on Hermes bytecode as interpreted code.
- Whether native crashes trigger error recovery.
- Certificate pinning for the update URL.
