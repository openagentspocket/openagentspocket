// What a program's hooks know about the pane they run in: which Agent, its
// session and its status. tmux knows none of it, so the session bridge reads
// these files (packages/session-bridge) to report the Agent as herdr would.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const recordPath = (configDir, paneId) =>
  join(configDir, "panes", `${Buffer.from(paneId, "utf8").toString("base64url")}.json`);

/** Merges `fields` into the pane's record; a field left null keeps what was known. */
export function writePaneRecord(configDir, paneId, fields) {
  const path = recordPath(configDir, paneId);
  let current = {};
  try {
    current = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    // A first event, or a record that no longer reads.
  }
  const known = Object.fromEntries(Object.entries(fields).filter(([, value]) => value != null));
  mkdirSync(join(configDir, "panes"), { recursive: true, mode: 0o700 });
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, JSON.stringify({ ...current, ...known, pane: paneId }));
  renameSync(temp, path);
}

/** What `paneInDirectory` reads: tmux's pane id, foreground command and directory, one per line. */
export const PANE_LIST_FORMAT = "#{pane_id}\t#{pane_current_command}\t#{pane_current_path}";

/**
 * The pane running `program` in `directory`, for a hook outside any pane: an OpenCode plugin runs
 * in its background service, not in the terminal that shows the Agent. Two candidates are no
 * answer: a wrong pane would send the phone to, and approve in, the wrong Agent.
 */
export function paneInDirectory(listing, program, directory) {
  const matches = listing
    .split("\n")
    .map((line) => line.split("\t"))
    .filter(([, command, path]) => command === program && path === directory);
  return matches.length === 1 ? matches[0][0] : null;
}
