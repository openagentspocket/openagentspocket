import { readFileSync } from "node:fs";
import { join } from "node:path";

// The hosted Push Relay. The app carries the same value
// (packages/core/src/notifications/relay-endpoint.ts);
// test-vectors/default-relay-v1.json pins both.
export const DEFAULT_RELAY_URL = "https://relay.openagentspocket.com";

// Endpoints that upstream Heeler shipped as its default. A config still naming
// one is treated as unset, so it migrates to DEFAULT_RELAY_URL instead of
// being honoured as a deliberate override. The loopback address this project
// defaulted to before the hosted relay is not here: it is also what a person
// who runs their own relay on the Host types, and their device tokens must not
// go to another relay unasked. The app rewrites a notify.json an older app
// left on loopback (core `migrateRelayURL`).
export const LEGACY_DEFAULT_RELAY_URLS = new Set([
  "https://herdr-push-relay.69709991236.workers.dev",
  "https://herdr-apns.bybee.dev",
  "https://heeler-apns.bybee.dev",
]);
const DEFAULT_DEBOUNCE_MS = 5000;
const DEFAULT_ACTIVITY_DEBOUNCE_MS = 1500;
const DEFAULT_RETRY_DELAY_MS = 1000;

function normalizeRelayURL(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\/+$/, "");
  if (normalized.length === 0 || LEGACY_DEFAULT_RELAY_URLS.has(normalized)) {
    return null;
  }
  return normalized;
}

/**
 * Read the plugin-side `notify.json`. A missing relay URL, or a retired
 * upstream default, uses the hosted relay; any other explicit URL, loopback
 * included, points elsewhere.
 */
export function readNotificationConfig(configDir) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(join(configDir, "notify.json"), "utf8"));
  } catch {
    parsed = {};
  }
  const positiveInt = (value, fallback) =>
    Number.isInteger(value) && value >= 0 ? value : fallback;
  return {
    relayUrl: normalizeRelayURL(parsed.relay_url) ?? DEFAULT_RELAY_URL,
    debounceMs: positiveInt(parsed.debounce_ms, DEFAULT_DEBOUNCE_MS),
    activityDebounceMs: positiveInt(parsed.activity_debounce_ms, DEFAULT_ACTIVITY_DEBOUNCE_MS),
    retryDelayMs: positiveInt(parsed.retry_delay_ms, DEFAULT_RETRY_DELAY_MS),
  };
}
