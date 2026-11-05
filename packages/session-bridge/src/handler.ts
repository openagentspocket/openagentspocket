import { errorMessage, type herdr } from '@openagentspocket/core';
import { SESSION_PROTOCOL, sessionSnapshot } from './snapshot';
import { listPanes, type TmuxPane, type TmuxRunner } from './tmux';

const DEFAULT_READ_LINES = 200;

interface Request {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

type Result = { type: string } & Record<string, unknown>;

class BridgeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function paneById(panes: readonly TmuxPane[], id: unknown): TmuxPane {
  const pane = panes.find((candidate) => candidate.paneId === id);
  if (!pane) throw new BridgeError('pane_not_found', `No pane ${String(id)}`);
  return pane;
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
  // `-l` sends text literally; without it a word like "Enter" would press the key.
  if (typeof params.text === 'string' && params.text !== '') {
    await tmux.run(['send-keys', '-t', target, '-l', '--', params.text]);
  }
  if (Array.isArray(params.keys) && params.keys.length > 0) {
    await tmux.run(['send-keys', '-t', target, ...params.keys.map(String)]);
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
        snapshot: sessionSnapshot(await listPanes(tmux), version),
      };
    case 'agent.list':
      return {
        type: 'agent_list',
        agents: sessionSnapshot(await listPanes(tmux), version).agents,
      };
    case 'agent.get': {
      const { agents } = sessionSnapshot(await listPanes(tmux), version);
      const agent = agents.find((candidate) => candidate.pane_id === params.target);
      if (!agent) throw new BridgeError('agent_not_found', `No Agent ${String(params.target)}`);
      return { type: 'agent_info', agent };
    }
    case 'pane.read':
      return readPane(tmux, params);
    case 'pane.send_text':
    case 'pane.send_keys':
    case 'pane.send_input':
      return sendInput(tmux, params);
    default:
      throw new BridgeError('unsupported_method', `The tmux bridge has no ${method}`);
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
    return `${JSON.stringify({ id, error: { code, message: errorMessage(error) } })}\n`;
  }
}
