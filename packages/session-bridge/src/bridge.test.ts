import { agenticoEntry, decodeResult, parsePluginList } from '@openagentspocket/core';
import { describe, expect, it } from 'vitest';
import { agentRead, handleLine } from './handler.js';
import { SESSION_PROTOCOL, sessionSnapshot } from './snapshot.js';
import { parsePanes, type TmuxRunner } from './tmux.js';

const line = (...fields: string[]) => fields.join('|oap|');
const PANES = [
  line('$0', 'work', '@1', '0', 'api', '%1', '1', '1', '1', 'codex', '/srv/api', 'codex run'),
  line('$0', 'work', '@1', '0', 'api', '%2', '0', '1', '1', 'zsh', '/srv/api', 'shell'),
  line('$1', 'side', '@2', '1', 'web', '%3', '1', '1', '0', 'opencode', '/srv/web', 'a|oap|b'),
].join('\n');

function fakeTmux() {
  const calls: string[][] = [];
  const tmux: TmuxRunner = {
    run: async (args) => {
      calls.push([...args]);
      return args[0] === 'list-panes' ? PANES : 'screen text';
    },
  };
  return { tmux, calls };
}

const request = (method: string, params: object = {}) =>
  JSON.stringify({ id: '7', method, params });

describe('agent read', () => {
  it('prints the screen as it stands', async () => {
    expect(await agentRead(fakeTmux().tmux, '%1')).toEqual({ code: 0, output: 'screen text' });
  });

  it('leaves any other tmux failure unexplained: the ask stays until a read can tell', async () => {
    const tmux: TmuxRunner = { run: () => Promise.reject(new Error('tmux: out of memory')) };
    await expect(agentRead(tmux, '%1')).rejects.toThrow('out of memory');
  });
});

describe('parsePanes', () => {
  it('reads every field, keeps a separator in a title and skips broken lines', () => {
    const panes = parsePanes(`${PANES}\nnot a pane\n`);
    expect(panes).toHaveLength(3);
    expect(panes[2]?.title).toBe('a|oap|b');
    expect(panes[0]?.active).toBe(true);
  });

  it('a pane of a session nobody is attached to is not the focused one', () => {
    expect(parsePanes(PANES)[2]?.active).toBe(false);
  });
});

describe('what the hooks recorded', () => {
  const claude = { agent: 'claude', session: 'abc', status: 'blocked' };
  const pane = (command: string) => parsePanes(PANES).map((p) => ({ ...p, command }));

  it('names an Agent tmux sees as node, with its status and session', () => {
    const shot = sessionSnapshot(pane('node').slice(0, 1), 'v', new Map([['%1', claude]]));
    expect(shot.agents[0]).toMatchObject({
      agent: 'claude',
      agent_status: 'blocked',
      agent_session: { agent: 'claude', kind: 'id', source: 'herdr:claude', value: 'abc' },
    });
  });

  it('a pane back at its shell holds no Agent, whatever the record says', () => {
    const shot = sessionSnapshot(pane('zsh').slice(0, 1), 'v', new Map([['%1', claude]]));
    expect(shot.agents).toEqual([]);
  });
});

describe('the session protocol over tmux', () => {
  it('lists the plugin the app looks for, so the device can register', async () => {
    const out = await handleLine(fakeTmux().tmux, '0.1.0', request('plugin.list'));
    const entries = parsePluginList(decodeResult(out, '7', 'plugin_list'));
    expect(entries && agenticoEntry(entries, true)?.pluginId).toBe('agentico');
  });

  it('answers ping as the app decodes it', async () => {
    const out = await handleLine(fakeTmux().tmux, '0.1.0', request('ping'));
    expect(decodeResult(out, '7', 'pong')).toMatchObject({ protocol: SESSION_PROTOCOL });
  });

  it('maps sessions, windows and panes to a snapshot the app decodes', async () => {
    const out = await handleLine(fakeTmux().tmux, '0.1.0', request('session.snapshot'));
    const { snapshot } = decodeResult(out, '7', 'session_snapshot');
    expect(snapshot.workspaces.map((w) => w.label)).toEqual(['work', 'side']);
    expect(snapshot.tabs.map((t) => t.tab_id)).toEqual(['@1', '@2']);
    expect(snapshot.panes).toHaveLength(3);
    expect(snapshot.agents.map((a) => a.pane_id)).toEqual(['%1', '%3']);
    expect(snapshot.focused_pane_id).toBe('%1');
  });

  it('reads a pane through capture-pane', async () => {
    const { tmux, calls } = fakeTmux();
    const params = { pane_id: '%1', source: 'recent', lines: 50, strip_ansi: true };
    const out = await handleLine(tmux, '0.1.0', request('pane.read', params));
    expect(decodeResult(out, '7', 'pane_read').read.text).toBe('screen text');
    expect(calls.at(-1)).toEqual(['capture-pane', '-p', '-t', '%1', '-S', '-50']);
  });

  it('sends text literally and keys by name', async () => {
    const { tmux, calls } = fakeTmux();
    const params = { pane_id: '%2', text: 'Enter', keys: ['Enter'] };
    await handleLine(tmux, '0.1.0', request('pane.send_input', params));
    expect(calls.slice(-2)).toEqual([
      ['send-keys', '-t', '%2', '-l', '--', 'Enter'],
      ['send-keys', '-t', '%2', 'Enter'],
    ]);
  });

  it('refuses an unknown pane without running anything on it', async () => {
    const { tmux, calls } = fakeTmux();
    const out = await handleLine(tmux, '0.1.0', request('pane.send_text', { pane_id: '%9' }));
    expect(JSON.parse(out).error.code).toBe('pane_not_found');
    expect(calls.some((call) => call[0] === 'send-keys')).toBe(false);
  });

  it('says so for a method it does not have, and survives a broken line', async () => {
    const { tmux } = fakeTmux();
    const unknown = await handleLine(tmux, '0.1.0', request('worktree.list'));
    expect(JSON.parse(unknown).error.code).toBe('unsupported_method');
    expect(JSON.parse(await handleLine(tmux, '0.1.0', '{')).error.code).toBe('internal_error');
  });
});
