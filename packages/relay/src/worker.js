// herdr Push Relay (ADR 0008): a stateless forwarder from Hosts to APNs and
// FCM.
//
// One endpoint, POST /push. `platform` picks the push service: absent or
// "ios" is APNs (src/apns.js), "android" is FCM (src/fcm.js). On APNs,
// bodies without `kind` are the original alert path (plugin notify hook):
// device token, APNs environment, encrypted envelope, optional collapse key.
// The relay signs the APNs provider JWT with the deploy-time .p8, wraps the
// envelope verbatim in a mutable-content alert push, forwards it, and relays
// Apple's verdict back — 410 Unregistered included, so the plugin can prune
// dead tokens. `kind: "liveactivity"` is the Live Activity path (see
// docs/agents/live-activity-contract.md): same JWT and host selection, a
// derived `${APNS_TOPIC}.push-type.liveactivity` topic, and an `aps`
// content-state that carries plaintext counts plus the still-opaque
// envelope. The alert path rejects any body that carries a `kind` field.
//
// On FCM, the same alert body (with `env: "fcm"`) becomes an HTTP v1
// data-only message authorized by a service-account access token; FCM's
// UNREGISTERED comes back as the same 410 Unregistered. Live Activities
// stay iOS-only.
//
// No accounts, no database, no queue, no retries (the plugin retries).
// The relay never parses the envelope: it sees ciphertext and a token,
// nothing else. Nothing here may depend on the deployment origin — callers
// can point plugin and app at any base URL.

import { createApnsSigner } from "./apns-jwt.js";
import { prepareApnsPush, readApnsConfig, sendApnsPush } from "./apns.js";
import { encoder, isPlainObject, json, MAX_PAYLOAD_BYTES } from "./common.js";
import { createFcmAuth } from "./fcm-auth.js";
import { prepareFcmPush, readFcmConfig, sendFcmPush } from "./fcm.js";
import { privacyPage } from "./privacy.js";
import { createFixedWindowLimiter } from "./rate-limit.js";

// The request cap just bounds the work spent on garbage before validation.
const MAX_REQUEST_BYTES = 8192;

const DEFAULT_IP_LIMIT_PER_MIN = 120;
const DEFAULT_TOKEN_LIMIT_PER_MIN = 60;

const PLATFORMS = new Set(["ios", "android"]);

function clientIp(request) {
  const connectingIp = request.headers.get("cf-connecting-ip");
  if (connectingIp !== null) {
    return connectingIp;
  }
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null) {
    return forwarded.split(",")[0].trim();
  }
  return "unknown";
}

function limitPerMinute(value, fallback) {
  const limit = Number(value);
  return Number.isInteger(limit) && limit > 0 ? limit : fallback;
}

/** `ios` unless the body names another known platform; null for an unknown one. */
function requestPlatform(parsed) {
  if (!isPlainObject(parsed) || !("platform" in parsed)) {
    return "ios";
  }
  return PLATFORMS.has(parsed.platform) ? parsed.platform : null;
}

function rateLimited(verdict) {
  return json(429, { error: "rate_limited" }, { "retry-after": String(verdict.retryAfterSeconds) });
}

/**
 * Build a relay instance: the fetch handler plus its per-instance JWT and
 * access-token caches and rate-limit windows. Exported so tests get a fresh
 * instance each; the default export below is the one Cloudflare runs.
 */
export function createRelay() {
  const apnsSigner = createApnsSigner();
  const fcmAuth = createFcmAuth();
  const ipLimiter = createFixedWindowLimiter();
  const tokenLimiter = createFixedWindowLimiter();

  return {
    /**
     * @param {Request} request
     * @param {Record<string, string>} env
     * @returns {Promise<Response>}
     */
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === "/privacy" && request.method === "GET") {
        return privacyPage(env);
      }
      if (url.pathname !== "/push") {
        return json(404, { error: "not_found" });
      }
      if (request.method !== "POST") {
        return json(405, { error: "method_not_allowed" }, { allow: "POST" });
      }
      // A relay serves the platforms it holds credentials for, at least one.
      const configs = { ios: readApnsConfig(env), android: readFcmConfig(env) };
      if (configs.ios === null && configs.android === null) {
        return json(500, { error: "relay_misconfigured" });
      }

      const nowMs = Date.now();
      const ipVerdict = ipLimiter.check(
        clientIp(request),
        limitPerMinute(env.RATE_LIMIT_IP_PER_MIN, DEFAULT_IP_LIMIT_PER_MIN),
        nowMs,
      );
      if (!ipVerdict.allowed) {
        return rateLimited(ipVerdict);
      }

      const bodyText = await request.text();
      if (encoder.encode(bodyText).byteLength > MAX_REQUEST_BYTES) {
        return json(413, { error: "request_too_large" });
      }
      let parsed;
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        return json(400, { error: "bad_json" });
      }

      const platform = requestPlatform(parsed);
      if (platform === null) {
        return json(400, { error: "bad_platform" });
      }
      const config = configs[platform];
      if (config === null) {
        return json(500, { error: "relay_misconfigured" });
      }
      const push =
        platform === "android"
          ? prepareFcmPush(parsed, config)
          : prepareApnsPush(parsed, config, nowMs);
      if ("error" in push) {
        return json(400, { error: push.error });
      }

      const tokenVerdict = tokenLimiter.check(
        push.token,
        limitPerMinute(env.RATE_LIMIT_TOKEN_PER_MIN, DEFAULT_TOKEN_LIMIT_PER_MIN),
        nowMs,
      );
      if (!tokenVerdict.allowed) {
        return rateLimited(tokenVerdict);
      }

      if (push.payloadBytes > MAX_PAYLOAD_BYTES) {
        return json(413, { error: "payload_too_large" });
      }

      return platform === "android"
        ? sendFcmPush(push, config, fcmAuth, nowMs)
        : sendApnsPush(push, config, apnsSigner, nowMs);
    },
  };
}

export default createRelay();
