import { readProviderConfig, readSecretFile } from "./config.js";

const DAY = 86_400_000;

/** The next UTC boundary of a key's limit reset: midnight, Monday 00:00 or the first of the month. */
function nextReset(kind, now) {
  const date = new Date(now);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  if (kind === "daily") return midnight + DAY;
  if (kind === "weekly") return midnight + (8 - (date.getUTCDay() || 7)) * DAY;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

const LENGTHS = { daily: 1_440, weekly: 10_080, monthly: 43_200 };
const LABELS = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
const finite = value => Number.isFinite(value) && value >= 0;

/**
 * The windows of an OpenRouter `GET /api/v1/key` answer (`data`): the key's credit limit with its
 * reset period, and the free-model request count of the UTC day. Pure, so it is tested on fixtures.
 */
export function openRouterWindows(data, now = Date.now()) {
  if (data === null || typeof data !== "object") return null;
  const windows = [];
  if (finite(data.limit) && data.limit > 0 && finite(data.limit_remaining)) {
    const kind = LABELS[data.limit_reset] ? data.limit_reset : null;
    windows.push({ id: "credits", label: kind ? LABELS[kind] : "Credits", durationMinutes: kind ? LENGTHS[kind] : null,
      usedPercent: Math.min(100, (data.limit - data.limit_remaining) / data.limit * 100),
      resetsAt: kind ? new Date(nextReset(kind, now)).toISOString() : null, expired: false });
  }
  const free = data.free_model_daily_requests;
  if (free && finite(free.used) && finite(free.limit) && free.limit > 0) {
    windows.push({ id: "freeDaily", label: "Free models", durationMinutes: LENGTHS.daily,
      usedPercent: Math.min(100, free.used / free.limit * 100), resetsAt: new Date(nextReset("daily", now)).toISOString(), expired: false });
  }
  return windows.length ? windows : null;
}

const failed = reason => ({ state: "error", reason });
const MAX_BODY = 256 * 1024;

/** Asks OpenRouter about the key; the key goes in the Authorization header only, never in a result. */
async function readKey(baseUrl, key, timeoutMs, now) {
  let response;
  try {
    response = await fetch(`${baseUrl}/key`, { headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
  } catch (error) {
    return failed(error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "requestFailed");
  }
  if (response.status === 401 || response.status === 403) return { state: "unavailable", reason: "notSignedIn" };
  if (!response.ok) return failed("requestFailed");
  let body;
  try {
    const text = await response.text();
    if (text.length > MAX_BODY) return failed("invalidResponse");
    body = JSON.parse(text);
  } catch (error) {
    return failed(error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "invalidResponse");
  }
  const data = body?.data;
  if (data === null || typeof data !== "object") return failed("invalidResponse");
  const windows = openRouterWindows(data, now());
  // A key with no limit and no free tier has nothing to show.
  if (!windows) return { state: "unavailable", reason: "noPlanLimits" };
  return { state: "ok", source: "service", observedAt: new Date(now()).toISOString(), windows };
}

/**
 * Hermes Agent runs on OpenRouter: the key's credit limit and free-model requests, read with
 * `GET /api/v1/key`. The key comes from the file `providers.json` names (see ADR 0025). Without a
 * `hermes` entry the provider is not reported; an entry whose key file is missing or not private
 * reports it as off. Proxy settings are not applied (Node's fetch ignores them).
 */
export function createHermesCollector({ baseUrl = "https://openrouter.ai/api/v1", timeoutMs = 10_000, now = Date.now } = {}) {
  return {
    program: "hermes",
    needs: "apiKey",
    cadenceMs: 5 * 60_000,
    async collect({ configDir }) {
      const config = readProviderConfig(configDir, "hermes");
      if (!config) return null;
      const key = readSecretFile(config.apiKeyFile);
      if (!key) return { state: "disabled" };
      return readKey(baseUrl, key, timeoutMs, now);
    },
  };
}

export const hermesCollector = createHermesCollector();
