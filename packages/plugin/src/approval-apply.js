#!/usr/bin/env node
// Approve or Deny from a notification, applied on the Host (spec F5).
//
// The app runs this over SSH exec with the plugin's own node (`runtime-node`),
// HERDR_PLUGIN_CONFIG_DIR and the session's HERDR_SOCKET_PATH exported, once
// its own checks passed. Between the app's last read of the screen and its
// key there is an SSH round trip, in which the prompt can be answered at the
// desk or from another device and the next one take its place. This process
// closes that gap on the Host, in one go:
//
//   1. claim the episode (`bid`) with an O_EXCL file under the plugin's state
//      directory, so a second claim from any device fails;
//   2. read the pane (`herdr agent read --source visible --format text`);
//   3. extract the approval preview again (src/approval-preview.js) and
//      require the exact `q` the notification showed, and the exact label of
//      the option the app chose at the same position;
//   4. refuse Approve unless the request may be approved from a notification
//      (`approvalScope`) and the label reads as a one-time Yes, and refuse
//      Deny unless it reads as a No;
//   5. only then press that option's digit (`herdr agent send-keys`).
//
// Nothing is compared loosely: a prompt that wrapped differently, a label
// that moved, or a read past `--within-ms` sends nothing. The app chooses the
// option with its own dialog parser; this side only presses a digit it
// verified, never a key the caller named.
//
// Arguments: --pane <id> --bid <episode id> --ts <unix-seconds>
// --decision approve|deny --option <1-4> --prompt <base64url q>
// --label <base64url label> [--within-ms <ms>]. It prints one JSON line,
// {"v":1,"result":...}, with `keys` when it sent them; see README.md
// ("Approval apply") for the results.

import { closeSync, mkdirSync, openSync, readdirSync, rmSync, statSync, writeSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";

import {
  OPTIONS_LIMIT,
  answerRole,
  approvalEpisodeId,
  approvalScope,
  extractApprovalPreview,
} from "./approval-preview.js";
import { readUsageRuntime } from "./usage-runtime.js";

/** The default bound from start to key; a slower Host sends nothing. */
const WITHIN_MS = 1_500;
const READ_TIMEOUT_MS = 1_500;
const SEND_TIMEOUT_MS = 1_500;
/** Claims outlive every notification that could still act (30 min TTL). */
const CLAIM_RETENTION_MS = 24 * 60 * 60 * 1000;
const EPISODE_ID = /^[A-Za-z0-9_-]{11}$/u;

const started = performance.now();

function report(result, extra = {}) {
  process.stdout.write(`${JSON.stringify({ v: 1, result, ...extra })}\n`);
}

/** The request, or null when any argument is missing or malformed. */
function parseRequest(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        pane: { type: "string" },
        bid: { type: "string" },
        ts: { type: "string" },
        decision: { type: "string" },
        option: { type: "string" },
        prompt: { type: "string" },
        label: { type: "string" },
        "within-ms": { type: "string" },
      },
      allowPositionals: false,
    }));
  } catch {
    return null;
  }
  const { pane, bid, decision } = values;
  const ts = Number(values.ts);
  const option = Number(values.option);
  const withinMs = values["within-ms"] === undefined ? WITHIN_MS : Number(values["within-ms"]);
  const prompt = values.prompt === undefined ? "" : Buffer.from(values.prompt, "base64url").toString("utf8");
  const label = values.label === undefined ? "" : Buffer.from(values.label, "base64url").toString("utf8");
  if (typeof pane !== "string" || pane.length === 0) return null;
  if (!Number.isInteger(ts) || ts <= 0) return null;
  // The id names this pane's episode, so a claim can only spend its own.
  if (typeof bid !== "string" || !EPISODE_ID.test(bid) || approvalEpisodeId(pane, ts) !== bid) return null;
  if (decision !== "approve" && decision !== "deny") return null;
  if (!Number.isInteger(option) || option < 1 || option > OPTIONS_LIMIT) return null;
  if (!Number.isInteger(withinMs) || withinMs <= 0) return null;
  if (prompt.length === 0 || label.length === 0) return null;
  return { pane, bid, ts, decision, option, prompt, label, withinMs };
}

/** Drops claims past retention; best effort, a failure keeps them. */
function pruneClaims(directory) {
  let names;
  try {
    names = readdirSync(directory);
  } catch {
    return;
  }
  const cutoff = Date.now() - CLAIM_RETENTION_MS;
  for (const name of names) {
    try {
      const path = join(directory, name);
      if (statSync(path).mtimeMs < cutoff) rmSync(path, { force: true });
    } catch {
      // Another process pruned it first.
    }
  }
}

/**
 * Spends `request.bid` on this Host: true for the first claim, false once
 * any device claimed it. O_EXCL makes the check and the write one step.
 */
function claim(stateDir, request) {
  const directory = join(stateDir, "approvals");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  pruneClaims(directory);
  let descriptor;
  try {
    descriptor = openSync(join(directory, `${request.bid}.json`), "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
  try {
    writeSync(
      descriptor,
      JSON.stringify({ pane: request.pane, ts: request.ts, decision: request.decision, claimed_at: Date.now() }),
    );
  } finally {
    closeSync(descriptor);
  }
  return true;
}

/** Runs herdr with a bound; the code reads null past it. */
function runHerdr(binPath, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(binPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.resume();
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

/** The pane's visible screen as text, or null when it cannot be read. */
async function readScreen(binPath, pane) {
  let result;
  try {
    result = await runHerdr(
      binPath,
      ["agent", "read", pane, "--source", "visible", "--format", "text"],
      READ_TIMEOUT_MS,
    );
  } catch {
    return null;
  }
  if (result.code !== 0) return null;
  try {
    const text = JSON.parse(result.stdout)?.result?.read?.text;
    return typeof text === "string" ? text : null;
  } catch {
    // Not JSON: the screen itself, as `--format text` may print it.
    return result.stdout;
  }
}

/** Why the screen does not show what the notification did, or null. */
function mismatch(request, preview) {
  if (preview === null || preview.q !== request.prompt) return "prompt_changed";
  if (preview.opts[request.option - 1] !== request.label) return "option_changed";
  const role = answerRole(request.label);
  if (request.decision === "deny") return role === "decline" ? null : "option_changed";
  if (approvalScope(preview) !== "approve") return "deny_only";
  return role === "approve" ? null : "option_changed";
}

async function main() {
  const request = parseRequest(process.argv.slice(2));
  if (request === null) return report("bad_request");
  const runtime = readUsageRuntime(process.env.HERDR_PLUGIN_CONFIG_DIR);
  if (runtime === null) return report("runtime_missing");
  const herdr = runtime.herdr ?? "herdr";
  if (performance.now() - started > request.withinMs) return report("too_slow");
  if (!claim(runtime.stateDir, request)) return report("claimed");
  const screen = await readScreen(herdr, request.pane);
  if (screen === null) return report("unreadable");
  const refusal = mismatch(request, extractApprovalPreview(screen));
  if (refusal !== null) return report(refusal);
  // The read and the key are a few milliseconds apart here, not a round
  // trip; past the bound the read is too old to trust.
  if (performance.now() - started > request.withinMs) return report("too_slow");
  const keys = [String(request.option)];
  let sent;
  try {
    sent = await runHerdr(herdr, ["agent", "send-keys", request.pane, ...keys], SEND_TIMEOUT_MS);
  } catch {
    return report("send_failed");
  }
  if (sent.code !== 0) return report("send_failed");
  return report("sent", { keys });
}

main().catch(() => {
  // Past the claim the key may or may not have gone; the app says so.
  report("failed");
  process.exitCode = 1;
});
