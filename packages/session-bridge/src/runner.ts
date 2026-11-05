import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TmuxRunner } from './tmux.js';

const run = promisify(execFile);

/** The real tmux, on the default server or on the named socket. */
export function tmuxRunner(options: { binary?: string; socketName?: string } = {}): TmuxRunner {
  const { binary = 'tmux', socketName } = options;
  const flags = socketName ? ['-L', socketName] : [];
  return { run: async (args) => (await run(binary, [...flags, ...args])).stdout };
}
