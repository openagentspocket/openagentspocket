# Over-the-air updates

How a JS update reaches users without an App Store review, and who may do what
([ADR 0028](../decisions/0028-over-the-air-updates.md)). Updates are for fixes and polish of what App
Review has seen (ADR 0028, Store rules); anything native, any new feature, permission or data flow is
a store release.

Pieces:

| Piece | Where | Holds a secret |
|---|---|---|
| Update server (Cloudflare Worker + R2) | `packages/updates-server` | No |
| Publish script | `scripts/publish-update.mjs` | Reads the signing key from a file, in memory only |
| Code signing certificate (public) | `apps/mobile/certs/updates.pem` (from owner step 1) | No |
| Signing key | Owner's offline storage, never in the repo, CI, the Worker or Cloudflare | **Yes** |
| Released builds and their runtime versions | `docs/releases/builds.json` (appended by `scripts/release-ios.mjs`) | No |
| Public log of published updates | `docs/releases/updates.jsonl` (appended by a real upload) | No |

Status (2026-11-14): server, publish script, the app config and the app side (channel setting, running
update in Settings) exist with tests. No key exists, nothing is deployed, and no native build with
`expo-updates` has run yet. iOS only; Android stays off until its client is verified on a device.

## How a publish goes

From a clean `main`, level with `origin/main`, on the owner's machine:

```sh
# 1. Build, sign and verify a bundle. Uploads nothing.
node scripts/publish-update.mjs --key /path/outside/the/repo/updates-key.pem \
  --base-url https://<update domain>
```

What it does, in order, stopping at the first problem:

1. Refuses unless on `main`, with nothing uncommitted, level with `origin/main` (the same check
   `release-ios.mjs` makes; shared code in `scripts/lib/git-state.mjs`).
2. Computes the runtime version as expo-updates does for a store build (fingerprint policy,
   `APNS_ENVIRONMENT=production`) and refuses it unless `docs/releases/builds.json` records a build
   with it: an update must only target a binary that exists.
3. Loads the certificate (`--cert`, default `apps/mobile/certs/updates.pem`): RSA, code signing usage,
   not expired. Loads the key from `--key`: a file path only (never key text, never an environment
   variable, never a path inside the repository), held in memory, never printed or copied. Refuses a
   key that is not the certificate's.
4. Prints the commits since the last update for this runtime (from the public log).
5. Runs `pnpm test` (`--skip-tests` to skip, as `release-ios.mjs` allows).
6. `npx expo export --platform ios --output-dir <temp> --clear` in `apps/mobile` (Hermes bytecode).
7. Builds the manifest (ADR 0028; field by field in `packages/updates-server/publish/manifest.js`),
   with the public Expo config as `extra.expoClient` (the app reads `Constants.expoConfig` from it while
   it runs the update) and the commit as `extra.commit`.
8. Signs it (RSA-SHA256 over the exact bytes), verifies the signature against the certificate
   before writing anything, writes `build/updates/<id>/`, then verifies the written bundle as the app
   would (signature, runtime version, every asset's hash, `createdAt` newer than the last update).

```sh
# 2. Re-check any time
node scripts/publish-update.mjs verify build/updates/<id> --channel beta

# 3. Upload: separate and explicit. beta first, then production with the same bundle.
node scripts/publish-update.mjs --upload build/updates/<id> --channel beta --target r2
node scripts/publish-update.mjs --upload build/updates/<id> --channel production --target r2
```

The upload verifies again for that channel (refuses an update already on it or not newer than its
last one), writes the assets, then the signed body and signature, then the channel pointer last, and
appends the entry to `docs/releases/updates.jsonl`. **Commit and push that file** after each upload.

```sh
# 4. Check what the server serves, as the app would
node scripts/publish-update.mjs verify --url https://<update domain>/manifest --channel beta
```

`--target r2` is not implemented yet: it refuses before writing anything ("owner step, not run").
It becomes real once the bucket exists (owner step 3).

## What is owner-only

Everything that needs the key, the Cloudflare account or a store submission:

1. **Generate the key pair and certificate** (needs: Node, a machine you trust, offline storage for
   the key). Three-year validity (ADR 0028):
   ```sh
   cd apps/mobile
   npx expo-updates codesigning:generate --key-output-directory ../../../updates-keys \
     --certificate-output-directory certs --certificate-validity-duration-years 3 \
     --certificate-common-name "Agents Pocket updates"
   ```
   (RSA 2048, node-forge's default, with the code signing usage.) The key folder must be outside the
   repository; move `private-key.pem` to offline storage (an encrypted PEM in a password manager, or a
   hardware token after a spike) and delete `public-key.pem` and the folder. Commit only
   `apps/mobile/certs/certificate.pem`, renamed `updates.pem`.
2. **Create the R2 bucket** `openagentspocket-updates` (needs: Cloudflare account access):
   `npx wrangler r2 bucket create openagentspocket-updates`.
3. **Deploy the Worker and route the update domain** (needs: account, DNS):
   `cd packages/updates-server && npx wrangler deploy`, then a custom domain (uncomment `[[routes]]`
   in `wrangler.toml`, as the relay does). There is no secret to put. Check Workers Logs stay off.
   Then implement `r2Store` in `packages/updates-server/publish/upload.js` (for example
   `wrangler r2 object put --remote`, same interface as the local store).
4. **First store build with expo-updates** through TestFlight, then the App Store (release guide),
   with the official-build flag set (below); `release-ios.mjs` records its runtime version in
   `docs/releases/builds.json`; commit it.
5. **Publish** (key + account): the four commands above, beta first.

## Roll back

Prefer **republishing the last good code**. Publishing runs only from `main`, so revert the bad
change on `main` (`git revert`), push, and publish. The new update has a
newer `createdAt`, so every device takes it on its next launch. Upload it to the channels that got the
bad one.

Emergency, when no fix can be built quickly: a signed `rollBackToEmbedded` directive sends devices
back to the JS inside their binary:

```sh
node scripts/publish-update.mjs rollback --key /path/outside/the/repo/updates-key.pem
node scripts/publish-update.mjs --upload build/updates/<id> --channel production --target r2
```

Expo warns that the embedded JS may not read state a newer update wrote
([error recovery](https://docs.expo.dev/eas-update/error-recovery/)). A later normal update replaces the
directive (newer `createdAt`).

A crash at launch already rolls a device back by itself (the client marks the update failed and goes
back to the last one that launched), but only for a fatal JS error before the first render is reported.

## Test locally (no account, no real key)

Server only:

```sh
cd packages/updates-server && pnpm test     # protocol conformance, publish tooling, end to end
npx wrangler dev                            # http://127.0.0.1:8787, local R2 in .wrangler/state
```

A full publish against the local server, with a throwaway key and a test builds record
(`--local-test` skips the git and test gates, accepts `--builds`, requires a loopback `--base-url` and
marks the bundle so `--target r2` refuses it):

```sh
T=$(mktemp -d)
openssl req -x509 -newkey rsa:2048 -nodes -keyout $T/key.pem -out $T/cert.pem -days 2 \
  -subj /CN=local-test -addext extendedKeyUsage=codeSigning -addext keyUsage=critical,digitalSignature
R=$(node --input-type=module -e "import { computeRuntimeVersion } from './scripts/lib/runtime-version.mjs'; console.log(computeRuntimeVersion({ mobileDir: process.cwd() + '/apps/mobile', platform: 'ios' }))")
echo "[{\"platform\":\"ios\",\"version\":\"0.0.0\",\"build\":\"1\",\"runtimeVersion\":\"$R\",\"commit\":\"local\",\"archivedAt\":\"2026-01-01T00:00:00.000Z\"}]" > $T/builds.json
L="--local-test --cert $T/cert.pem --builds $T/builds.json"

node scripts/publish-update.mjs $L --key $T/key.pem --base-url http://127.0.0.1:8787
node scripts/publish-update.mjs $L --upload build/updates/<id> --channel beta --target local
node scripts/publish-update.mjs $L verify --url http://127.0.0.1:8787/manifest --channel beta --runtime $R --allow-unlogged
```

Device check (ADR plan step 4, integrator): a Release simulator build pointed at the local server,
with the throwaway certificate from above. Updates are on only in a build signed for production APNs,
which is also the environment the runtime version above was computed in:

```sh
cd apps/mobile
APNS_ENVIRONMENT=production UPDATES_URL=http://127.0.0.1:8787/manifest UPDATES_CERTIFICATE=$T/cert.pem \
  npx expo prebuild --clean --platform ios
# then a Release build for the simulator from this shell (or with the three values in app.local.json:
# "apnsEnvironment", "updatesUrl", "updatesCertificate")
```

Plain http reaches loopback through the `NSAllowsLocalNetworking` exception `withLocalPreview` already
adds. Check: an update applies on the next cold start; a bad signature, a wrong runtime and an older
`createdAt` are refused; a crash at launch rolls back; Settings shows the running update and Early
Updates, and with it on the server sees `channel=beta` in `Expo-Extra-Params`.

## App config (ADR plan step 7, applied)

Verified against the [SDK 58 app config](https://docs.expo.dev/versions/v58.0.0/config/app/), the
[SDK 58 Updates page](https://docs.expo.dev/versions/v58.0.0/sdk/updates/) and the expo-updates 58.0.22
source. Covered by `apps/mobile/src/config/appConfig.test.ts`, which resolves the config the way
prebuild does.

- `apps/mobile/app.json`: `"runtimeVersion": { "policy": "fingerprint" }`.
- **The official-build flag** is the update server's manifest URL: `UPDATES_URL` in the environment, or
  `"updatesUrl"` in the gitignored `apps/mobile/app.local.json` (the environment wins, as for
  `APPLE_TEAM_ID`; the file is what an Xcode archive from the Dock sees). No URL is in the repository.
  `apps/mobile/app.config.js` turns updates on only when the flag is set **and** the build is signed for
  production APNs (`APNS_ENVIRONMENT=production`, what `release-ios.mjs` sets):
  ```js
  updates: {
    enabled: true,
    url: '<the flag>',
    codeSigningCertificate: './certs/updates.pem',
    codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' },
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
    enableBsdiffPatchSupport: false,   // the server never sends patches (226); keep requests plain
  },
  ```
  Everything else gets `updates: { enabled: false }`: a fork or a build from source (no flag), device
  installs signed for development, the simulator suite and development builds (development APNs,
  whatever the flag says). They never contact an update server and run only their embedded JS.
  `requestHeaders` stays unset (baked into the binary; TestFlight and the App Store share it),
  `disableAntiBrickingMeasures` false, `useEmbeddedUpdate` true, `maxUpdatesToKeep` 2 (defaults).
- **Refusals** (the config step fails, so prebuild and the fingerprint fail with it): the flag set with no
  certificate file ("an official build never accepts unsigned updates"); a URL that is not https
  (plain http only to loopback); `UPDATES_CERTIFICATE` / `"updatesCertificate"` (a throwaway
  certificate's path, for the local test) with anything but a loopback URL.
- **For a store build**: put `"updatesUrl": "https://<update domain>/manifest"` in `app.local.json` (or
  export `UPDATES_URL` in the release shell) once the certificate is committed (owner step 1) and the
  Worker is deployed (step 3), then run `release-ios.mjs` as usual. It prints whether updates are on and
  checks the result before upload ([release guide](release.md), "The checks").
- **Android is off** in every build: `apps/mobile/plugins/withUpdatesIosOnly.js` writes
  `expo.modules.updates.ENABLED=false` into the Android manifest after expo-updates does (ADR 0028,
  Decided).
- `apps/mobile/fingerprint.config.js`: `extraSources` adds the root `patches/` folder (checked
  2026-11-14 with `@expo/fingerprint` 0.21.8: the default only hashes a `patches/` folder inside
  `apps/mobile`), and `fileHookTransform` leaves the `updates` block out of the hashed Expo config.
  Without that, the flag, the URL and the certificate path changed the fingerprint (measured: three
  different hashes for no flag, the loopback URL and another URL), so an official build's runtime would
  differ from the one the release and publish scripts compute without knowing the URL. Those fields say
  where updates come from, not what JS the binary runs.
- `scripts/lib/runtime-version.mjs` always cross-checks its hash with `expo-updates runtimeversion:resolve`
  and fails on any difference; a test pins that the flag does not change the runtime. `release-ios.mjs`
  refuses a build whose `EXUpdates.bundle/fingerprint` is missing or differs from the runtime it records.

## The app side

- `apps/mobile/src/updates/appUpdates.ts`: the `AppUpdates` interface over `expo-updates`, with a fake
  (`fakeUpdatesApi`) and `disabledUpdates`; `deviceUpdates.ts` loads the native module lazily and never on
  web. Tests run with updates off (`jest.setup.js`), as a build from source does.
- **Early Updates** (Settings, Help section, under Version; setting `earlyUpdates`, off by default): on
  sends `channel=beta` (`Updates.setExtraParamAsync('channel', 'beta')`), off removes the param, so the
  server serves `production`. `UpdateChannelSync` applies it at launch and on every toggle; it rides on the
  next update request. Shown only when the build has updates.
- **Update** row (same place, same condition): "Built In" for the binary's own JS, or the running update's
  first 8 id characters and its date; the Report a Problem text carries the same as `- Update: ...`.
- Updates download at launch and apply on the next cold start, silently. The app never checks, fetches or
  reloads by itself and logs nothing about updates; demo mode is no different.

## Store and privacy wording (drafts, ADR 0028 section 7)

Apply when the first build with `expo-updates` ships, not before: the served policy in
`packages/relay/src/privacy.js` and `docs/store/listing.md` stay as they are until then.

**Privacy policy, new section "App updates":**

> The app can receive updates to its own code from the developer's update server, hosted on
> Cloudflare. At each launch it asks that server whether an update exists. The request carries your
> IP address, the platform, the app's version identifiers and the identifier of the update it runs, a
> random identifier created when the app was installed and, if the app crashed since the last check,
> the error message. The server uses this only to answer the request and stores none of it: it keeps
> no logs and no analytics. Updates are signed by the developer, and the app refuses any update that
> is not. No content from your Hosts, sessions or messages is sent to the update server.

**App Review note** (replaces "it does not download or run code on the device"):

> The app uses expo-updates to download signed updates to its own JavaScript from the developer's
> server, only to fix and refine features reviewed here (DPLA 3.3.1(B), Guideline 2.5.2). New features
> ship through App Review. Updates are code-signed; the app rejects unsigned ones. No user content
> passes through the update server.

**Listing:** keep "Your code and prompts go from one to the other, not through our servers". Where the
copy says there is no server of ours, say "no account" and "your sessions never pass through our
servers" instead. App Privacy stays "Data Not Collected" as long as the Worker keeps nothing
(`packages/updates-server/README.md`, "What the Worker sees, and discards").
