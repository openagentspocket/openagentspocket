import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from './main.js';

/** `herdr agent attach` against a `tmux` on PATH that only writes down how it was called. */
describe('attach', () => {
  let dir: string;
  const calls = () => readFileSync(join(dir, 'calls'), 'utf8').trim().split('\n');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'oap-attach-'));
    const tmux = join(dir, 'tmux');
    writeFileSync(tmux, `#!/bin/sh\necho "$*" >> '${join(dir, 'calls')}'\n`);
    chmodSync(tmux, 0o755);
    vi.stubEnv('PATH', `${dir}${delimiter}${process.env.PATH}`);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it('goes to the named server in every call, and keeps -u', async () => {
    vi.stubEnv('OAP_TMUX_SOCKET', 'named');
    expect(await main(['agent', 'attach', '%3'])).toBe(0);
    expect(calls()).toEqual([
      '-L named select-window -t %3',
      '-L named select-pane -t %3',
      '-L named -u attach-session -t %3',
    ]);
  });

  it('stays on the default server when no socket is set', async () => {
    vi.stubEnv('OAP_TMUX_SOCKET', '');
    expect(await main(['terminal', 'attach', '%3'])).toBe(0);
    expect(calls().at(-1)).toBe('-u attach-session -t %3');
  });
});
