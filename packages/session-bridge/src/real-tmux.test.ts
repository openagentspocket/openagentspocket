import { existsSync } from 'node:fs';
import { decodeResult } from '@openagentspocket/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleLine } from './handler';
import { tmuxRunner } from './runner';
import { listPanes } from './tmux';

const BINARY = ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux', '/usr/bin/tmux'].find(existsSync);
const SOCKET = `oap-bridge-test-${process.pid}`;

const tmux = tmuxRunner({ binary: BINARY ?? 'tmux', socketName: SOCKET });
const ask = (method: string, params: object = {}) =>
  handleLine(tmux, 'test', JSON.stringify({ id: '1', method, params }));
const snapshot = async () =>
  decodeResult(await ask('session.snapshot'), '1', 'session_snapshot').snapshot;

async function eventually(check: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('condition never held');
}

// Runs where tmux is installed: the only proof that the format and the commands are real ones.
describe.skipIf(!BINARY)('the bridge on a real tmux', () => {
  beforeAll(async () => {
    // A shell without a UTF-8 locale drops what it cannot read; tmux itself passes it through.
    const shell = ['env', 'LANG=en_US.UTF-8', '/bin/sh'];
    await tmux.run(['new-session', '-d', '-s', 'work', '-x', '100', '-y', '30', ...shell]);
    await tmux.run(['split-window', '-t', 'work', ...shell]);
    await tmux.run(['new-window', '-t', 'work', '-n', 'logs', '/bin/sh']);
    await tmux.run(['new-session', '-d', '-s', 'side', '/bin/sh']);
  });
  afterAll(async () => {
    await tmux.run(['kill-server']).catch(() => {});
  });

  it('maps live sessions, windows and panes', async () => {
    const shot = await snapshot();
    expect(shot.workspaces.map((w) => w.label).sort()).toEqual(['side', 'work']);
    expect(shot.tabs).toHaveLength(3);
    expect(shot.panes).toHaveLength(4);
    const work = shot.workspaces.find((w) => w.label === 'work');
    expect(work).toMatchObject({ tab_count: 2, pane_count: 3 });
  });

  it('a session nobody is attached to still names its active window', async () => {
    const shot = await snapshot();
    const work = shot.workspaces.find((w) => w.label === 'work');
    const logs = shot.tabs.find((t) => t.label === 'logs');
    expect(work?.active_tab_id).toBe(logs?.tab_id);
    expect(shot.focused_pane_id).toBeNull();
  });

  it('types into a pane, presses Enter and reads the answer back', async () => {
    const pane = (await snapshot()).panes[0]?.pane_id as string;
    const text = 'echo "ñandú $((40 + 2))"';
    await ask('pane.send_input', { pane_id: pane, text, keys: ['Enter'] });
    await eventually(async () => {
      const params = { pane_id: pane, source: 'recent', lines: 50, strip_ansi: true };
      const out = await ask('pane.read', params);
      return decodeResult(out, '1', 'pane_read').read.text.includes('ñandú 42');
    });
  });

  it('text that looks like a key name stays text', async () => {
    const pane = (await snapshot()).panes[1]?.pane_id as string;
    await ask('pane.send_text', { pane_id: pane, text: 'Enter' });
    await eventually(async () => {
      const params = { pane_id: pane, source: 'recent', lines: 5, strip_ansi: true };
      const out = await ask('pane.read', params);
      return decodeResult(out, '1', 'pane_read').read.text.includes('Enter');
    });
  });

  it('reports the program a pane is running', async () => {
    const pane = (await snapshot()).panes[2]?.pane_id as string;
    await ask('pane.send_input', { pane_id: pane, text: 'sleep 20', keys: ['Enter'] });
    await eventually(async () =>
      (await listPanes(tmux)).some((p) => p.paneId === pane && p.command === 'sleep'),
    );
  });
});
