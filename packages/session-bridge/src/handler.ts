import { fileURLToPath } from 'node:url';
import type { herdr } from '@openagentspocket/core';
import { actionFor, BridgeError, type Result } from './actions.js';
import { tmuxKeyArgs } from './keys.js';
import { pasteOrType } from './paste.js';
import { liveSnapshot, SESSION_PROTOCOL } from './snapshot.js';
import { isPaneGone, listPanes, type TmuxPane, type TmuxRunner } from './tmux.js';

const DEFAULT_READ_LINES = 200;

/** The app reads this to find where the Notification Registration goes. */
export const pluginEntry = (version: string) => ({
  plugin_id: 'agentico',
  // Where the app finds the Host-side scripts it runs, Approve among them.
  plugin_root: fileURLToPath(new URL('../../plugin', import.meta.url)),
  enabled: true,
  version,
});

interface Request {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

function paneById(panes: readonly TmuxPane[], id: unknown): TmuxPane {
  const pane = panes.find((candidate) => candidate.paneId === id);
  if (!pane) throw new BridgeError('pane_not_found', `No pane ${String(id)}`);
  return pane;
}

/** The visible screen as `agent read --source visible --format text` prints it. */
export const visibleScreen = (tmux: TmuxRunner, pane: string): Promise<string> =>
  tmux.run(['capture-pane', '-p', '-t', pane]);

/**
 * `agent read` for the launcher: the screen, or herdr's `agent_not_found` for a pane that is gone,
 * which tells the plugin's `approval-asks.js` to clear the ask. Any other failure says nothing of the pane.
 */
export async function agentRead(
  tmux: TmuxRunner,
  pane: string,
): Promise<{ code: number; output: string }> {
  try {
    return { code: 0, output: await visibleScreen(tmux, pane) };
  } catch (error) {
    if (!isPaneGone(error)) throw error;
    const answer = { error: { code: 'agent_not_found', message: `No Agent ${pane}` } };
    return { code: 1, output: `${JSON.stringify(answer)}\n` };
  }
}

/** Presses `keys` as `agent send-keys` does: herdr's key names as keys, anything else (Approve's digit) typed. */
export async function typeKeys(
  tmux: TmuxRunner,
  pane: string,
  keys: readonly string[],
): Promise<void> {
  // In copy-mode (a finger scrolled the pane) keys go to its bindings, never to the Agent.
  await tmux.run(['send-keys', '-t', pane, '-X', 'cancel']).catch(() => '');
  for (const key of keys) await tmux.run(['send-keys', '-t', pane, ...tmuxKeyArgs(key)]);
}

async function readPane(tmux: TmuxRunner, params: Request['params']): Promise<Result> {
  const pane = paneById(await listPanes(tmux), params.pane_id);
  const lines = typeof params.lines === 'number' ? params.lines : DEFAULT_READ_LINES;
  const ansi = params.strip_ansi === false || params.format === 'ansi';
  const text = await tmux.run([
    'capture-pane',
    '-p',
    ...(ansi ? ['-e'] : []),
    '-t',
    pane.paneId,
    '-S',
    `-${lines}`,
  ]);
  const read: herdr.PaneReadResult = {
    format: ansi ? 'ansi' : 'text',
    pane_id: pane.paneId,
    revision: 0,
    source: 'recent',
    tab_id: pane.windowId,
    text,
    truncated: false,
    workspace_id: pane.sessionId,
  };
  return { type: 'pane_read', read };
}

async function sendInput(tmux: TmuxRunner, params: Request['params']): Promise<Result> {
  const target = paneById(await listPanes(tmux), params.pane_id).paneId;
  if (typeof params.text === 'string') await pasteOrType(tmux, target, params.text);
  if (Array.isArray(params.keys)) {
    for (const key of params.keys)
      await tmux.run(['send-keys', '-t', target, ...tmuxKeyArgs(String(key))]);
  }
  return { type: 'ok' };
}

async function answer(tmux: TmuxRunner, version: string, request: Request): Promise<Result> {
  const { method, params } = request;
  switch (method) {
    case 'ping':
      return { type: 'pong', version, protocol: SESSION_PROTOCOL };
    case 'session.snapshot':
      return {
        type: 'session_snapshot',
        snapshot: await liveSnapshot(tmux, version),
      };
    case 'agent.list':
      return {
        type: 'agent_list',
        agents: (await liveSnapshot(tmux, version)).agents,
      };
    case 'agent.get': {
      const { agents } = await liveSnapshot(tmux, version);
      const agent = agents.find((candidate) => candidate.pane_id === params.target);
      if (!agent) throw new BridgeError('agent_not_found', `No Agent ${String(params.target)}`);
      return { type: 'agent_info', agent };
    }
    case 'pane.read':
      return readPane(tmux, params);
    case 'agent.read':
      return readPane(tmux, { ...params, pane_id: params.target });
    case 'plugin.list':
      return { type: 'plugin_list', plugins: [pluginEntry(version)] };
    case 'pane.send_text':
    case 'pane.send_keys':
    case 'pane.send_input':
      return sendInput(tmux, params);
    case 'agent.send_keys':
      return sendInput(tmux, { ...params, pane_id: params.target });
    default: {
      const action = actionFor(method);
      if (!action) throw new BridgeError('unsupported_method', `The tmux bridge has no ${method}`);
      return action(tmux, version, params);
    }
  }
}

function parseRequest(line: string): Request {
  const value: unknown = JSON.parse(line);
  const { id, method, params } = (value ?? {}) as Partial<Request>;
  if (typeof id !== 'string' || typeof method !== 'string') {
    throw new BridgeError('invalid_request', 'A request needs an id and a method');
  }
  return { id, method, params: params ?? {} };
}

/** Answers one request line of the session protocol with one response line. */
export async function handleLine(tmux: TmuxRunner, version: string, line: string): Promise<string> {
  let id = '';
  try {
    const request = parseRequest(line);
    id = request.id;
    return `${JSON.stringify({ id, result: await answer(tmux, version, request) })}\n`;
  } catch (error) {
    const code = error instanceof BridgeError ? error.code : 'internal_error';
    return `${JSON.stringify({ id, error: { code, message: error instanceof Error ? error.message : String(error) } })}\n`;
  }
}
