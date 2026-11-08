// Approval asks for the Live Activity (spec F5, R5).
//
// A Live Activity updated by the app has no Blocked notification to take its
// prompt from, so the hook that pushes it records, per pane, the approval
// fields it just sent: the same `bid`, `ts`, `act`, `q` and `opts`. That is
// the notify hook under herdr and src/program-hook.js on tmux. The app reads them
// back over SSH exec (src/approval-asks.js) while the Agent stays Blocked,
// and its Approve or Deny then goes through src/approval-apply.js like a
// notification's.
//
// One file per pane, `approval-asks/<base64url pane>.json` under the
// session's state directory (src/session.js), written 0600 with a temp file
// and a rename. The hook writes it only when a device of this session opted
// in to approvals (`notify.approve`), exactly when its push carries the
// fields, and clears it once the pane leaves Blocked. The reader drops it
// once the screen shows another prompt. Records past the notifications' time
// to live are pruned on every write and read.

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { approvalEpisodeId } from "./approval-preview.js";
import { deliversToSession } from "./session.js";

export const ASK_DIRECTORY = "approval-asks";
/** The notifications' time to live: the app answers nothing older. */
export const ASK_TTL_SECONDS = 30 * 60;
/** At most this many asks are read back, newest first. */
export const ASKS_LIMIT = 8;
// The notification envelope's ceilings (src/notification-envelope.js).
const FIELD_MAX = 256;
const OPTIONS_MAX = 4;
// A record is a few hundred bytes; anything far larger is not one.
const RECORD_BYTES_MAX = 8 * 1024;
const EPISODE_ID = /^[A-Za-z0-9_-]{11}$/u;
const RECORD_NAME = /^[A-Za-z0-9_-]+\.json$/u;

function directory(stateDir) {
  return join(stateDir, ASK_DIRECTORY);
}

function recordPath(stateDir, paneId) {
  return join(directory(stateDir), `${Buffer.from(paneId, "utf8").toString("base64url")}.json`);
}

function isText(value) {
  return typeof value === "string" && value.length > 0 && value.length <= FIELD_MAX;
}

/**
 * The record for a pane's approval fields, or null when they offer no
 * answer or would not pass the envelope's checks (the push then goes
 * without them too).
 *
 * @param {string} paneId
 * @param {number} timestamp unix-seconds of the transition, which `bid` hashes
 * @param {{episodeId: string, approvable: boolean, denyOnly: boolean, prompt: string, options: string[]} | null} approval
 *   the notify hook's approval fields
 */
export function approvalAskRecord(paneId, timestamp, approval) {
  if (approval === null || approval.approvable !== true) return null;
  const record = {
    v: 1,
    pane: paneId,
    bid: approval.episodeId,
    ts: timestamp,
    act: approval.denyOnly ? 2 : 1,
    q: approval.prompt,
    opts: approval.options,
  };
  return isValidRecord(record) ? record : null;
}

function isValidRecord(record) {
  return (
    record?.v === 1 &&
    typeof record.pane === "string" &&
    record.pane.length > 0 &&
    Number.isInteger(record.ts) &&
    record.ts > 0 &&
    typeof record.bid === "string" &&
    EPISODE_ID.test(record.bid) &&
    approvalEpisodeId(record.pane, record.ts) === record.bid &&
    (record.act === 1 || record.act === 2) &&
    isText(record.q) &&
    Array.isArray(record.opts) &&
    record.opts.length > 0 &&
    record.opts.length <= OPTIONS_MAX &&
    record.opts.every(isText)
  );
}

/** Replaces the pane's record atomically: a reader sees the old one or the new one. */
export function writeApprovalAsk(stateDir, record) {
  mkdirSync(directory(stateDir), { recursive: true, mode: 0o700 });
  const path = recordPath(stateDir, record.pane);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(record), { mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function clearApprovalAsk(stateDir, paneId) {
  rmSync(recordPath(stateDir, paneId), { force: true });
}

/**
 * Records what a Blocked push asks: the fields an opted-in device's push
 * carries, `bid` included, or no record when there are none. A hook calls it
 * before the pushes go, since the app reads it over SSH whether or not the
 * relay delivers. A failed write only costs the activity its buttons, never
 * the push.
 *
 * @param {string} stateDir the session's state directory
 * @param {string} paneId
 * @param {number} timestamp unix-seconds of the transition, which `bid` hashes
 * @param {object | null} approval the hook's approval fields (approvalAskRecord)
 */
export function recordApprovalAsk(stateDir, paneId, timestamp, approval) {
  try {
    pruneApprovalAsks(stateDir, timestamp);
    const record = approvalAskRecord(paneId, timestamp, approval);
    if (record === null) clearApprovalAsk(stateDir, paneId);
    else writeApprovalAsk(stateDir, record);
  } catch (error) {
    console.error(`approval ask not recorded: ${error.message}`);
  }
}

/** clearApprovalAsk for a hook that goes on: the reader and the time to live catch a failure. */
export function forgetApprovalAsk(stateDir, paneId) {
  try {
    clearApprovalAsk(stateDir, paneId);
  } catch (error) {
    console.error(`approval ask not cleared: ${error.message}`);
  }
}

/** Drops every record of the session, as when no device approves any more. */
export function clearApprovalAsks(stateDir) {
  rmSync(directory(stateDir), { recursive: true, force: true });
}

export function hasApprovalAsk(stateDir, paneId) {
  try {
    return statSync(recordPath(stateDir, paneId)).isFile();
  } catch {
    return false;
  }
}

/** The record in `name`, or null when it is not a well-formed one for that file. */
function readRecord(stateDir, name) {
  const path = join(directory(stateDir), name);
  try {
    if (statSync(path).size > RECORD_BYTES_MAX) return null;
    const record = JSON.parse(readFileSync(path, "utf8"));
    if (!isValidRecord(record)) return null;
    return name === `${Buffer.from(record.pane, "utf8").toString("base64url")}.json` ? record : null;
  } catch {
    return null;
  }
}

function recordNames(stateDir) {
  try {
    return readdirSync(directory(stateDir));
  } catch {
    return [];
  }
}

/**
 * Removes records past the time to live, malformed ones, and temp files a
 * crashed writer left; best effort, a failure keeps them.
 *
 * @param {string} stateDir the session's state directory
 * @param {number} nowSeconds
 */
export function pruneApprovalAsks(stateDir, nowSeconds) {
  for (const name of recordNames(stateDir)) {
    const path = join(directory(stateDir), name);
    try {
      if (!RECORD_NAME.test(name)) {
        if (statSync(path).mtimeMs < (nowSeconds - ASK_TTL_SECONDS) * 1000) rmSync(path, { force: true });
        continue;
      }
      const record = readRecord(stateDir, name);
      if (record === null || nowSeconds - record.ts > ASK_TTL_SECONDS) rmSync(path, { force: true });
    } catch {
      // Another process pruned it first.
    }
  }
}

/**
 * The live records, newest first, at most `limit`. Expired or malformed
 * ones are skipped (pruneApprovalAsks removes them).
 *
 * @param {string} stateDir the session's state directory
 * @param {{nowSeconds: number, limit?: number}} options
 */
export function readApprovalAsks(stateDir, { nowSeconds, limit = ASKS_LIMIT }) {
  const records = [];
  for (const name of recordNames(stateDir)) {
    if (!RECORD_NAME.test(name)) continue;
    const record = readRecord(stateDir, name);
    if (record === null || nowSeconds - record.ts > ASK_TTL_SECONDS) continue;
    records.push(record);
  }
  records.sort((a, b) => b.ts - a.ts || (a.pane < b.pane ? -1 : a.pane > b.pane ? 1 : 0));
  return records.slice(0, limit);
}

/**
 * Whether a device of `session` still approves from outside the app: an
 * entry this session delivers to with both `notify.blocked` and
 * `notify.approve`, the flags the hook's approval fields need.
 */
export function approvalsOptedIn(configDir, session) {
  let file;
  try {
    file = JSON.parse(readFileSync(join(configDir, "notifications.json"), "utf8"));
  } catch {
    return false;
  }
  if (file?.v !== 1 || !Array.isArray(file.devices)) return false;
  return file.devices.some(
    (entry) =>
      deliversToSession(entry, session) && entry?.notify?.blocked === true && entry.notify.approve === true,
  );
}

/**
 * The asks recorded for panes still Blocked, when a device of `session` approves from outside the
 * app: the fields its Blocked notification carried, so a Live Activity pushed by the Host answers
 * them with the app suspended. `key` changes when an ask comes or goes. The app reads the screen
 * again before it answers.
 */
export function standingApprovalAsks(configDir, session, stateDir, statuses) {
  const asks = new Map();
  if (approvalsOptedIn(configDir, session)) {
    for (const record of readApprovalAsks(stateDir, { nowSeconds: Math.floor(Date.now() / 1000) })) {
      if (statuses[record.pane] === "blocked") asks.set(record.pane, record);
    }
  }
  const key = [...asks.values()].map((ask) => `${ask.pane}:${ask.bid}`).sort().join(",");
  return { asks, key };
}
