import assert from "node:assert/strict";
import { test } from "node:test";
import { installMissingIntegrations, missingIntegrations } from "../src/install-integrations.js";

const STATUS = [
  "pi: not installed (/home/ada/.pi/agent/extensions/state.ts)",
  "claude: not installed (/home/ada/.claude/hooks/state.sh)",
  "codex: current (v3) (/home/ada/.codex/state.sh)",
  "opencode: not installed (/home/ada/.config/opencode/plugins/state.js)",
  "devin: not installed (/home/ada/.config/devin/state.sh)",
  "",
  "Are you an AI? Use these resources",
].join("\n");

const present = new Set(["/home/ada/.claude", "/home/ada/.config/opencode", "/home/ada/.config"]);

test("lists only the programs this machine has", () => {
  const found = missingIntegrations(STATUS, "/home/ada", (path) => present.has(path));
  assert.deepEqual(found, ["claude", "opencode"]);
});

test("skips a path outside home", () => {
  const found = missingIntegrations("x: not installed (/opt/x/hook.sh)", "/home/ada", () => true);
  assert.deepEqual(found, []);
});

test("pairing goes on when herdr cannot report integrations", () => {
  const run = () => ({ status: 1, stdout: "" });
  assert.deepEqual(installMissingIntegrations("herdr", run), []);
});
