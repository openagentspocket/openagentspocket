import { execFile, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { PaneRecord, TmuxRunner } from './tmux.js';

const run = promisify(execFile);

function readRecords(dir: string): ReadonlyMap<string, PaneRecord> {
  const records = new Map<string, PaneRecord>();
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return records;
  }
  for (const name of names.filter((file) => file.endsWith('.json'))) {
    try {
      const record = JSON.parse(readFileSync(join(dir, name), 'utf8')) as PaneRecord & {
        pane?: string;
      };
      if (record.pane) records.set(record.pane, record);
    } catch {
      // Being replaced right now, or not ours: the next read has it.
    }
  }
  return records;
}

const socketFlags = (socketName: string | undefined) => (socketName ? ['-L', socketName] : []);

/** `-u`: sshd gives the client no UTF-8 locale, and tmux would draw every non-ASCII cell as `_`. */
export const attachArgs = (target: string, socketName?: string) => [
  ...socketFlags(socketName),
  '-u',
  'attach-session',
  '-t',
  target,
];

/** Puts this terminal on `target`, in the server the rest of the bridge reads. */
export function attachClient(
  target: string,
  options: { binary?: string; socketName?: string } = {},
): number {
  const { binary = 'tmux', socketName } = options;
  for (const command of ['select-window', 'select-pane']) {
    spawnSync(binary, [...socketFlags(socketName), command, '-t', target], { stdio: 'ignore' });
  }
  return spawnSync(binary, attachArgs(target, socketName), { stdio: 'inherit' }).status ?? 1;
}

/** The real tmux, on the default server or on the named socket. */
export function tmuxRunner(
  options: { binary?: string; socketName?: string; recordsDir?: string } = {},
): TmuxRunner {
  const { binary = 'tmux', socketName, recordsDir } = options;
  const flags = socketFlags(socketName);
  const runPlain = async (args: readonly string[]) =>
    (await run(binary, [...flags, ...args])).stdout;
  const runWithInput = (args: readonly string[], input: string) =>
    new Promise<string>((resolve, reject) => {
      const child = execFile(binary, [...flags, ...args], (error, stdout) =>
        error ? reject(error) : resolve(stdout),
      );
      child.stdin?.end(input);
    });
  return {
    run: (args, input) => (input === undefined ? runPlain(args) : runWithInput(args, input)),
    records: () => (recordsDir ? readRecords(recordsDir) : new Map()),
  };
}
