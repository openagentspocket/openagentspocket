#!/usr/bin/env node
// The Blocked prompts the Live Activity may answer (spec F5, R5).
//
// The app runs this over SSH exec with the plugin's own node (`runtime-node`),
// HERDR_PLUGIN_CONFIG_DIR and the session's HERDR_SOCKET_PATH exported, the
// way it runs src/approval-apply.js, while an Agent of an opted-in Host is
// Blocked. It takes no arguments: it reads the records the notify hook wrote
// for this herdr session (src/approval-ask-records.js) and
//
//   1. prunes records past the notifications' 30-minute time to live;
//   2. answers nothing, and clears them all, once no device of this session
//      approves from outside the app (`notify.blocked` and `notify.approve`);
//   3. reads each recorded pane once (`herdr agent read --source visible
//      --format text`, bounded, in parallel; pane ids go to herdr as
//      arguments, never through a shell) and keeps only records whose
//      prompt, labels and `act` the screen still shows, clearing the others.
//
// It prints one JSON line, {"v":1,"result":"ok","asks":[...]}, each ask
// {pane, bid, ts, act, q, opts} as the Blocked push carried it, or
// {"v":1,"result":"runtime_missing"} before the hooks recorded the runtime.
// A pane that cannot be read is left out, keeps its record and is named in
// `unread`, a list present only when it has panes: the app must not take a
// failed read for a prompt that went away.

import { spawn } from "node:child_process";

import {
  ASKS_LIMIT,
  approvalsOptedIn,
  clearApprovalAsk,
  clearApprovalAsks,
  pruneApprovalAsks,
  readApprovalAsks,
} from "./approval-ask-records.js";
import { approvalScope, extractApprovalPreview } from "./approval-preview.js";
import { hookSession, sessionStateDir } from "./session.js";
import { readUsageRuntime } from "./usage-runtime.js";

const READ_TIMEOUT_MS = 1_500;

function report(result, extra = {}) {
  process.stdout.write(`${JSON.stringify({ v: 1, result, ...extra })}\n`);
}

/** Runs herdr with a bound; the code reads null past it. */
function runHerdr(binPath, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(binPath, args, { stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut ? null : code, stdout });
    });
  });
}

/**
 * The pane's visible screen: `{screen}` when read, `{gone: true}` when
 * herdr no longer knows its Agent, `{}` when it could not be read.
 */
async function readScreen(binPath, pane) {
  let result;
  try {
    result = await runHerdr(
      binPath,
      ["agent", "read", pane, "--source", "visible", "--format", "text"],
      READ_TIMEOUT_MS,
    );
  } catch {
    return {};
  }
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    // Not JSON: the screen itself, as `--format text` may print it.
  }
  if (result.code !== 0) return parsed?.error?.code === "agent_not_found" ? { gone: true } : {};
  if (parsed === null) return { screen: result.stdout };
  const text = parsed?.result?.read?.text;
  return typeof text === "string" ? { screen: text } : {};
}

/** The `act` a notification would carry for `preview`, or null for none. */
function actFor(preview) {
  const scope = approvalScope(preview);
  if (scope === "approve") return 1;
  if (scope === "deny") return 2;
  return null;
}

/** "shown", "changed" or "unknown" for `record` against its pane now. */
async function standing(binPath, record) {
  const read = await readScreen(binPath, record.pane);
  if (read.gone) return "changed";
  if (typeof read.screen !== "string") return "unknown";
  const preview = extractApprovalPreview(read.screen);
  if (preview === null || preview.q !== record.q) return "changed";
  if (preview.opts.length !== record.opts.length) return "changed";
  if (preview.opts.some((label, index) => label !== record.opts[index])) return "changed";
  return actFor(preview) === record.act ? "shown" : "changed";
}

async function main() {
  const configDir = process.env.HERDR_PLUGIN_CONFIG_DIR;
  const runtime = readUsageRuntime(configDir);
  if (runtime === null) return report("runtime_missing");
  const session = hookSession();
  const stateDir = sessionStateDir(runtime.stateDir, session);
  const now = Math.floor(Date.now() / 1000);
  pruneApprovalAsks(stateDir, now);
  if (!approvalsOptedIn(configDir, session)) {
    clearApprovalAsks(stateDir);
    return report("ok", { asks: [] });
  }
  const records = readApprovalAsks(stateDir, { nowSeconds: now, limit: ASKS_LIMIT });
  const herdr = runtime.herdr ?? "herdr";
  const standings = await Promise.all(records.map((record) => standing(herdr, record)));
  const asks = [];
  const unread = [];
  records.forEach((record, index) => {
    if (standings[index] === "changed") clearApprovalAsk(stateDir, record.pane);
    if (standings[index] === "unknown") unread.push(record.pane);
    if (standings[index] !== "shown") return;
    const { pane, bid, ts, act, q, opts } = record;
    asks.push({ pane, bid, ts, act, q, opts });
  });
  return report("ok", unread.length > 0 ? { asks, unread } : { asks });
}

main().catch(() => {
  report("failed");
  process.exitCode = 1;
});
