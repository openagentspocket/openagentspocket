// Request and response primitives shared by the APNs and FCM paths.

export const encoder = new TextEncoder();

// APNs caps alert-push and live-activity payloads at 4 KB, and FCM caps a
// message's data at 4 KB: one cap for both services.
export const MAX_PAYLOAD_BYTES = 4096;
// APNs caps apns-collapse-id at 64 bytes; FCM collapse keys share the bound.
const MAX_COLLAPSE_ID_BYTES = 64;

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function configString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate an alert push body (the plugin notify hook's shape). Any body that
 * carries a `kind` field is rejected so the discriminator cannot leak onto
 * this path. `tokenPattern` and `environments` are the push service's.
 *
 * @param {unknown} body
 * @param {RegExp} tokenPattern
 * @param {ReadonlySet<string>} environments
 * @returns {{error: string} | {token: string, environment: string, envelope: string, collapse: string|undefined}}
 */
export function validateAlertBody(body, tokenPattern, environments) {
  if (!isPlainObject(body)) {
    return { error: "bad_json" };
  }
  if ("kind" in body) {
    return { error: "bad_kind" };
  }
  const { token, env, envelope, collapse } = body;
  if (typeof token !== "string" || !tokenPattern.test(token)) {
    return { error: "bad_token" };
  }
  if (!environments.has(env)) {
    return { error: "bad_env" };
  }
  if (typeof envelope !== "string" || envelope.length === 0) {
    return { error: "bad_envelope" };
  }
  if (collapse !== undefined) {
    if (
      typeof collapse !== "string" ||
      collapse.length === 0 ||
      encoder.encode(collapse).byteLength > MAX_COLLAPSE_ID_BYTES
    ) {
      return { error: "bad_collapse" };
    }
  }
  return { token, environment: env, envelope, collapse };
}
