// Tests for the Live Activity's approval ask records (spec F5, R5): the
// per-pane files the notify hook writes and src/approval-asks.js reads back.

import { test, suite, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ASK_DIRECTORY,
  ASK_TTL_SECONDS,
  approvalAskRecord,
  approvalsOptedIn,
  clearApprovalAsk,
  clearApprovalAsks,
  hasApprovalAsk,
  pruneApprovalAsks,
  readApprovalAsks,
  writeApprovalAsk,
} from "../src/approval-ask-records.js";
import { approvalEpisodeId } from "../src/approval-preview.js";

const NOW = 1_753_305_600;

let home;
let stateDir;
let configDir;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "approval-ask-records-"));
  stateDir = join(home, "state");
  configDir = join(home, "config");
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(configDir, { recursive: true });
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

/** The notify hook's approval fields for `pane` at `ts`. */
function approval(pane, ts, { denyOnly = false, approvable = true, prompt = "npm test Do you want to proceed?" } = {}) {
  return {
    episodeId: approvalEpisodeId(pane, ts),
    approvable,
    denyOnly,
    prompt,
    options: ["Yes", "Yes, and don't ask again for npm test c…", "No"],
  };
}

function record(pane, ts, options) {
  return approvalAskRecord(pane, ts, approval(pane, ts, options));
}

const fileOf = (pane) => join(stateDir, ASK_DIRECTORY, `${Buffer.from(pane, "utf8").toString("base64url")}.json`);

suite("approval ask records: the record", () => {
  test("carries the push's episode, time, act, prompt and labels", () => {
    assert.deepEqual(record("w1:p2", NOW), {
      v: 1,
      pane: "w1:p2",
      bid: approvalEpisodeId("w1:p2", NOW),
      ts: NOW,
      act: 1,
      q: "npm test Do you want to proceed?",
      opts: ["Yes", "Yes, and don't ask again for npm test c…", "No"],
    });
    assert.equal(record("w1:p2", NOW, { denyOnly: true }).act, 2);
  });

  test("is null without fields, without an answer, or with fields the envelope refuses", () => {
    assert.equal(approvalAskRecord("w1:p2", NOW, null), null);
    assert.equal(record("w1:p2", NOW, { approvable: false }), null);
    assert.equal(record("w1:p2", NOW, { prompt: "x".repeat(257) }), null);
    assert.equal(approvalAskRecord("w1:p2", NOW, { ...approval("w1:p2", NOW), options: [] }), null);
    // An episode id of another pane or time never binds this one.
    assert.equal(approvalAskRecord("w1:p2", NOW, approval("w1:p3", NOW)), null);
  });
});

suite("approval ask records: write, read, clear", () => {
  test("a written record reads back, private to the user", () => {
    writeApprovalAsk(stateDir, record("w1:p2", NOW));

    assert.equal(hasApprovalAsk(stateDir, "w1:p2"), true);
    assert.deepEqual(readApprovalAsks(stateDir, { nowSeconds: NOW }), [record("w1:p2", NOW)]);
    assert.equal(statSync(fileOf("w1:p2")).mode & 0o777, 0o600);
    assert.equal(statSync(join(stateDir, ASK_DIRECTORY)).mode & 0o777, 0o700);
    // Nothing but the record is left behind.
    assert.deepEqual(readdirSync(join(stateDir, ASK_DIRECTORY)).length, 1);
  });

  test("a newer prompt replaces the pane's record; clearing removes it", () => {
    writeApprovalAsk(stateDir, record("w1:p2", NOW));
    writeApprovalAsk(stateDir, record("w1:p2", NOW + 60, { prompt: "rm -rf build Do you want to proceed?" }));

    const asks = readApprovalAsks(stateDir, { nowSeconds: NOW + 60 });
    assert.equal(asks.length, 1);
    assert.equal(asks[0].ts, NOW + 60);
    assert.equal(asks[0].q, "rm -rf build Do you want to proceed?");

    clearApprovalAsk(stateDir, "w1:p2");
    assert.equal(hasApprovalAsk(stateDir, "w1:p2"), false);
    assert.deepEqual(readApprovalAsks(stateDir, { nowSeconds: NOW + 60 }), []);
    // Clearing what is not there is fine.
    clearApprovalAsk(stateDir, "w1:p2");
  });

  test("pane ids with path characters stay inside the directory", () => {
    writeApprovalAsk(stateDir, record("../../evil/p1", NOW));

    assert.deepEqual(readdirSync(stateDir), [ASK_DIRECTORY]);
    assert.equal(readApprovalAsks(stateDir, { nowSeconds: NOW })[0].pane, "../../evil/p1");
  });

  test("reads newest first, at most the limit", () => {
    for (let index = 0; index < 5; index += 1) writeApprovalAsk(stateDir, record(`w1:p${index}`, NOW + index));

    const asks = readApprovalAsks(stateDir, { nowSeconds: NOW + 10, limit: 3 });
    assert.deepEqual(asks.map((ask) => ask.pane), ["w1:p4", "w1:p3", "w1:p2"]);
  });

  test("malformed, misplaced and oversized files are skipped", () => {
    writeApprovalAsk(stateDir, record("w1:p2", NOW));
    const directory = join(stateDir, ASK_DIRECTORY);
    writeFileSync(join(directory, "garbage.json"), "{not json");
    // A valid record under another pane's file name.
    writeFileSync(fileOf("w1:p9"), JSON.stringify(record("w1:p3", NOW)));
    // A forged episode id.
    writeFileSync(fileOf("w1:p4"), JSON.stringify({ ...record("w1:p4", NOW), bid: "AAAAAAAAAAA" }));
    writeFileSync(fileOf("w1:p5"), JSON.stringify({ ...record("w1:p5", NOW), pad: "x".repeat(9_000) }));

    assert.deepEqual(readApprovalAsks(stateDir, { nowSeconds: NOW }).map((ask) => ask.pane), ["w1:p2"]);
  });

  test("clearing the session drops every record", () => {
    writeApprovalAsk(stateDir, record("w1:p2", NOW));
    writeApprovalAsk(stateDir, record("w1:p3", NOW));

    clearApprovalAsks(stateDir);

    assert.deepEqual(readApprovalAsks(stateDir, { nowSeconds: NOW }), []);
  });
});

suite("approval ask records: time to live", () => {
  test("a record past 30 minutes is not read and is pruned", () => {
    writeApprovalAsk(stateDir, record("w1:p2", NOW));
    writeApprovalAsk(stateDir, record("w1:p3", NOW + 120));
    const later = NOW + ASK_TTL_SECONDS + 60;

    assert.deepEqual(readApprovalAsks(stateDir, { nowSeconds: later }).map((ask) => ask.pane), ["w1:p3"]);
    pruneApprovalAsks(stateDir, later);

    assert.equal(hasApprovalAsk(stateDir, "w1:p2"), false);
    assert.equal(hasApprovalAsk(stateDir, "w1:p3"), true);
  });

  test("pruning removes malformed records and stale temp files, keeps fresh ones", () => {
    writeApprovalAsk(stateDir, record("w1:p2", NOW));
    const directory = join(stateDir, ASK_DIRECTORY);
    writeFileSync(join(directory, "garbage.json"), "{not json");
    const staleTemp = join(directory, "x.json.1.tmp");
    const freshTemp = join(directory, "y.json.2.tmp");
    writeFileSync(staleTemp, "{}");
    writeFileSync(freshTemp, "{}");
    const old = (NOW - ASK_TTL_SECONDS - 60) * 1000;
    utimesSync(staleTemp, new Date(old), new Date(old));
    utimesSync(freshTemp, new Date(NOW * 1000), new Date(NOW * 1000));

    pruneApprovalAsks(stateDir, NOW);

    assert.deepEqual(readdirSync(directory).sort(), [
      `${Buffer.from("w1:p2", "utf8").toString("base64url")}.json`,
      "y.json.2.tmp",
    ]);
  });

  test("pruning a session without records is a no-op", () => {
    pruneApprovalAsks(stateDir, NOW);
    assert.deepEqual(readdirSync(stateDir), []);
  });
});

suite("approval ask records: opt-in", () => {
  function writeRegistration(devices) {
    writeFileSync(join(configDir, "notifications.json"), JSON.stringify({ v: 1, devices }));
  }

  test("needs an entry of the session with Blocked and approve on", () => {
    writeRegistration([{ token: "t", notify: { blocked: true, approve: true } }]);
    assert.equal(approvalsOptedIn(configDir, ""), true);

    writeRegistration([{ token: "t", notify: { blocked: true, approve: false } }]);
    assert.equal(approvalsOptedIn(configDir, ""), false);

    writeRegistration([{ token: "t", notify: { blocked: false, approve: true } }]);
    assert.equal(approvalsOptedIn(configDir, ""), false);
  });

  test("follows the session delivery rule", () => {
    writeRegistration([{ token: "t", session: "work", notify: { blocked: true, approve: true } }]);

    assert.equal(approvalsOptedIn(configDir, "work"), true);
    assert.equal(approvalsOptedIn(configDir, ""), false);
    assert.equal(approvalsOptedIn(configDir, null), false);
  });

  test("a missing, corrupt or foreign file opts nothing in", () => {
    assert.equal(approvalsOptedIn(configDir, ""), false);
    writeFileSync(join(configDir, "notifications.json"), "{");
    assert.equal(approvalsOptedIn(configDir, ""), false);
    writeFileSync(
      join(configDir, "notifications.json"),
      JSON.stringify({ v: 2, devices: [{ notify: { blocked: true, approve: true } }] }),
    );
    assert.equal(approvalsOptedIn(configDir, ""), false);
  });
});
