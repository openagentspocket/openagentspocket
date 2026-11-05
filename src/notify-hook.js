#!/usr/bin/env node
// Agent Notification notify hook (ADR 0008).
//
// herdr invokes this script through the manifest [[events]] hook on
// pane.agent_status_changed, one short-lived process per event. The flow:
//
//   event JSON ──> debounce sleep ──> re-check status via HERDR_BIN_PATH
//     ──> dedupe per pane (HERDR_PLUGIN_STATE_DIR) ──> read registration file
//     ──> encrypt envelope per device ──> POST to the Push Relay per token
//
// Only Blocked and Done transitions notify; every other confirmed transition
// just re-arms the pane's dedupe marker. A Blocked push to a device that
// opted in with `notify.approve` also carries the approval preview read off
// the Agent's screen (src/approval-preview.js, spec F5), and the hook records
// the same fields for the app's Live Activity (src/approval-ask-records.js,
// R5) until the pane leaves Blocked. herdr's status detection is heuristic
// and can flap, so nothing is sent unless the status still holds after the debounce.
//
// Event JSON shape, captured empirically against a live herdr 0.7.5 (note
// the envelope `event` name is snake_case on the wire even though the
// manifest hook subscribes to the dot name `pane.agent_status_changed`):
//
//   {"event":"pane_agent_status_changed",
//    "data":{"type":"pane_agent_status_changed","pane_id":"wV:p1",
//            "workspace_id":"wV","agent_status":"blocked","agent":"claude"}}
//
// `agent` (and per herdr source: `title`, `display_agent`, `state_labels`)
// are optional; herdr's wire shapes carry no stability guarantee, so parsing
// is lenient — only `data.pane_id` and `data.agent_status` are required and
// unknown fields are ignored.

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import {
  approvalAskRecord,
  clearApprovalAsk,
  hasApprovalAsk,
  pruneApprovalAsks,
  writeApprovalAsk,
} from "./approval-ask-records.js";
import { approvalEpisodeId, approvalScope, extractApprovalPreview } from "./approval-preview.js";
import { readNotificationConfig } from "./notification-config.js";
import { deliverToDevices, NOTIFY_FLAG_BY_STATUS, readEligibleDevices } from "./notify-delivery.js";
import { refreshSidebarSnapshotForEvent } from "./sidebar-config.js";
import { forDisplay, optionalText } from "./display-text.js";
import { hookSession, sessionStateDir } from "./session.js";

// The screen read for the approval preview is a nicety: past this bound the
// push goes without it rather than later.
const SCREEN_READ_TIMEOUT_MS = 1_500;

/** Parse HERDR_PLUGIN_EVENT_JSON leniently: require pane id and status only. */
function parseStatusEvent(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("HERDR_PLUGIN_EVENT_JSON is not JSON");
  }
  const data = parsed?.data;
  const paneId = data?.pane_id;
  const status = data?.agent_status;
  if (typeof paneId !== "string" || paneId.length === 0) {
    throw new Error("event data.pane_id missing");
  }
  if (typeof status !== "string" || status.length === 0) {
    throw new Error("event data.agent_status missing");
  }
  return {
    paneId,
    status: status.toLowerCase(),
    agentKind: optionalText(data.agent),
    workspaceId: optionalText(data.workspace_id),
    title: optionalText(data.title),
  };
}

// Per-pane dedupe state under HERDR_PLUGIN_STATE_DIR: the last status this
// hook actually delivered a push for, cleared once a different status is
// confirmed to hold. Pane ids go through base64url so ids never have to be
// filesystem-safe. `stateDir` is already the session's state directory, so
// panes with the same id in different herdr sessions dedupe independently.
function statePath(stateDir, paneId) {
  return join(stateDir, "notify", `${Buffer.from(paneId, "utf8").toString("base64url")}.json`);
}

function readLastNotified(stateDir, paneId) {
  try {
    const state = JSON.parse(readFileSync(statePath(stateDir, paneId), "utf8"));
    return typeof state?.last_notified_status === "string" ? state.last_notified_status : null;
  } catch {
    return null;
  }
}

function writeLastNotified(stateDir, paneId, status) {
  const path = statePath(stateDir, paneId);
  mkdirSync(join(stateDir, "notify"), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, JSON.stringify({ pane: paneId, last_notified_status: status }));
  renameSync(temp, path);
}

function clearLastNotified(stateDir, paneId) {
  rmSync(statePath(stateDir, paneId), { force: true });
}

/**
 * Run a herdr CLI subcommand and collect its exit code and streams. With
 * `timeoutMs` the child is killed past it and the code reads null.
 */
function runHerdr(binPath, args, { timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer =
      timeoutMs === undefined
        ? null
        : setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, timeoutMs);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: timedOut ? null : code, stdout, stderr });
    });
  });
}

/**
 * Re-check the pane's current Agent Status through the herdr CLI
 * (`herdr agent get <pane>` answers `{"result":{"agent":{"agent_status":...}}}`
 * on the same wire shape as `agent.list`; verified against herdr 0.7.5).
 * Returns null when the agent is gone (`agent_not_found`); any other failure
 * throws, so an un-runnable re-check fails closed instead of notifying blind.
 */
async function currentAgentStatus(binPath, paneId) {
  const result = await runHerdr(binPath, ["agent", "get", paneId]);
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    parsed = null;
  }
  if (result.code !== 0) {
    if (parsed?.error?.code === "agent_not_found") return null;
    throw new Error(
      `status re-check failed (exit ${result.code}): ${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
  const agent = parsed?.result?.agent;
  if (typeof agent?.agent_status !== "string") {
    throw new Error("status re-check returned no agent_status");
  }
  return {
    status: agent.agent_status.toLowerCase(),
    agentKind: optionalText(agent.agent),
    workspaceId: optionalText(agent.workspace_id),
    // Prefer the stripped title: the raw one carries herdr's spinner glyphs.
    title: optionalText(agent.terminal_title_stripped) ?? optionalText(agent.terminal_title),
  };
}

/**
 * Resolve a workspace's display label — the project name the app's alert
 * leads with (`herdr workspace get <id>` answers
 * `{"result":{"workspace":{"label":...}}}`; verified against herdr 0.7.5).
 *
 * Purely decorative, so every failure yields null: a Host that cannot answer
 * still notifies, one step less specific.
 */
async function workspaceLabel(binPath, workspaceId) {
  if (workspaceId === null) return null;
  try {
    const result = await runHerdr(binPath, ["workspace", "get", workspaceId]);
    if (result.code !== 0) return null;
    return optionalText(JSON.parse(result.stdout)?.result?.workspace?.label);
  } catch {
    return null;
  }
}

/**
 * The approval fields for a Blocked push (spec F5): read the Agent's visible
 * screen (`herdr agent read <pane> --source visible --format text`) and
 * extract the prompt and options. The CLI answers with the RPC envelope
 * (`{"result":{"read":{"text":...}}}`); plain text is accepted too. Every
 * failure (no answer within the bound, an error, a screen without numbered
 * options) yields null, and the push goes out without approval fields.
 */
async function approvalFields(binPath, paneId, timestamp) {
  let result;
  try {
    result = await runHerdr(
      binPath,
      ["agent", "read", paneId, "--source", "visible", "--format", "text"],
      { timeoutMs: SCREEN_READ_TIMEOUT_MS },
    );
  } catch {
    return null;
  }
  if (result.code !== 0) return null;
  let text = result.stdout;
  try {
    const parsed = JSON.parse(result.stdout);
    text = parsed?.result?.read?.text;
  } catch {
    // Not JSON: the screen itself.
  }
  const preview = extractApprovalPreview(text);
  if (preview === null) return null;
  const scope = approvalScope(preview);
  return {
    episodeId: approvalEpisodeId(paneId, timestamp),
    approvable: scope !== null,
    denyOnly: scope === "deny",
    prompt: preview.q,
    options: preview.opts,
  };
}

/**
 * Records what this Blocked push asks for the app's Live Activity (spec F5,
 * R5): the fields an opted-in device's push carries, `bid` included, or no
 * record when there are none. Written before the pushes go, since the app
 * reads it over SSH whether or not the relay delivers. A failed write only
 * costs the activity its buttons, never the push.
 */
function recordApprovalAsk(stateDir, paneId, timestamp, approval) {
  try {
    pruneApprovalAsks(stateDir, timestamp);
    const record = approvalAskRecord(paneId, timestamp, approval);
    if (record === null) clearApprovalAsk(stateDir, paneId);
    else writeApprovalAsk(stateDir, record);
  } catch (error) {
    console.error(`notify-hook: approval ask not recorded: ${error.message}`);
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is not set; this script must run as a herdr event hook`);
  }
  return value;
}

async function main() {
  const configDir = requireEnv("HERDR_PLUGIN_CONFIG_DIR");
  refreshSidebarSnapshotForEvent(configDir);
  const eventJson = requireEnv("HERDR_PLUGIN_EVENT_JSON");
  const session = hookSession();
  const stateDir = sessionStateDir(requireEnv("HERDR_PLUGIN_STATE_DIR"), session);
  const binPath = requireEnv("HERDR_BIN_PATH");

  const event = parseStatusEvent(eventJson);
  const timestamp = Math.floor(Date.now() / 1000);
  const config = readNotificationConfig(configDir);
  const notifyWorthy = event.status in NOTIFY_FLAG_BY_STATUS;

  // Cheap exits before burning a 5 s debounce process on a no-op. A pane
  // that holds an approval ask always goes on when it leaves Blocked, so the
  // ask is cleared once the departure is confirmed.
  const lastNotified = readLastNotified(stateDir, event.paneId);
  const leavesAsk = event.status !== "blocked" && hasApprovalAsk(stateDir, event.paneId);
  if (!leavesAsk) {
    if (notifyWorthy && lastNotified === event.status) return; // dedupe
    if (!notifyWorthy && lastNotified === null) return; // nothing to send or re-arm
    if (notifyWorthy && readEligibleDevices(configDir, event.status, session).length === 0) {
      // No device takes this push, so none answers from an older ask.
      if (event.status === "blocked") clearApprovalAsk(stateDir, event.paneId);
      return;
    }
  }
  // Debounce: only a status that still holds after the sleep notifies
  // (or re-arms), so detection flapping never reaches the user.
  await sleep(config.debounceMs);
  const current = await currentAgentStatus(binPath, event.paneId);
  if (current === null) {
    // Agent gone; state is stale.
    clearLastNotified(stateDir, event.paneId);
    clearApprovalAsk(stateDir, event.paneId);
    return;
  }
  if (current.status !== event.status) return; // moved on; a newer event owns it
  if (event.status !== "blocked") clearApprovalAsk(stateDir, event.paneId);

  if (!notifyWorthy) {
    clearLastNotified(stateDir, event.paneId); // confirmed departure re-arms the pane
    return;
  }
  // Re-read both after the sleep: a concurrent invocation may have delivered,
  // and the app may have rewritten the registration file meanwhile.
  if (readLastNotified(stateDir, event.paneId) === event.status) return;
  const devices = readEligibleDevices(configDir, event.status, session);
  if (devices.length === 0) return;

  // The re-check is the fresher read for anything that can change while the
  // debounce sleeps (the title moves with the agent's task); the event is the
  // fallback for whatever it did not carry.
  const workspaceId = current.workspaceId ?? event.workspaceId;
  const payload = {
    paneId: event.paneId,
    agentKind: event.agentKind ?? current.agentKind ?? "unknown",
    status: event.status,
    timestamp,
    project: forDisplay(await workspaceLabel(binPath, workspaceId)),
    title: forDisplay(current.title ?? event.title),
  };
  // `timestamp` is when this hook saw the transition, before the debounce,
  // so every device gets the same episode id for it.
  const approval = devices.some((device) => device.approve)
    ? await approvalFields(binPath, event.paneId, timestamp)
    : null;
  if (event.status === "blocked") recordApprovalAsk(stateDir, event.paneId, timestamp, approval);
  const { delivered, failures } = await deliverToDevices({
    configDir,
    config,
    devices,
    payload,
    approval,
  });
  if (delivered) writeLastNotified(stateDir, event.paneId, event.status);
  if (failures.length > 0) throw new Error(failures.join("; "));
}

main().catch((error) => {
  console.error(`notify-hook: ${error.message}`);
  process.exit(1);
});
