// The FCM path (`platform: "android"`): the alert push as an FCM HTTP v1
// data-only message.
//
// The envelope goes verbatim into `data.envelope` (the app decrypts it and
// posts the local notification itself, so there is no `notification` block
// and nothing for FCM to display), with `android.priority: high` so a
// backgrounded app wakes to handle it, and the opaque collapse key as
// `android.collapse_key` (FCM's counterpart of `apns-collapse-id`). FCM's
// UNREGISTERED verdict is relayed as APNs' `410 Unregistered`, the signal
// the plugin already prunes dead tokens on.

import { configString, encoder, isPlainObject, json, validateAlertBody } from "./common.js";
import { FcmAuthError } from "./fcm-auth.js";

// FCM registration tokens are opaque: base64url-ish text with a `:`
// separator, ~150–200 chars today. Bounded, and limited to characters that
// need no escaping anywhere.
const TOKEN_PATTERN = /^[A-Za-z0-9_:.-]{16,1024}$/;
// Registration entries for FCM carry `env: "fcm"` (no sandbox exists), which
// also keeps plugins that only know APNs environments from sending them.
const FCM_ENVIRONMENTS = new Set(["fcm"]);
const FCM_ERROR_TYPE = "type.googleapis.com/google.firebase.fcm.v1.FcmError";

/**
 * The FCM deploy config: the service-account JSON secret, and the Firebase
 * project id (`FCM_PROJECT_ID`, else the service account's own project).
 *
 * @returns {{projectId: string, clientEmail: string, privateKey: string, keyId: string | null} | null}
 */
export function readFcmConfig(env) {
  const raw = configString(env.FCM_SERVICE_ACCOUNT_JSON);
  if (raw === null) {
    return null;
  }
  let account;
  try {
    account = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(account)) {
    return null;
  }
  const projectId = configString(env.FCM_PROJECT_ID) ?? configString(account.project_id);
  const clientEmail = configString(account.client_email);
  const privateKey = configString(account.private_key);
  if (projectId === null || clientEmail === null || privateKey === null) {
    return null;
  }
  return { projectId, clientEmail, privateKey, keyId: configString(account.private_key_id) };
}

/**
 * Validate a request and build its FCM request. Same fields and errors as
 * the APNs alert path, with FCM's token and environment rules.
 *
 * @param {unknown} parsed
 * @param {{projectId: string}} config
 * @returns {{error: string} | {token: string, url: string, body: string, payloadBytes: number}}
 */
export function prepareFcmPush(parsed, config) {
  const push = validateAlertBody(parsed, TOKEN_PATTERN, FCM_ENVIRONMENTS);
  if ("error" in push) {
    return push;
  }
  const data = { envelope: push.envelope };
  const android = { priority: "high" };
  if (push.collapse !== undefined) {
    android.collapse_key = push.collapse;
  }
  return {
    token: push.token,
    url: `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`,
    body: JSON.stringify({ message: { token: push.token, data, android } }),
    // FCM's 4 KB cap applies to the data, not the whole request.
    payloadBytes: encoder.encode(JSON.stringify(data)).byteLength,
  };
}

/** FCM's error code (`UNREGISTERED`, `INVALID_ARGUMENT`, ...), else the RPC status. */
function fcmReason(detail) {
  const error = detail?.error;
  const details = Array.isArray(error?.details) ? error.details : [];
  const fcmError = details.find((entry) => entry?.["@type"] === FCM_ERROR_TYPE);
  if (typeof fcmError?.errorCode === "string") {
    return fcmError.errorCode;
  }
  return typeof error?.status === "string" ? error.status : null;
}

/**
 * Authorize, forward, and relay FCM's verdict: 200 `{fcmId}`, `410
 * {reason: "Unregistered"}` for a dead token, or FCM's status with
 * `{reason}` (its error code).
 *
 * @param {{url: string, body: string}} push
 * @param {{clientEmail: string, privateKey: string, keyId: string | null}} config
 * @param {ReturnType<typeof import("./fcm-auth.js").createFcmAuth>} auth
 * @param {number} nowMs
 * @returns {Promise<Response>}
 */
export async function sendFcmPush(push, config, auth, nowMs) {
  let accessToken;
  try {
    accessToken = await auth.getAccessToken(config, nowMs);
  } catch (error) {
    if (error instanceof FcmAuthError && error.code === "unreachable") {
      return json(502, { error: "fcm_unreachable" });
    }
    return json(500, { error: "relay_misconfigured" });
  }

  let fcmResponse;
  try {
    fcmResponse = await fetch(push.url, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: push.body,
    });
  } catch {
    return json(502, { error: "fcm_unreachable" });
  }

  let detail = null;
  try {
    detail = await fcmResponse.json();
  } catch {
    // Non-JSON FCM body; relay the status alone.
  }
  if (fcmResponse.status === 200) {
    const name = typeof detail?.name === "string" ? detail.name : null;
    // `projects/<id>/messages/<message id>`: only the message id goes back.
    return json(200, { fcmId: name === null ? null : name.slice(name.lastIndexOf("/") + 1) });
  }
  if (fcmResponse.status === 401) {
    auth.invalidate();
  }
  const reason = fcmReason(detail);
  if (reason === "UNREGISTERED") {
    return json(410, { reason: "Unregistered" });
  }
  return json(fcmResponse.status, { reason });
}
