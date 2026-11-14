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

Status (2026-11-14): server, publish script (including the real R2 upload), the deploy script, the app
config and the app side (channel setting, running update in Settings) exist with tests. No key exists,
nothing is deployed, and the R2 upload and the deploy have never run against a real Cloudflare account
(they are tested against a fake `wrangler`; the local bucket path runs for real). iOS only; Android
stays off until its client is verified on a device.

## Publish

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

# 3. Upload: separate and explicit. Look at the plan first, then upload; beta first.
node scripts/publish-update.mjs --upload build/updates/<id> --channel beta --target r2 \
  --base-url https://<update domain> --dry-run
node scripts/publish-update.mjs --upload build/updates/<id> --channel beta --target r2 \
  --base-url https://<update domain>
git add docs/releases/updates.jsonl && git commit -m "Updates: manifest <id> on beta" && git push origin main

# 4. Check what the server serves, as the app would (the upload already did once)
node scripts/publish-update.mjs verify --url https://<update domain>/manifest --channel beta

# 5. Days later, the same bundle to everyone
node scripts/publish-update.mjs --upload build/updates/<id> --channel production --target r2 \
  --base-url https://<update domain>
git add docs/releases/updates.jsonl && git commit -m "Updates: manifest <id> on production" && git push origin main
```

What the upload does (`packages/updates-server/publish/publish-upload.js` and `upload.js`), stopping at
the first problem, with nothing written before the first write:

1. Refuses a `--local-test` bundle for `r2`, and a bundle that fails `verify` for that channel (signature,
   released runtime, asset hashes, already on the channel, not newer than the channel's last update).
2. **Beta first**: refuses `--channel production` for an update the public log never recorded on beta,
   unless `--skip-beta` (meant for an emergency rollback directive).
3. With `--base-url`, refuses a bundle whose asset URLs point at another server.
4. `--dry-run` stops here: it prints every object it would write and the pointer change (from the log's
   last entry for that channel) and reads or writes nothing in any bucket.
5. Reads the channel pointer and refuses when it names something other than what the log's last entry
   for that channel says (an upload that was never logged, or a log that is behind: add the missing
   line from the bundle's `log-entry.json` plus `channel` and `uploadedAt`, then retry).
6. Writes each asset (`assets/<sha256>`), then `updates/<id>/body` and `updates/<id>/signature`. An object
   already present is skipped when its SHA-256 matches and refused when it does not: nothing is ever
   overwritten (the same bundle on production finds everything already there from beta).
7. Reads back every object it wrote and compares SHA-256 (assets through the deployed Worker with
   `--base-url`, which also checks their content type; otherwise `wrangler r2 object get`). A failure
   stops before the pointer: the channel keeps serving what it served.
8. Writes the channel pointer, last. With `--base-url` it then asks `/manifest` as the app would and
   requires this exact update; if that fails it puts the previous pointer back (or removes the new one
   when there was none) and stops.
9. Appends the entry to `docs/releases/updates.jsonl` and prints the git commands to commit and push it.
   It never commits or pushes. **Commit and push the log line before the next upload**: the production
   upload reads it for the beta-first rule, and step 5 compares the bucket with it.

`--target r2` runs `npx wrangler r2 object get|put|delete <bucket>/<key> --remote` (wrangler 4, which
reads local storage unless told `--remote`). The repository does not pin wrangler; `npx` uses the
`wrangler` on your PATH or fetches the latest 4.x. It authenticates as wrangler does: the session
`npx wrangler login` left, or `CLOUDFLARE_API_TOKEN` in your shell. If your login sees more than one
account, set `CLOUDFLARE_ACCOUNT_ID` in the shell or `"accountId"` in `packages/updates-server/deploy.local.json`.
Nothing is printed but wrangler's own error text on a failure. `--target local` is the same code against
the local bucket `wrangler dev` serves ("Test locally").

## Owner steps

Everything that needs the key, the Cloudflare account or a store submission, in this order:

1. **Generate the key pair and certificate** (needs: Node, a machine you trust, offline storage for
   the key; nothing from Cloudflare). Three-year validity (ADR 0028):
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
2. **Sign in to Cloudflare** (needs: the Cloudflare account that will host the Worker, with the update
   domain's zone on it): `npx wrangler login`, or an API token in `CLOUDFLARE_API_TOKEN` for the shell
   you publish from. A token needs Workers Scripts Edit and Workers R2 Storage Edit on the account, and
   Workers Routes Edit plus DNS Edit on the zone for the custom domain (Cloudflare's names; not checked
   against a real account). Several accounts on one login: `CLOUDFLARE_ACCOUNT_ID`, or `"accountId"` in
   `deploy.local.json` (step 4). Never put the token in a file in the repository.
3. **Create the R2 bucket** (needs: R2 enabled on the account; free tier is enough):
   ```sh
   npx wrangler r2 bucket create openagentspocket-updates
   ```
   Keep it private: no r2.dev URL and no bucket custom domain; only the Worker reads it. Optional, a
   second guard against overwrites (not tried on a real account; the upload never overwrites anyway, and
   a lock cannot be undone for the objects it covers):
   `npx wrangler r2 bucket lock add openagentspocket-updates immutable-assets assets/ --retention-indefinite`
   and the same for `updates/`. Never lock `channels/`: the pointer must move.
4. **Deploy the Worker on the update domain** (needs: the zone of `<update domain>` on the same account):
   write `packages/updates-server/deploy.local.json` (gitignored, like the relay's):
   ```json
   { "domains": ["updates.<your domain>"] }
   ```
   (add `"accountId": "<32 hex>"` only for a login with several accounts), then
   ```sh
   cd packages/updates-server
   node scripts/deploy.mjs --dry-run   # checks, then wrangler deploy --dry-run; reads nothing from the account
   node scripts/deploy.mjs             # checks the bucket exists, then wrangler deploy --domain <domain>
   curl -si https://<update domain>/manifest -H 'expo-protocol-version: 1' -H 'expo-platform: ios' \
     -H 'expo-runtime-version: 0'      # expect 204
   ```
   The script refuses a `wrangler.toml` without the `UPDATES` binding, with Workers Logs on, with an
   `account_id` or a committed route, or with Logpush or Analytics Engine. `--domain` makes the custom
   domain and its DNS record. There is no secret to put. In the dashboard, check Workers Logs stay off
   for `openagentspocket-updates`.
5. **First store build with expo-updates** through TestFlight, then the App Store (release guide),
   with the official-build flag set to `https://<update domain>/manifest` (below); `release-ios.mjs`
   records its runtime version in `docs/releases/builds.json`; commit it.
6. **First publish, to beta** (key + account): steps 1 to 4 of "Publish", with the log line
   committed and pushed. Check on a TestFlight install with Early Updates on.
7. **Then production**: step 5 of "Publish", the same bundle.

## Roll back

Prefer **republishing the last good code**. Publishing runs only from `main`, so revert the bad
change on `main` (`git revert`), push, and publish. The new update has a
newer `createdAt`, so every device takes it on its next launch. Upload it to the channels that got the
bad one.

Emergency, when no fix can be built quickly: a signed `rollBackToEmbedded` directive sends devices
back to the JS inside their binary:

```sh
node scripts/publish-update.mjs rollback --key /path/outside/the/repo/updates-key.pem
node scripts/publish-update.mjs --upload build/updates/<id> --channel production --target r2 \
  --base-url https://<update domain> --skip-beta
node scripts/publish-update.mjs --upload build/updates/<id> --channel beta --target r2 \
  --base-url https://<update domain>
# commit and push docs/releases/updates.jsonl as the upload prints
```

`--skip-beta` is the explicit exception to beta first; use it only here.

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

Run on 2026-11-14 (iPhone 17 Pro simulator, iOS 26.5, Release, `expo-updates` 58.0.22):

- The runtime version the build embeds (`AgentsPocket.app/EXUpdates.bundle/fingerprint`) equals
  `computeRuntimeVersion`.
- With nothing published the app asks `/manifest` at launch and gets 204; Settings shows Update "Built In".
- An update published after the build applies on the second cold start (the first one downloads it);
  Settings shows its id.
- An update exported BEFORE the build was made is refused (its `createdAt` is older than the embedded
  bundle's): the app fetches the manifest and no asset. Publish after the build, never before.
- A newer update signed with another key is refused the same way; the app stays on the last good update.

Two things the commands above need on this machine: the Release simulator build takes
`ONLY_ACTIVE_ARCH=YES ARCHS=arm64` (the SSH module's libssh2 has no x86_64 simulator slice), and zsh does
not split `$L`, so pass the flags inline.

Not checked on a device yet: the rollback after a crash at launch, `channel=beta` reaching the server with
Early Updates on, a wrong runtime (the server never serves one: unit tested), Android.


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
  first 8 id characters as the value with its date as the row's second line (both on one line were cut
  on a phone); the Report a Problem text carries both as `- Update: <id> (<date>)`.
- Updates download at launch and apply on the next cold start, silently. The app never checks, fetches or
  reloads by itself and logs nothing about updates; demo mode is no different.

## Store and privacy wording (applied 2026-11-14, ADR 0028 section 7)

Applied: the policy (`packages/relay/src/privacy.js`, English and Spanish, section "App updates"),
`docs/store/listing.md` (App Review notes, one line in each description) are updated. The in-app
texts needed no change. The drafts below are kept for reference.

**Before submitting the store build with updates:** the relay must be deployed (it serves the policy
at `/privacy`) and the App Store Connect texts updated (review notes, description, promotional
text if it repeats the claims), or the published texts will contradict the build.

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

**Why "Data Not Collected" stays:** Apple defines "collect" as "transmitting data off the device in a way
that allows you and/or your third-party partners to access it for a period longer than what is necessary
to service the transmitted request in real time"
([App Privacy details](https://developer.apple.com/app-store/app-privacy-details/)). The update server
answers each check from memory, with no logs, analytics or storage, so no one can access the request
afterwards and nothing is stored or linked to a user. That holds only while the Worker keeps nothing:
logging the install id or the error header would turn it into Device ID and Diagnostics.
