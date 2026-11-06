import { execFile } from 'node:child_process';
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

/** The real tmux, on the default server or on the named socket. */
export function tmuxRunner(
  options: { binary?: string; socketName?: string; recordsDir?: string } = {},
): TmuxRunner {
  const { binary = 'tmux', socketName, recordsDir } = options;
  const flags = socketName ? ['-L', socketName] : [];
  return {
    run: async (args) => (await run(binary, [...flags, ...args])).stdout,
    records: () => (recordsDir ? readRecords(recordsDir) : new Map()),
  };
}
