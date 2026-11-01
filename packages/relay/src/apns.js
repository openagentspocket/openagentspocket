// The APNs path (`platform` absent or "ios"): the alert push and the Live
// Activity push, signed with the deploy-time .p8 (apns-jwt.js). Unchanged
// by the FCM path: the same request bytes go to Apple as before it existed.

import { configString, encoder, isPlainObject, json, validateAlertBody } from "./common.js";

const APNS_HOSTS = {
  production: "api.push.apple.com",
  sandbox: "api.sandbox.push.apple.com",
};
const APNS_ENVIRONMENTS = new Set(Object.keys(APNS_HOSTS));

// Lowercase hex per the registration file contract; bounded but not pinned
// to 64 chars, since Apple says token length may change.
const TOKEN_PATTERN = /^[0-9a-f]{16,200}$/;

// Live Activity timestamp must land in [now − 86400, now + 300] seconds.
const TIMESTAMP_PAST_SECONDS = 86_400;
const TIMESTAMP_FUTURE_SECONDS = 300;
const COUNT_MAX = 999;

// The extension rewrites title and body after decrypting; this generic text
// is what iOS shows if that fails, so it must never look alarming.
const FALLBACK_ALERT = { title: "Agentico", body: "Agent update" };
// iOS plays nothing for an alert without a sound, and offers no switch to
// turn one on. With the default sound, Settings > Notifications > Agentico can
// still turn it off. The extension sets the same sound after decrypting.
const ALERT_SOUND = "default";

/** @returns {{teamId: string, keyId: string, p8: string, topic: string} | null} */
export function readApnsConfig(env) {
  const teamId = configString(env.APNS_TEAM_ID);
  const keyId = configString(env.APNS_KEY_ID);
  const p8 = configString(env.APNS_KEY_P8);
  const topic = configString(env.APNS_TOPIC);
  if (teamId === null || keyId === null || p8 === null || topic === null) {
    return null;
  }
  return { teamId, keyId, p8, topic };
}

/**
 * Validate a Live Activity push request body. Envelope is accepted as a
 * non-empty string and never parsed; collapse must be absent.
 *
 * @param {Record<string, unknown>} body
 * @param {number} nowSeconds
 */
function validateActivity(body, nowSeconds) {
  const { token, env, event, priority, timestamp, stale_date, dismissal_date, counts, envelope } =
    body;
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    return { error: "bad_token" };
  }
  if (!APNS_ENVIRONMENTS.has(env)) {
    return { error: "bad_env" };
  }
  if (event !== "update" && event !== "end") {
    return { error: "bad_event" };
  }
  if (!Number.isInteger(priority) || (priority !== 5 && priority !== 10)) {
    return { error: "bad_priority" };
  }
  if (
    !Number.isInteger(timestamp) ||
    timestamp <= 0 ||
    timestamp < nowSeconds - TIMESTAMP_PAST_SECONDS ||
    timestamp > nowSeconds + TIMESTAMP_FUTURE_SECONDS
  ) {
    return { error: "bad_timestamp" };
  }
  if (stale_date !== undefined && (!Number.isInteger(stale_date) || stale_date <= timestamp)) {
    return { error: "bad_stale_date" };
  }
  if (dismissal_date !== undefined && (event !== "end" || !Number.isInteger(dismissal_date))) {
    return { error: "bad_dismissal_date" };
  }
  if (!validCounts(counts)) {
    return { error: "bad_counts" };
  }
  if (priority === 10 && counts.blocked < 1) {
    return { error: "bad_priority" };
  }
  if (typeof envelope !== "string" || envelope.length === 0) {
    return { error: "bad_envelope" };
  }
  if ("collapse" in body) {
    return { error: "bad_collapse" };
  }
  return {
    token,
    environment: env,
    event,
    priority,
    timestamp,
    staleDate: stale_date,
    dismissalDate: dismissal_date,
    counts: { working: counts.working, blocked: counts.blocked, done: counts.done },
    envelope,
  };
}

function validCounts(counts) {
  if (!isPlainObject(counts)) {
    return false;
  }
  const keys = Object.keys(counts);
  if (keys.length !== 3) {
    return false;
  }
  for (const key of ["working", "blocked", "done"]) {
    if (!Object.hasOwn(counts, key)) {
      return false;
    }
    const value = counts[key];
    if (!Number.isInteger(value) || value < 0 || value > COUNT_MAX) {
      return false;
    }
  }
  return true;
}

/**
 * Build the Live Activity APNs JSON body. The envelope string is embedded
 * as a JSON value without parsing so the relay never inspects ciphertext.
 */
function buildLiveActivityApnsBody(activity) {
  const countsJson = JSON.stringify(activity.counts);
  let aps = `"timestamp":${activity.timestamp},"event":${JSON.stringify(activity.event)},"content-state":{"counts":${countsJson},"envelope":${activity.envelope}}`;
  if (activity.staleDate !== undefined) {
    aps += `,"stale-date":${activity.staleDate}`;
  }
  if (activity.dismissalDate !== undefined) {
    aps += `,"dismissal-date":${activity.dismissalDate}`;
  }
  return `{"aps":{${aps}}}`;
}

/**
 * Validate a request and build its APNs request. `kind: "liveactivity"`
 * selects the Live Activity path; anything else is the alert path.
 *
 * @param {unknown} parsed
 * @param {{topic: string}} config
 * @param {number} nowMs
 * @returns {{error: string} | {token: string, url: string, headers: Record<string, string>, body: string, payloadBytes: number}}
 */
export function prepareApnsPush(parsed, config, nowMs) {
  let token;
  let environment;
  let body;
  /** @type {Record<string, string>} */
  let headers;
  if (isPlainObject(parsed) && parsed.kind === "liveactivity") {
    const activity = validateActivity(parsed, Math.floor(nowMs / 1000));
    if ("error" in activity) {
      return activity;
    }
    ({ token, environment } = activity);
    body = buildLiveActivityApnsBody(activity);
    headers = {
      "apns-topic": `${config.topic}.push-type.liveactivity`,
      "apns-push-type": "liveactivity",
      "apns-priority": String(activity.priority),
      "content-type": "application/json",
    };
  } else {
    const push = validateAlertBody(parsed, TOKEN_PATTERN, APNS_ENVIRONMENTS);
    if ("error" in push) {
      return push;
    }
    ({ token, environment } = push);
    body = JSON.stringify({
      aps: { alert: FALLBACK_ALERT, sound: ALERT_SOUND, "mutable-content": 1 },
      envelope: push.envelope,
    });
    headers = {
      "apns-topic": config.topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    };
    if (push.collapse !== undefined) {
      headers["apns-collapse-id"] = push.collapse;
    }
  }
  return {
    token,
    url: `https://${APNS_HOSTS[environment]}/3/device/${token}`,
    headers,
    body,
    payloadBytes: encoder.encode(body).byteLength,
  };
}

/**
 * Sign, forward, and relay Apple's verdict: 200 `{apnsId}`, or Apple's
 * status with `{reason, timestamp?}` (410 Unregistered included).
 *
 * @param {{url: string, headers: Record<string, string>, body: string}} push
 * @param {{teamId: string, keyId: string, p8: string}} config
 * @param {ReturnType<typeof import("./apns-jwt.js").createApnsSigner>} signer
 * @param {number} nowMs
 * @returns {Promise<Response>}
 */
export async function sendApnsPush(push, config, signer, nowMs) {
  let jwt;
  try {
    jwt = await signer.getToken(config, nowMs);
  } catch {
    return json(500, { error: "relay_misconfigured" });
  }

  let apnsResponse;
  try {
    apnsResponse = await fetch(push.url, {
      method: "POST",
      headers: { authorization: `bearer ${jwt}`, ...push.headers },
      body: push.body,
    });
  } catch {
    return json(502, { error: "apns_unreachable" });
  }

  if (apnsResponse.status === 200) {
    return json(200, { apnsId: apnsResponse.headers.get("apns-id") });
  }
  let detail = null;
  try {
    detail = await apnsResponse.json();
  } catch {
    // Non-JSON APNs body; relay the status alone.
  }
  const relayed = {
    reason: typeof detail?.reason === "string" ? detail.reason : null,
  };
  if (typeof detail?.timestamp === "number") {
    relayed.timestamp = detail.timestamp;
  }
  return json(apnsResponse.status, relayed);
}
