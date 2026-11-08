// The Live Activity hook pushes a Blocked agent's approval ask, so the activity answers it with
// the app suspended (spec F5).

import { test, suite } from "node:test";
import assert from "node:assert/strict";

import { recordApprovalAsk } from "../src/approval-ask-records.js";
import { approvalEpisodeId } from "../src/approval-preview.js";
import {
  KEY_A,
  PANE_ID,
  h,
  useActivityHarness,
  startFakeRelay,
  writeHerdrStub,
  writeConfig,
  device,
  writeRegistration,
  listedAgent,
  statusEvent,
  runHook,
  decryptEnvelope,
} from "./activity-hook.testkit.js";

useActivityHarness();

suite("activity-hook: approval asks", () => {
  function recordAsk(ts = Math.floor(Date.now() / 1000)) {
    recordApprovalAsk(h.stateDir, PANE_ID, ts, {
      episodeId: approvalEpisodeId(PANE_ID, ts),
      approvable: true,
      denyOnly: false,
      prompt: "Run ls?",
      options: ["Yes", "No"],
    });
    return ts;
  }

  test("a Blocked agent's push carries its ask when the device approves from outside the app", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device({ notify: { blocked: true, done: true, approve: true } })]);
    writeHerdrStub([listedAgent({ status: "blocked", title: "need input" })]);
    const ts = recordAsk();

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    const opened = decryptEnvelope(h.relay.requests[0].body.envelope, KEY_A);
    assert.deepEqual(opened.payload.agents[0].ask, {
      act: 1,
      bid: approvalEpisodeId(PANE_ID, ts),
      opts: ["Yes", "No"],
      q: "Run ls?",
      ts,
    });
  });

  test("without the approve opt-in the push carries no ask", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device()]);
    writeHerdrStub([listedAgent({ status: "blocked", title: "need input" })]);
    recordAsk();

    const result = await runHook(statusEvent("blocked"));

    assert.equal(result.status, 0, result.stderr);
    const opened = decryptEnvelope(h.relay.requests[0].body.envelope, KEY_A);
    assert.equal("ask" in opened.payload.agents[0], false);
  });

  test("an ask recorded after the Blocked push sends one more update, then nothing", async () => {
    await startFakeRelay();
    writeConfig();
    writeRegistration([device({ notify: { blocked: true, done: true, approve: true } })]);
    writeHerdrStub([listedAgent({ status: "blocked", title: "need input" })]);
    assert.equal((await runHook(statusEvent("blocked"))).status, 0);
    assert.equal(h.relay.requests.length, 1);

    recordAsk();
    assert.equal((await runHook(statusEvent("blocked"))).status, 0);
    assert.equal(h.relay.requests.length, 2);
    assert.ok(decryptEnvelope(h.relay.requests[1].body.envelope, KEY_A).payload.agents[0].ask);

    assert.equal((await runHook(statusEvent("blocked"))).status, 0);
    assert.equal(h.relay.requests.length, 2);
  });
});
