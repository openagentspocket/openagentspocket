// Delivering one Agent Notification (ADR 0008), whatever saw it happen: the
// herdr status hook (src/notify-hook.js) or a program's own hook
// (src/program-hook.js). Reads the Notification Registration, encrypts per
// device and posts to the Push Relay.

import { createHash } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { encryptNotificationEnvelope, encryptWithApprovalFallback } from "./notification-envelope.js";
import { alertPushBody, pushTarget } from "./notify-platform.js";
import { deliversToSession } from "./session.js";

// Statuses that notify (ADR 0008: Working/Idle transitions never do), keyed
// by the registration file's per-device `notify` preference flag they gate on.
export const NOTIFY_FLAG_BY_STATUS = { blocked: "blocked", done: "done" };

const SEND_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const KEY_BYTES = 32;

/**
 * Read the Notification Registration file (`notifications.json`, contract in
 * README.md). Absent, corrupt, or foreign-version files mean "send nothing";
 * a malformed device entry is skipped, never fatal for its neighbors. Only
 * entries delivered to this hook's herdr session count (src/session.js).
 */
export function readEligibleDevices(configDir, status, session) {
  const flag = NOTIFY_FLAG_BY_STATUS[status];
  let file;
  try {
    file = JSON.parse(readFileSync(join(configDir, "notifications.json"), "utf8"));
  } catch {
    return [];
  }
  if (file?.v !== 1 || !Array.isArray(file.devices)) return [];
  const devices = [];
  for (const entry of file.devices) {
    if (typeof entry?.token !== "string" || entry.token.length === 0) continue;
    if (!deliversToSession(entry, session)) continue;
    const target = pushTarget(entry); // APNs or FCM, per the optional `platform`
    if (target === null) continue;
    // Per the v1 contract a missing notify flag means do not send (fail closed).
    if (entry.notify?.[flag] !== true) continue;
    const key = typeof entry.key === "string" ? Buffer.from(entry.key, "base64url") : null;
    if (key?.length !== KEY_BYTES) continue;
    // Approval fields go only to devices that opted in, and only with
    // Blocked; a missing flag means off, like every notify flag.
    const approve = status === "blocked" && entry.notify?.approve === true;
    devices.push({ token: entry.token, ...target, key, approve });
  }
  return devices;
}

/**
 * Drop pruned tokens from the registration file, preserving every field this
 * plugin does not understand (additive v1 metadata must survive the rewrite).
 * Atomic temp-file + rename, like every writer of this file; a concurrent
 * app-side rewrite is last-writer-wins, and the next 410 re-prunes.
 */
function pruneTokens(configDir, tokens) {
  const path = join(configDir, "notifications.json");
  let file;
  try {
    file = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return;
  }
  if (file?.v !== 1 || !Array.isArray(file.devices)) return;
  file.devices = file.devices.filter((entry) => !tokens.has(entry?.token));
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, JSON.stringify(file));
  renameSync(temp, path);
}

/**
 * The `apns-collapse-id` passed through the relay so a newer status replaces
 * an older notification for the same pane. Keyed by the device's Notification
 * Key so it stays opaque: the relay can neither read nor dictionary-guess the
 * pane id behind it. 16 bytes -> 22 chars, well under APNs' 64-byte cap.
 */
function collapseKeyFor(key, paneId) {
  return createHash("sha256")
    .update(key)
    .update("HERDR-NOTIFY-COLLAPSE:")
    .update(paneId, "utf8")
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}

/**
 * POST one push, retrying transient failures (network errors, 429, 5xx) up
 * to SEND_ATTEMPTS. The relay itself never retries by design (ADR 0008).
 * Returns "ok", "pruned" (410 Unregistered from APNs, or FCM's UNREGISTERED
 * as relayed: the token is dead), or a thrown Error for a conclusive failure.
 */
async function postPush(relayUrl, device, envelope, collapse, retryDelayMs) {
  const body = alertPushBody(device, envelope, collapse);
  let lastFailure = "";
  for (let attempt = 1; attempt <= SEND_ATTEMPTS; attempt += 1) {
    if (attempt > 1) await sleep(retryDelayMs);
    let response;
    try {
      response = await fetch(`${relayUrl}/push`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      lastFailure = `relay unreachable: ${error.message}`;
      continue;
    }
    if (response.ok) return "ok";
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    if (response.status === 410) return "pruned";
    lastFailure = `relay answered ${response.status}: ${detail}`;
    if (response.status !== 429 && response.status < 500) break;
  }
  throw new Error(`push for token ${device.token.slice(0, 8)}… failed: ${lastFailure}`);
}

/**
 * Encrypt and push one notification to each device. One device's failure,
 * encryption included, never stops the others. Dead tokens are pruned.
 *
 * @returns {Promise<{delivered: boolean, failures: string[]}>}
 */
export async function deliverToDevices({ configDir, config, devices, payload, approval = null }) {
  const pruned = new Set();
  const failures = [];
  let delivered = false;
  for (const device of devices) {
    try {
      const envelope =
        device.approve && approval !== null
          ? encryptWithApprovalFallback(payload, approval, device.key)
          : encryptNotificationEnvelope(payload, device.key);
      const collapse = collapseKeyFor(device.key, payload.paneId);
      const outcome = await postPush(config.relayUrl, device, envelope, collapse, config.retryDelayMs);
      if (outcome === "ok") delivered = true;
      else pruned.add(device.token);
    } catch (error) {
      failures.push(error.message);
    }
  }
  if (pruned.size > 0) pruneTokens(configDir, pruned);
  return { delivered, failures };
}
