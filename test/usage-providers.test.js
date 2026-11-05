import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { reportFromSnapshot } from "../src/usage/buckets.js";
import { collectProviderLimits, COLLECTORS } from "../src/usage/providers/index.js";
import { openRouterWindows, hermesCollector } from "../src/usage/providers/openrouter.js";
import { readSecretFile } from "../src/usage/providers/config.js";

const NOW = Date.parse("2026-11-04T15:00:00Z"); // a Wednesday

test("OpenRouter's key answer becomes limit windows", () => {
  const windows = openRouterWindows({ limit: 50, limit_remaining: 20, limit_reset: "weekly",
    free_model_daily_requests: { used: 10, limit: 50, remaining: 40 } }, NOW);
  assert.deepEqual(windows.map(w => [w.id, w.label, w.usedPercent, w.resetsAt]), [
    ["credits", "Weekly", 60, "2026-11-09T00:00:00.000Z"],
    ["freeDaily", "Free models", 20, "2026-11-05T00:00:00.000Z"],
  ]);
  assert.equal(openRouterWindows({ limit: null, limit_remaining: null }, NOW), null);
  assert.equal(openRouterWindows({ limit: 10, limit_remaining: 10, limit_reset: "monthly" }, NOW)[0].resetsAt, "2026-12-01T00:00:00.000Z");
});

test("a secret file must be absolute and private to its owner", t => {
  const root = mkdtempSync(join(tmpdir(), "agentico-providers-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const key = join(root, "key");
  writeFileSync(key, "sk-test\n", { mode: 0o600 });
  assert.equal(readSecretFile(key), "sk-test");
  chmodSync(key, 0o644);
  assert.equal(readSecretFile(key), null);
  assert.equal(readSecretFile("relative/key"), null);
});

test("Hermes is absent until the Host names a key file, and stops at the stub with one", async t => {
  const root = mkdtempSync(join(tmpdir(), "agentico-providers-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(await hermesCollector.collect({ configDir: root }), null);
  const key = join(root, "key");
  writeFileSync(key, "sk-test", { mode: 0o600 });
  writeFileSync(join(root, "providers.json"), JSON.stringify({ hermes: { apiKeyFile: key } }));
  assert.equal((await hermesCollector.collect({ configDir: root })).reason, "notImplemented");
});

test("collectors keep their cadence and a failing one reports a failed reading", async () => {
  let calls = 0;
  const collectors = [
    { program: "a", cadenceMs: 1000, collect: async () => { calls++; return { state: "ok", windows: [] }; } },
    { program: "b", cadenceMs: 1000, collect: async () => { throw new Error("boom"); } },
    { program: "c", cadenceMs: 1000, collect: async () => null },
  ];
  const first = await collectProviderLimits({ configDir: "/x", collectors, now: NOW });
  assert.deepEqual(Object.keys(first), ["a", "b"]);
  assert.equal(first.b.report.reason, "requestFailed");
  const second = await collectProviderLimits({ configDir: "/x", collectors, previous: first, now: NOW + 500 });
  assert.equal(calls, 1);
  assert.equal(second.a, first.a);
  await collectProviderLimits({ configDir: "/x", collectors, previous: first, now: NOW + 1500 });
  assert.equal(calls, 2);
});

test("an unconfigured Host reports no extra providers; a collected one is a limits-only program", async () => {
  const none = await collectProviderLimits({ configDir: "/nonexistent", now: NOW });
  assert.deepEqual(none, {});
  assert.ok(COLLECTORS.every(c => typeof c.program === "string" && typeof c.collect === "function"));
  const report = reportFromSnapshot({ complete: true, buckets: [], usageLimits: { providers: { hermes: { state: "ok", windows: [
    { id: "credits", label: "Weekly", durationMinutes: 10080, usedPercent: 60, resetsAt: "2026-11-09T00:00:00.000Z", expired: false }] } } } },
  "UTC", false, NOW, false, { accounts: [], suggestions: [] });
  const hermes = report.programs.find(p => p.program === "hermes");
  assert.equal(hermes.usageLimits.windows[0].usedPercent, 60);
  assert.equal(hermes.tokenUsage.state, "unavailable");
  assert.deepEqual(report.programs.map(p => p.program), ["claude", "codex", "hermes"]);
});
