import { afterEach, beforeEach, suite, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "smol-toml";

const script = new URL("../install/install.sh", import.meta.url).pathname;
const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const constant = (name) => new RegExp(`^${name}="([^"]*)"`, "m").exec(read("../install/install.sh"))?.[1];

let bin;
beforeEach(() => {
  bin = mkdtempSync(join(tmpdir(), "install-script-"));
});
afterEach(() => rmSync(bin, { recursive: true, force: true }));

function fake(name, body) {
  const path = join(bin, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}

/** Runs `install.sh --dry-run` with only the fakes (and the system tools) on PATH. */
function dryRun({ herdr = "0.9.5", node = "v22.1.0", ssh = true } = {}) {
  if (herdr) fake("herdr", `echo "herdr ${herdr}"`);
  if (node) fake("node", `echo "${node}"`);
  fake("ssh-keyscan", ssh ? 'echo "127.0.0.1 ssh-ed25519 AAAA"' : "exit 0");
  const result = spawnSync("/bin/sh", [script, "--dry-run"], {
    env: { PATH: `${bin}:/usr/bin:/bin` },
    encoding: "utf8",
  });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

suite("install.sh --dry-run", () => {
  test("all good: prints each step, the plugin install and the pair action, changes nothing", () => {
    const { status, out } = dryRun();
    assert.equal(status, 0, out);
    assert.match(out, /\+ herdr plugin install \S+ --ref plugin --yes/);
    assert.match(out, /\+ herdr plugin action invoke agentico\.pair/);
  });

  test("missing herdr stops with the installer to run, without running it", () => {
    const { status, err } = dryRun({ herdr: null });
    assert.equal(status, 1);
    assert.match(err, /herdr is not installed/);
    assert.match(err, /https:\/\/herdr\.dev\/install\.sh/);
  });

  test("old herdr stops with the update step", () => {
    const { status, err } = dryRun({ herdr: "0.7.4" });
    assert.equal(status, 1);
    assert.match(err, /older than 0\.7\.5/);
  });

  test("old Node stops", () => {
    const { status, err } = dryRun({ node: "v18.19.0" });
    assert.equal(status, 1);
    assert.match(err, /Node\.js 18\.19\.0 is older than 20/);
  });

  test("missing Node stops", () => {
    const { status, err } = dryRun({ node: null });
    assert.equal(status, 1);
    assert.match(err, /Node\.js is not installed/);
  });

  test("SSH off stops with the step for this OS", () => {
    const { status, err } = dryRun({ ssh: false });
    assert.equal(status, 1);
    assert.match(err, /Remote Login|openssh-server/);
  });
});

suite("install.sh constants stay in sync", () => {
  const toml = parse(read("../herdr-plugin.toml"));
  const installation = read("../../core/src/hosts/plugin-installation.ts");

  test("version and minimum herdr match herdr-plugin.toml", () => {
    assert.equal(constant("PLUGIN_VERSION"), toml.version);
    assert.equal(constant("MIN_HERDR_VERSION"), toml.min_herdr_version);
    assert.equal(constant("PLUGIN_ID"), toml.id);
  });

  test("repository and ref match the app's install command (core)", () => {
    assert.equal(constant("PLUGIN_REPOSITORY"), /PLUGIN_REPOSITORY = '([^']*)'/.exec(installation)?.[1]);
    assert.equal(constant("PLUGIN_REF"), /PLUGIN_BRANCH = '([^']*)'/.exec(installation)?.[1]);
  });

  test("shellcheck is clean when installed", (t) => {
    const probe = spawnSync("shellcheck", ["--version"]);
    if (probe.error) return t.skip("shellcheck not installed");
    const result = spawnSync("shellcheck", [script], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout);
  });
});
