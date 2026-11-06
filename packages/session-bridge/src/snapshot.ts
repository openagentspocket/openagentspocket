import type { herdr } from '@openagentspocket/core';
import { agentKindOf } from './agents.js';
import { listPanes, type PaneRecord, type TmuxPane, type TmuxRunner } from './tmux.js';

/** The schema revision the bridge answers as (`packages/core/schema/herdr-schema.json`). */
export const SESSION_PROTOCOL = 22;

/** tmux reports no Agent state: this is all it says until a hook has spoken. */
const UNKNOWN_STATUS: herdr.AgentStatus = 'unknown';

type Records = ReadonlyMap<string, PaneRecord>;

const SHELLS = new Set(['bash', 'zsh', 'sh', 'fish', 'dash', 'ksh', 'tcsh', 'login']);

/** A record outlives its program: back at a shell, the pane holds no Agent any more. */
const recordOf = (pane: TmuxPane, records: Records): PaneRecord | undefined =>
  SHELLS.has(pane.command.replace(/^-/, '')) ? undefined : records.get(pane.paneId);

/** Hooks name an Agent best: one that runs under `node` shows as `node` in tmux. */
const agentOf = (pane: TmuxPane, records: Records): string | undefined =>
  recordOf(pane, records)?.agent ?? agentKindOf(pane.command);

const statusOf = (pane: TmuxPane, records: Records): herdr.AgentStatus =>
  recordOf(pane, records)?.status ?? UNKNOWN_STATUS;

function sessionOf(pane: TmuxPane, records: Records): herdr.AgentSessionInfo | null {
  const record = recordOf(pane, records);
  if (!record?.agent || !record.session) return null;
  const { agent, session } = record;
  return { agent, kind: 'id', source: `herdr:${agent}`, value: session };
}

function paneInfo(pane: TmuxPane, records: Records): herdr.PaneInfo {
  return {
    agent: agentOf(pane, records) ?? null,
    agent_session: sessionOf(pane, records),
    agent_status: statusOf(pane, records),
    cwd: pane.cwd,
    focused: pane.active,
    pane_id: pane.paneId,
    revision: 0,
    tab_id: pane.windowId,
    terminal_id: pane.paneId,
    terminal_title: pane.title,
    workspace_id: pane.sessionId,
  };
}

function agentInfo(pane: TmuxPane, records: Records): herdr.AgentInfo | null {
  const agent = agentOf(pane, records);
  if (!agent) return null;
  return {
    agent,
    agent_session: sessionOf(pane, records),
    agent_status: statusOf(pane, records),
    cwd: pane.cwd,
    focused: pane.active,
    pane_id: pane.paneId,
    revision: 0,
    tab_id: pane.windowId,
    terminal_id: pane.paneId,
    terminal_title: pane.title,
    workspace_id: pane.sessionId,
  };
}

const unique = <T>(items: readonly T[]) => [...new Set(items)];

function tabInfo(panes: readonly TmuxPane[]): herdr.TabInfo {
  const first = panes[0] as TmuxPane;
  return {
    agent_status: UNKNOWN_STATUS,
    focused: panes.some((pane) => pane.active),
    label: first.windowName,
    number: first.windowIndex,
    pane_count: panes.length,
    tab_id: first.windowId,
    workspace_id: first.sessionId,
  };
}

function workspaceInfo(panes: readonly TmuxPane[], number: number): herdr.WorkspaceInfo {
  const first = panes[0] as TmuxPane;
  const active = panes.find((pane) => pane.windowCurrent) ?? first;
  return {
    active_tab_id: active.windowId,
    agent_status: UNKNOWN_STATUS,
    focused: panes.some((pane) => pane.active),
    label: first.sessionName,
    number,
    pane_count: panes.length,
    tab_count: unique(panes.map((pane) => pane.windowId)).length,
    workspace_id: first.sessionId,
  };
}

/** tmux as the session protocol sees it: a session is a workspace, a window a tab, a pane a pane. */
export function sessionSnapshot(
  panes: readonly TmuxPane[],
  version: string,
  records: Records = new Map(),
): herdr.SessionSnapshot {
  const sessions = unique(panes.map((pane) => pane.sessionId));
  const windows = unique(panes.map((pane) => pane.windowId));
  const focused = panes.find((pane) => pane.active);
  return {
    agents: panes.map((pane) => agentInfo(pane, records)).filter((agent) => agent !== null),
    focused_pane_id: focused?.paneId ?? null,
    focused_tab_id: focused?.windowId ?? null,
    focused_workspace_id: focused?.sessionId ?? null,
    layouts: [],
    panes: panes.map((pane) => paneInfo(pane, records)),
    protocol: SESSION_PROTOCOL,
    tabs: windows.map((id) => tabInfo(panes.filter((pane) => pane.windowId === id))),
    version,
    workspaces: sessions.map((id, index) =>
      workspaceInfo(
        panes.filter((pane) => pane.sessionId === id),
        index + 1,
      ),
    ),
  };
}

/** What tmux holds right now, with what the hooks know about it. */
export async function liveSnapshot(
  tmux: TmuxRunner,
  version: string,
): Promise<herdr.SessionSnapshot> {
  return sessionSnapshot(await listPanes(tmux), version, tmux.records?.());
}
