import type { herdr } from '@openagentspocket/core';
import { agentExecutableOf } from './agents.js';
import { liveSnapshot } from './snapshot.js';
import type { TmuxRunner } from './tmux.js';

export type Params = Record<string, unknown>;
export type Result = { type: string } & Record<string, unknown>;

export class BridgeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const SEPARATOR = '|oap|';
const IDS = ['#{session_id}', '#{window_id}', '#{pane_id}'].join(SEPARATOR);
const OK: Result = { type: 'ok' };

const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

function required(params: Params, field: string): string {
  const value = text(params[field]);
  if (value === null) throw new BridgeError('invalid_request', `${field} is required`);
  return value;
}

const shellWord = (word: string) => `'${word.replaceAll("'", `'\\''`)}'`;

/** What tmux just created, as the app reads it. */
async function created(tmux: TmuxRunner, version: string, printed: string) {
  const [workspaceId, tabId, paneId] = printed.trim().split(SEPARATOR);
  const snapshot = await liveSnapshot(tmux, version);
  const workspace = snapshot.workspaces.find((item) => item.workspace_id === workspaceId);
  const tab = snapshot.tabs.find((item) => item.tab_id === tabId);
  const pane = snapshot.panes.find((item) => item.pane_id === paneId);
  if (!workspace || !tab || !pane)
    throw new BridgeError('internal_error', 'tmux lost what it made');
  return { workspace, tab, root_pane: pane };
}

const optional = (flag: string, value: string | null) => (value === null ? [] : [flag, value]);

async function createTab(tmux: TmuxRunner, version: string, params: Params): Promise<Result> {
  const made = await created(
    tmux,
    version,
    await tmux.run([
      'new-window',
      ...(params.focus === true ? [] : ['-d']),
      '-P',
      '-F',
      IDS,
      ...optional('-t', text(params.workspace_id)),
      ...optional('-c', text(params.cwd)),
      ...optional('-n', text(params.label)),
    ]),
  );
  return { type: 'tab_created', tab: made.tab, root_pane: made.root_pane };
}

async function createWorkspace(tmux: TmuxRunner, version: string, params: Params): Promise<Result> {
  const made = await created(
    tmux,
    version,
    await tmux.run([
      'new-session',
      '-d',
      '-P',
      '-F',
      IDS,
      ...optional('-s', text(params.label)),
      ...optional('-c', text(params.cwd)),
    ]),
  );
  return { type: 'workspace_created', ...made };
}

async function agentOf(
  tmux: TmuxRunner,
  version: string,
  target: string,
): Promise<herdr.AgentInfo> {
  const { agents } = await liveSnapshot(tmux, version);
  const agent = agents.find((candidate) => candidate.pane_id === target);
  if (!agent) throw new BridgeError('agent_not_found', `No Agent ${target}`);
  return agent;
}

/** Types the program's command into the pane, as the user would: tmux has no way to start one. */
async function startAgent(tmux: TmuxRunner, params: Params): Promise<Result> {
  const kind = required(params, 'kind');
  const pane = required(params, 'pane_id');
  const executable = agentExecutableOf(kind);
  if (!executable) throw new BridgeError('unsupported_agent', `No program ${kind}`);
  const args = Array.isArray(params.args) ? params.args.map(String) : [];
  const argv = [executable, ...args];
  await tmux.run(['send-keys', '-t', pane, '-l', '--', argv.map(shellWord).join(' ')]);
  await tmux.run(['send-keys', '-t', pane, 'Enter']);
  const agent: herdr.AgentInfo = {
    agent: kind,
    agent_status: 'unknown',
    focused: false,
    pane_id: pane,
    revision: 0,
    tab_id: '',
    terminal_id: pane,
    workspace_id: '',
  };
  return { type: 'agent_started', agent, argv };
}

async function processInfo(tmux: TmuxRunner, params: Params): Promise<Result> {
  const pane = required(params, 'pane_id');
  const printed = await tmux.run(['display-message', '-p', '-t', pane, '#{pane_pid} #{pane_tty}']);
  const [pid, tty] = printed.trim().split(' ');
  return {
    type: 'pane_process_info',
    process_info: { pane_id: pane, shell_pid: Number(pid), tty: tty ?? null },
  };
}

/** The methods that change tmux; null for one that is not here. */
export function actionFor(
  method: string,
): ((tmux: TmuxRunner, version: string, params: Params) => Promise<Result>) | null {
  const run =
    (...build: ((params: Params) => string)[]) =>
    async (tmux: TmuxRunner, _version: string, params: Params) => {
      await tmux.run(build.map((part) => part(params)));
      return OK;
    };
  const word = (value: string) => () => value;
  const field = (name: string) => (params: Params) => required(params, name);
  switch (method) {
    case 'tab.create':
      return createTab;
    case 'workspace.create':
      return createWorkspace;
    case 'tab.close':
      return run(word('kill-window'), word('-t'), field('tab_id'));
    case 'pane.close':
      return run(word('kill-pane'), word('-t'), field('pane_id'));
    case 'workspace.close':
      return run(word('kill-session'), word('-t'), field('workspace_id'));
    case 'tab.rename':
      return run(word('rename-window'), word('-t'), field('tab_id'), field('label'));
    case 'workspace.rename':
      return run(word('rename-session'), word('-t'), field('workspace_id'), field('label'));
    case 'agent.focus':
      return run(word('select-pane'), word('-t'), field('target'));
    case 'agent.rename':
      return async (tmux, _version, params) => {
        const args = ['select-pane', '-t', required(params, 'target'), '-T'];
        await tmux.run([...args, text(params.name) ?? '']);
        return OK;
      };
    case 'agent.prompt':
      return async (tmux, version, params) => {
        const target = required(params, 'target');
        await tmux.run(['send-keys', '-t', target, '-l', '--', required(params, 'text')]);
        await tmux.run(['send-keys', '-t', target, 'Enter']);
        return { type: 'agent_prompted', agent: await agentOf(tmux, version, target) };
      };
    case 'agent.start':
      return (tmux, _version, params) => startAgent(tmux, params);
    case 'pane.process_info':
      return (tmux, _version, params) => processInfo(tmux, params);
    default:
      return null;
  }
}
