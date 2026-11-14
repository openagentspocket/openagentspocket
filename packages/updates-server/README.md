# Update server

A Cloudflare Worker that serves over-the-air JavaScript updates to the app with the
[Expo Updates protocol v1](https://docs.expo.dev/technical-specs/expo-updates-1/)
([ADR 0028](../../docs/decisions/0028-over-the-air-updates.md)). It is a static file server with a
protocol wrapper:

- **No secret.** Updates are signed once, on the owner's machine, by `scripts/publish-update.mjs`.
  The Worker stores and serves the manifest bytes and their `expo-signature` value exactly as the
  script wrote them. It cannot sign, so a compromised Worker or Cloudflare account cannot publish
  code: the app rejects anything not signed by the key its certificate names.
- **No state about clients.** No database, no counters, no logs, no analytics (below).
- **No dependencies.** WebCrypto, `fetch` and the R2 binding, so the tests run under plain Node.

How a publish goes, what only the owner does, and rollback: [docs/guides/updates.md](../../docs/guides/updates.md).

## Routes

### `GET /manifest`

The update check every app launch makes. The request headers that matter:

| Header | Use |
|---|---|
| `expo-protocol-version` | Must be `1`; anything else is `406`. |
| `accept` | Must admit `multipart/mixed` (the only structure served); otherwise `406`. A missing header admits it. |
| `expo-platform` | `ios` or `android`; anything else is `400`. |
| `expo-runtime-version` | The binary's runtime version (a fingerprint hash); malformed is `400`. |
| `expo-extra-params` | SFV dictionary; its `channel` key is `beta` or `production` (absent: `production`). Another value, or a malformed header, is `400`. The app sets it with `Updates.setExtraParamAsync('channel', ...)`. |
| `expo-current-update-id` | When it equals the published update's id, the answer is `204`. |

Response, when something is published for (platform, runtime version, channel):

```
200
expo-protocol-version: 1
expo-sfv-version: 0
cache-control: private, max-age=0
content-type: multipart/mixed; boundary=<random, absent from the part>

--<boundary>
content-disposition: form-data; name="manifest"        (or name="directive")
content-type: application/json
expo-signature: <the stored value: sig="...", keyid="main", alg="rsa-v1_5-sha256">

<the stored bytes, unchanged>
--<boundary>--
```

When nothing is published, the runtime version is unknown, or the device already runs the
published update: `204` with the three protocol headers and no body, the protocol's no-op. The
expo-updates client accepts a `204` when `expo-protocol-version` is above 0, with no signature,
on iOS and Android (`FileDownloader.swift` / `FileDownloader.kt`, SDK 58).

The Worker never sends `expo-manifest-filters` or `expo-server-defined-headers`: a filter that
excludes the update a device runs would let the client load an older update (ADR 0028, Rollout),
and the server must not be able to do that.

### `GET /assets/<sha256>` (and `HEAD`)

Asset bytes, addressed by the lowercase hex SHA-256 of their content (64 characters; anything else
is `404`). Headers: the `content-type` stored with the object, `content-length`,
`cache-control: public, max-age=31536000, immutable`, `etag`. An asset URL never changes content,
as the protocol requires. Compression is left to Cloudflare's edge (the protocol allows serving
uncompressed); the client checks every asset's SHA-256 against the signed manifest anyway.

Other paths are `404`; other methods `405` with `allow`.

## Storage layout

One R2 bucket, binding `UPDATES`:

| Key | Content | Written by |
|---|---|---|
| `assets/<sha256 hex>` | asset bytes; `content-type` in the object's HTTP metadata | upload, first |
| `updates/<id>/body` | the exact signed bytes of a manifest or directive (`<id>` is the manifest `id`; a directive gets its own UUID) | upload |
| `updates/<id>/signature` | the full `expo-signature` value for those bytes | upload |
| `channels/<platform>/<runtime version>/<channel>` | `{"kind":"manifest"\|"directive","id":"<id>"}`: what that channel serves now | upload, **last** |

Selection is one read of the pointer: the publish script refuses an update whose `createdAt` is not
newer than the last one it published to that channel (`docs/releases/updates.jsonl`), so the
pointer always names the newest, as the protocol's "most recent update" requires. Writing the
pointer last means a half-finished upload is never served. Nothing is ever deleted or rewritten
except the pointer, so a device that started downloading an update can always finish.

The same bundle can be uploaded to `beta` and later to `production` (only the pointer differs); the
channel is not inside the signed bytes.

## What the Worker sees, and discards

Every update check carries (expo-updates SDK 58, iOS and Android): the IP address, `expo-platform`,
`expo-runtime-version`, `expo-protocol-version`, `expo-api-version`, `expo-updates-environment`,
`expo-current-update-id`, `expo-embedded-update-id`, `expo-recent-failed-update-ids`,
**`eas-client-id`** (a random per-install UUID), **`expo-fatal-error`** (the text of the last fatal
JS error, up to 1,024 characters), `expo-expect-signature`, and `expo-extra-params` if set.

The Worker reads platform, runtime version, protocol version, accept, the channel and the current
update id to pick the answer, and drops the request when it has answered. It stores nothing, logs
nothing (no `console` call anywhere; a test fails if one appears), keeps no counters, and never
reads `eas-client-id` or `expo-fatal-error`. `wrangler.toml` turns Workers Logs off
(`[observability] enabled = false`); Logpush and Analytics Engine are not configured and must not
be. This is what keeps the App Store privacy label at "Data Not Collected".

## Run locally (no Cloudflare account)

```sh
cd packages/updates-server
npx wrangler dev            # http://127.0.0.1:8787, local R2 in .wrangler/state (gitignored)
```

Put a bundle in the local bucket from the repository root (docs/guides/updates.md, "Test locally"):

```sh
node scripts/publish-update.mjs --upload build/updates/<id> --channel beta --target local \
  --local-test --cert <test cert> --builds <test builds.json>
curl -si http://127.0.0.1:8787/manifest -H 'expo-protocol-version: 1' -H 'expo-platform: ios' \
  -H 'expo-runtime-version: <runtime>' -H 'expo-extra-params: channel="beta"'
```

`wrangler dev` prints one line per request on your terminal; that is the local dev server, not
the Worker. Deployed, nothing is logged (above).

## Publish tooling

`publish/` holds the Node side the owner runs through `scripts/publish-update.mjs`: `manifest.js`
(manifest and directive bodies from an `npx expo export` folder), `signing.js` (key and certificate
loading, RSA-SHA256), `create.js` (sign, verify, write a bundle), `bundle.js` (the bundle folder),
`verify.js` (client-side checks, on a folder or against a server), `upload.js` (the ordered,
never-overwriting upload with read-back before the pointer), `stores.js` (memory, the local bucket
and the real R2 bucket, both through `wrangler r2 object`), `publish-upload.js` (the upload step's
refusals, dry run and log line), `fake-wrangler.js` (the test stand-in for wrangler), `log.js` (the
public log). They share `src/protocol.js`
with the Worker, so both sides agree on headers, SFV, multipart and the storage keys.

## Tests

```sh
pnpm test          # node --test: Worker conformance, publish tooling
```

`pnpm verify-fast` runs them whenever a file under this package changes.

## Deploy (owner only)

`node scripts/deploy.mjs [--dry-run]` from this folder, with the custom domain (and, for a login with
several accounts, the account id) in the gitignored `deploy.local.json`:
`{ "domains": ["updates.<your domain>"] }`. It checks `wrangler.toml` (the `UPDATES` binding, Workers
Logs off, no account id, no committed route) and that the bucket exists, then runs
`wrangler deploy --domain <domain>`. There is no secret to put. Creating the bucket and the rest of
the order: docs/guides/updates.md, "Owner steps".
