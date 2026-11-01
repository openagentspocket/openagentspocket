// Notification envelope v1 (ADR 0008).
//
// The encrypted Agent Notification payload carried from the notify hook
// through the Push Relay and APNs to the app's service extension. Wire
// format: a compact JSON object `{"v":1,"kid":...,"n":...,"ct":...}` whose
// `ct` is the AES-256-GCM ciphertext (plus tag) of a compact JSON plaintext
// `{"pane":...,"kind":...,"status":...,"ts":...}` plus the optional display
// fields `project` and `title` and the optional approval fields `bid`, `act`,
// `q` and `opts` (spec F5). See README.md for the
// schema and test-vectors/notification-payload-v1.json for the
// cross-implementation vectors: this side proves the encrypt direction, the
// Swift side proves the decrypt direction. Breaking changes bump the
// version, which both implementations must honor together.

import { ENVELOPE_VERSION, deriveKeyId, sealEnvelope } from "./seal-envelope.js";

export const NOTIFICATION_ENVELOPE_VERSION = ENVELOPE_VERSION;

// Additional authenticated data binding the ciphertext to envelope v1, so a
// re-framed ciphertext under a different version fails authentication.
const AAD = Buffer.from(`HERDR-NOTIFY:${NOTIFICATION_ENVELOPE_VERSION}`, "utf8");

export class NotificationEnvelopeError extends Error {
  /**
   * @param {"bad_envelope"|"unsupported_version"|"decrypt_failed"|"bad_payload"} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "NotificationEnvelopeError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new NotificationEnvelopeError(code, message);
}

/**
 * Derive the cleartext key id for a raw 32-byte Notification Key: the first
 * 8 bytes of SHA-256 over the key, unpadded base64url. Both ends derive it,
 * so it never needs to be stored or exchanged separately.
 *
 * @param {Buffer} key
 * @returns {string}
 */
export function notificationKeyId(key) {
  return deriveKeyId(key);
}

// Hard ceiling for the display-only strings, in UTF-16 code units (what
// `String.length` counts). The notify hook trims to something shorter still
// (see DISPLAY_LIMIT there, and PROMPT_LIMIT in approval-preview.js); this is
// the contract's backstop keeping an APNs payload well inside its 4 KB budget
// once the ciphertext is base64url'd.
const DISPLAY_FIELD_MAX = 256;

// At most this many option labels ride in `opts`; the extractor keeps the
// first ones in screen order.
export const APPROVAL_OPTIONS_MAX = 4;

/**
 * Validate the notification payload shape. `project` and `title` are the
 * optional display fields: omit them (or pass null) and the app renders one
 * step less specific. `episodeId`, `approvable`, `prompt` and `options` are
 * the optional approval fields (spec F5), sent only to devices that opted in:
 * the app re-reads the screen before answering, so they bind and display but
 * never choose a key.
 *
 * @param {object} payload
 * @param {string} payload.paneId herdr pane id the Agent lives in
 * @param {string} payload.agentKind agent kind as herdr reports it
 * @param {string} payload.status the new Agent Status (lenient open set)
 * @param {number} payload.timestamp unix-seconds of the status transition
 * @param {string|null} [payload.project] workspace label the Agent runs in
 * @param {string|null} [payload.title] Agent terminal title, glyphs stripped
 * @param {string|null} [payload.episodeId] Blocked episode id (`bid`)
 * @param {boolean} [payload.approvable] whether an answer may be possible (`act`)
 * @param {boolean} [payload.denyOnly] with `approvable`: Deny only, never
 *   Approve (`act` 2)
 * @param {string|null} [payload.prompt] the prompt text the hook saw (`q`)
 * @param {string[]|null} [payload.options] option labels in screen order (`opts`)
 */
function validatePayload(payload) {
  const { paneId, agentKind, status, timestamp } = payload;
  if (typeof paneId !== "string" || paneId.length === 0) {
    fail("bad_payload", "paneId must be a non-empty string");
  }
  if (typeof agentKind !== "string" || agentKind.length === 0) {
    fail("bad_payload", "agentKind must be a non-empty string");
  }
  if (typeof status !== "string" || status.length === 0) {
    fail("bad_payload", "status must be a non-empty string");
  }
  if (!Number.isInteger(timestamp) || timestamp <= 0) {
    fail("bad_payload", `timestamp must be a positive unix-seconds integer, got ${timestamp}`);
  }
  for (const field of ["project", "title", "episodeId", "prompt"]) {
    const value = payload[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") fail("bad_payload", `${field} must be a string when present`);
    if (value.length > DISPLAY_FIELD_MAX) {
      fail("bad_payload", `${field} must be at most ${DISPLAY_FIELD_MAX} characters`);
    }
  }
  for (const field of ["approvable", "denyOnly"]) {
    const value = payload[field];
    if (value !== undefined && value !== null && typeof value !== "boolean") {
      fail("bad_payload", `${field} must be a boolean when present`);
    }
  }
  const { options } = payload;
  if (options === undefined || options === null) return;
  if (!Array.isArray(options)) fail("bad_payload", "options must be an array when present");
  if (options.length > APPROVAL_OPTIONS_MAX) {
    fail("bad_payload", `options must hold at most ${APPROVAL_OPTIONS_MAX} labels`);
  }
  for (const label of options) {
    if (typeof label !== "string" || label.length === 0) {
      fail("bad_payload", "options must hold non-empty strings");
    }
    if (label.length > DISPLAY_FIELD_MAX) {
      fail("bad_payload", `each option must be at most ${DISPLAY_FIELD_MAX} characters`);
    }
  }
}

/**
 * Encrypt a notification payload into its canonical v1 envelope string.
 *
 * Key order in both JSON objects is fixed so the same inputs always yield
 * the same envelope; the shared vectors assert on the exact string.
 *
 * @param {object} payload see {@link validatePayload}
 * @param {Buffer} key raw 32-byte Notification Key
 * @param {{nonce?: Buffer}} [options] injectable 12-byte nonce (tests only;
 *   production must use the random default)
 * @returns {string} the canonical envelope JSON string
 * @throws {NotificationEnvelopeError} with code `bad_payload`
 */
export function encryptNotificationEnvelope(payload, key, { nonce } = {}) {
  validatePayload(payload);

  // Empty display fields are omitted rather than sent blank, so the encoding
  // stays canonical whichever way the Host failed to resolve them. Key order
  // is the notification contract's table order (not alphabetical) so existing
  // vectors stay byte-identical.
  const plaintext = JSON.stringify({
    pane: payload.paneId,
    kind: payload.agentKind,
    status: payload.status,
    ts: payload.timestamp,
    ...(payload.project ? { project: payload.project } : {}),
    ...(payload.title ? { title: payload.title } : {}),
    // The approval fields follow, in the contract's table order. `act` is
    // 1 (Approve and Deny), 2 (Deny only) or absent; an empty option list is
    // absent too.
    ...(payload.episodeId ? { bid: payload.episodeId } : {}),
    ...(payload.approvable ? { act: payload.denyOnly ? 2 : 1 } : {}),
    ...(payload.prompt ? { q: payload.prompt } : {}),
    ...(payload.options?.length ? { opts: payload.options } : {}),
  });
  return sealEnvelope(plaintext, key, AAD, { nonce });
}

/**
 * Encrypt `payload` with the approval fields (spec F5) when they pass the
 * payload checks, and without them when they do not: a preview the checks
 * refuse never costs the device its Blocked push.
 *
 * @param {object} payload the core and display fields
 * @param {object} approval `episodeId`, `approvable`, `denyOnly`, `prompt`, `options`
 * @param {Buffer} key raw 32-byte Notification Key
 * @param {{nonce?: Buffer}} [options] see {@link encryptNotificationEnvelope}
 * @returns {string}
 */
export function encryptWithApprovalFallback(payload, approval, key, options) {
  try {
    return encryptNotificationEnvelope({ ...payload, ...approval }, key, options);
  } catch (error) {
    if (!(error instanceof NotificationEnvelopeError)) throw error;
    return encryptNotificationEnvelope(payload, key, options);
  }
}
