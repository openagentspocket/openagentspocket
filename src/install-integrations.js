// Installs herdr's integration for each program this machine has, so an Agent reports its session
// and Chat can read it. A program without its configuration directory is left alone.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";

const NOT_INSTALLED = /^([\w-]+): not installed \((.+)\)$/;

/** The programs `herdr integration status` lists as not installed whose directory under home exists. */
export function missingIntegrations(status, home = homedir(), exists = existsSync) {
  return status.split("\n").flatMap((line) => {
    const match = NOT_INSTALLED.exec(line.trim());
    if (!match) return [];
    const [, program, path] = match;
    const inHome = relative(home, path).split(sep);
    if (inHome[0] === ".." || inHome.length < 2) return [];
    // `.config/<program>` belongs to that program; `.config` alone says nothing.
    const depth = inHome[0] === ".config" ? 2 : 1;
    return exists(join(home, ...inHome.slice(0, depth))) ? [program] : [];
  });
}

/** Never stops pairing: a program left out only means its Chat waits for a session. */
export function installMissingIntegrations(herdr, run = spawnSync) {
  const status = run(herdr, ["integration", "status"], { encoding: "utf8" });
  if (status.error || status.status !== 0) return [];
  const programs = missingIntegrations(status.stdout ?? "");
  for (const program of programs) {
    run(herdr, ["integration", "install", program], { stdio: "ignore" });
  }
  return programs;
}
