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

/**
 * Hermes Agent runs on OpenRouter. STUB: needs the Host owner's API key (see ADR 0025). Without
 * `providers.json` naming a key file, Hermes is not reported at all; with one, the request that
 * would use the key (`GET https://openrouter.ai/api/v1/key`, bearer) is not wired yet.
 */
export const hermesCollector = {
  program: "hermes",
  needs: "apiKey",
  cadenceMs: 5 * 60_000,
  async collect({ configDir }) {
    const config = readProviderConfig(configDir, "hermes");
    if (!config) return null;
    if (!readSecretFile(config.apiKeyFile)) return { state: "unavailable", reason: "notSignedIn" };
    return { state: "unavailable", reason: "notImplemented" };
  },
};
