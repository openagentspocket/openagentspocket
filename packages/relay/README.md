# herdr Push Relay

The developer-hosted, stateless forwarder for Agent Notifications (ADR 0008)
and per-Host Live Activity updates (`docs/agents/live-activity-contract.md`).
The plugin encrypts a payload with the per-host Notification Key and POSTs it
here; for an iOS device the relay signs the APNs provider JWT with the
deploy-time `.p8`, forwards the ciphertext verbatim to Apple, and relays
Apple's verdict back. For an Android device (`platform: "android"`) it does
the same through Firebase Cloud Messaging (FCM HTTP v1), authorized by a
deploy-time service account. It is a dumb pipe on purpose:

- **No message state**: no accounts, database, queue, message history, or
  retries (the plugin retries). A relay compromise can expose the APNs and
  FCM credentials and in-flight device tokens, source IPs, APNs environment,
  collapse identifiers, request metadata, and ciphertext. It still cannot
  decrypt notification content because it never receives Notification Keys.
- **Default origin**: the app and plugin default to `http://127.0.0.1:8787`,
  a relay running on the Host itself, so no third party sees device tokens.
  Both still accept a custom relay base URL whose APNs credentials are
  authorized for the app's bundle ID.
- **What crosses it**: the request carries the device token, APNs environment,
  ciphertext, and (on the alert path) an opaque collapse identifier. Live
  Activity requests also carry the agent **counts**, the **event**
  (`update` / `end`), and the **priority**. The relay also observes the
  source IP, request timing, frequency, and size. It never decrypts the
  envelope. Apple (APNs) or Google (FCM) sees the same token, ciphertext and
  collapse identifier.

Runs as a Cloudflare Worker-style fetch handler with zero runtime
dependencies (WebCrypto + fetch), which is also why the tests run under
plain Node.

## API

### `POST /push`

Request body (JSON, ≤ 8 KB). `platform` picks the push service: absent or
`ios` is APNs, `android` is FCM; any other value is `bad_platform`. Requests
without `platform` are exactly what they were before FCM existed, and produce
the same APNs request bytes.

On APNs, bodies **without** `kind` are the original alert path, and the Live
Activity path never changes what they produce. `kind: "liveactivity"`
selects the Live Activity path. Any other `kind` value, or a `kind` field on
an alert body (on either platform), is `bad_kind`. Live Activities are
iOS-only.

#### Alert path (no `kind`)

| Field      | Type   | Required | Meaning |
| ---------- | ------ | -------- | ------- |
| `platform` | string | no       | `ios` (default) or `android`. |
| `token`    | string | yes      | iOS: APNs device token, lowercase hex (16–200 chars). Android: FCM registration token, 16–1024 chars of `A-Z a-z 0-9 _ - : .`. |
| `env`      | string | yes      | iOS: `production` or `sandbox` — which APNs environment the token belongs to, per device entry in the registration file. Android: `fcm`. |
| `envelope` | string | yes      | The notification envelope (see `plugin/README.md`), forwarded verbatim. Opaque to the relay. |
| `collapse` | string | no       | Opaque collapse key, ≤ 64 bytes; passed through as `apns-collapse-id` (iOS) or `android.collapse_key` (Android) so a newer status replaces an older one. |

The relay wraps the envelope in a `mutable-content: 1` alert push with a
generic fallback title/body (the app's service extension rewrites them after
decrypting) and the `default` sound, and enforces Apple's 4 KB payload cap
before forwarding. iOS plays nothing for an alert without a sound; with one,
the user can still turn it off under Settings > Notifications > Agentico.

#### FCM (`platform: "android"`)

The relay sends an FCM HTTP v1 data-only message to
`https://fcm.googleapis.com/v1/projects/<project>/messages:send`:

```json
{"message":{"token":"<token>","data":{"envelope":"<envelope>"},"android":{"priority":"high","collapse_key":"<collapse>"}}}
```

No `notification` block: FCM displays nothing, and the app decrypts the
envelope and posts the notification itself. `priority: high` wakes a
backgrounded app to do so; `collapse_key` is omitted when the request has no
`collapse`. FCM caps `data` at 4 KB, the same cap the relay enforces for
APNs payloads. FCM keeps at most 4 collapse keys per device while it is
offline, so with more than 4 panes waiting, which panes' latest statuses
survive is FCM's choice.

The request is authorized with an OAuth 2.0 access token: the relay signs an
RS256 JWT assertion with the service account's private key (WebCrypto) and
exchanges it at `https://oauth2.googleapis.com/token` (scope
`https://www.googleapis.com/auth/firebase.messaging`). The token is cached per
worker instance until 5 minutes before it expires, and dropped when FCM
answers `401`.

#### Live Activity path (`kind: "liveactivity"`)

| Field            | Type    | Required | Meaning |
| ---------------- | ------- | -------- | ------- |
| `kind`           | string  | yes      | Must be `liveactivity`. |
| `token`          | string  | yes      | Per-activity APNs push token, same hex rules as the alert path. |
| `env`            | string  | yes      | `production` or `sandbox`. |
| `event`          | string  | yes      | `update` or `end`. |
| `priority`       | integer | yes      | `5` or `10`. `10` additionally requires `counts.blocked >= 1`. |
| `timestamp`      | integer | yes      | Unix seconds; must be positive and within `[now − 86400, now + 300]`. |
| `stale_date`     | integer | no       | Must be `> timestamp` when present. Sent as APNs `stale-date`. |
| `dismissal_date` | integer | no       | Allowed only when `event` is `end`. Sent as APNs `dismissal-date`. |
| `counts`         | object  | yes      | Exactly `working`, `blocked`, `done`, each an integer `0..999`. |
| `envelope`       | string  | yes      | Canonical activity-envelope JSON, forwarded without parsing. |
| `collapse`       | —       | no       | Must be **absent**. Live Activity pushes do not set `apns-collapse-id`. |

The APNs request uses `apns-push-type: liveactivity` and
`apns-topic: ${APNS_TOPIC}.push-type.liveactivity` (suffix-derived from the
existing topic; no extra config var). The body is `aps` only —
`timestamp`, `event`, `content-state: {counts, envelope}`, and the optional
dates — never `alert` or `mutable-content`. The same 4 KB payload cap
applies.

### Responses

| Status | Body | Meaning |
| ------ | ---- | ------- |
| 200 | `{"apnsId": "..."}` / `{"fcmId": "..."}` | APNs / FCM accepted the push (`fcmId` is the FCM message id). |
| 400 | `{"error": "bad_json" \| "bad_platform" \| "bad_kind" \| "bad_token" \| "bad_env" \| "bad_event" \| "bad_priority" \| "bad_timestamp" \| "bad_stale_date" \| "bad_dismissal_date" \| "bad_counts" \| "bad_envelope" \| "bad_collapse"}` | Request rejected by the relay before contacting APNs or FCM. |
| 404 / 405 | `{"error": ...}` | Wrong path / method (`allow: POST`). |
| 413 | `{"error": "request_too_large" \| "payload_too_large"}` | Request body over 8 KB, or the final APNs payload / FCM `data` would exceed 4 KB. |
| 429 | `{"error": "rate_limited"}` + `retry-after` | Per-IP or per-token limit hit (defaults 120 and 60 per minute; overridable via vars). |
| 500 | `{"error": "relay_misconfigured"}` | Missing or malformed deploy config for the request's platform (with no platform configured at all, before the body is read), or Google refused the service account's assertion. |
| 502 | `{"error": "apns_unreachable" \| "fcm_unreachable"}` | Could not reach APNs, or FCM / Google's token endpoint (network error, or a 5xx from the token endpoint). |
| 410 | `{"reason": "Unregistered", "timestamp"?: n}` | The token is dead: APNs `410 Unregistered`, or FCM `UNREGISTERED` (FCM's 404) mapped to it. The plugin prunes that token. |
| other | `{"reason": "...", "timestamp"?: n}` | Verdict relayed as-is, same status code. APNs: Apple's `reason` string and `timestamp`. FCM: its error code (`INVALID_ARGUMENT`, `SENDER_ID_MISMATCH`, `QUOTA_EXCEEDED`, ...), else the RPC status (`NOT_FOUND`, `UNAUTHENTICATED`, ...), else `null`. |

Relay-origin errors always use the `error` key; relayed APNs and FCM verdicts
always use `reason`, so callers can tell the two apart on overlapping status
codes. Only an FCM `UNREGISTERED` becomes `410`; any other FCM 404 is relayed
as 404, so a wrong project id never prunes live tokens.

Rate limits live in per-isolate memory (the relay has no database by
design), so they are best-effort per worker instance — enough to blunt
quota-burning abuse, not a billing-grade quota.

## Configuration

| Var | Secret | Meaning |
| --- | ------ | ------- |
| `APNS_TEAM_ID` | no | Apple Developer Team ID (JWT `iss`). |
| `APNS_KEY_ID` | no | APNs auth key id (JWT `kid`). |
| `APNS_KEY_P8` | **yes** | PEM contents of the APNs auth key. Deploy-time secret — never commit a `.p8`, never put it in `[vars]`. |
| `APNS_TOPIC` | no | The app bundle id (`apns-topic`). Live Activity pushes use `${APNS_TOPIC}.push-type.liveactivity` (derived by suffix; no extra var). |
| `FCM_SERVICE_ACCOUNT_JSON` | **yes** | The Firebase service account key file (JSON as downloaded: `client_email`, `private_key`, `private_key_id`, `project_id`). Deploy-time secret — never commit it, never put it in `[vars]`. |
| `FCM_PROJECT_ID` | no | Optional Firebase project id; defaults to the service account's `project_id`. |
| `RATE_LIMIT_IP_PER_MIN` | no | Optional per-IP limit override. |
| `RATE_LIMIT_TOKEN_PER_MIN` | no | Optional per-token limit override. |

A relay serves the platforms it holds credentials for: the four `APNS_*`
vars for iOS, `FCM_SERVICE_ACCOUNT_JSON` for Android, at least one of them.
A request for a platform without credentials is `500 relay_misconfigured`.

The signed APNs JWT is cached for ~50 minutes per worker instance (Apple rejects
tokens older than 60 and throttles keys re-signing more often than every 20).

## Tests

```bash
npm test
```

Node's built-in test runner, no dependencies. The boundary suite drives the
fetch handler exactly as the platform would and stubs APNs at the network
edge (the outbound `fetch`); `fcm.test.js` does the same for FCM and
Google's token endpoint, and pins that iOS requests keep their exact APNs
bytes with FCM configured. Unit suites cover the APNs JWT cache clock, the
FCM assertion and access-token cache, and the rate-limit windows.

## Deploy

OpenAgentsPocket's default relay URL is `http://127.0.0.1:8787`, a relay on the Host
itself. The hosted relay is the Cloudflare Worker `openagentspocket-relay` on
workers.dev (`https://openagentspocket-relay.<account subdomain>.workers.dev`); set
that origin as the app's custom relay URL. The same Worker serves the app's
privacy policy at `GET /privacy` (`src/privacy.js`, contact from the
`PRIVACY_CONTACT` var; the App Store listing links there).

1. In the Apple Developer portal, create an APNs auth key (`.p8`) for the
   team that signs the app; note the key id and team id.
2. Write your account values to `deploy.local.json` in this directory (gitignored: the repo is open
   source, so account ids never go in `wrangler.toml`):
   `{ "APNS_TEAM_ID": "...", "APNS_KEY_ID": "...", "FCM_PROJECT_ID": "...", "PRIVACY_CONTACT": "..." }`
   (`APNS_TOPIC` defaults to the app bundle id in `wrangler.toml`).
3. `pnpm deploy` (= `node scripts/deploy.mjs`; add `--dry-run` to check) after `npx wrangler login`. It passes
   those values as `wrangler deploy --var`. A Cloudflare account is the only prerequisite; no build step.
4. `npx wrangler secret put APNS_KEY_P8` and paste the `.p8` PEM contents.
5. Smoke-test with a sandbox token:
   `curl -s -X POST http://127.0.0.1:8787/push -d '{"token":"<hex>","env":"sandbox","envelope":"{}","collapse":"smoke"}'`
   — expect an APNs verdict (`200` or a relayed `400 BadDeviceToken`), not
   `relay_misconfigured`.

For Android (FCM):

1. In the Firebase console, create (or pick) the project the Android app is
   registered in, and download a service account key (Project settings >
   Service accounts > Generate new private key). The account needs
   permission to send FCM messages (the default Firebase Admin SDK account
   has it).
2. `npx wrangler secret put FCM_SERVICE_ACCOUNT_JSON < <key file>.json`. Set
   `FCM_PROJECT_ID` only if the account belongs to another project.
3. Smoke-test with a device's FCM token:
   `curl -s -X POST http://127.0.0.1:8787/push -d '{"platform":"android","token":"<fcm token>","env":"fcm","envelope":"{}"}'`
   — expect an FCM verdict (`200`, or a relayed `400 INVALID_ARGUMENT` /
   `410 Unregistered`), not `relay_misconfigured`.

For local development `npx wrangler dev` works with the same vars in a
`.dev.vars` file (gitignored — the `.p8` and the service account key stay
out of the repo).
