import { type herdr, programIdentity } from '@openagentspocket/core';
import type { TmuxPane } from './tmux';

/** The schema revision the bridge answers as (`packages/core/schema/herdr-schema.json`). */
export const SESSION_PROTOCOL = 22;

/** tmux reports no Agent state: Agent hooks fill it in. */
const UNKNOWN_STATUS: herdr.AgentStatus = 'unknown';

/** A pane's program when it is a known one; agents that run under `node` need the hooks to be named. */
const agentOf = (pane: TmuxPane): string | undefined => programIdentity(pane.command).kind;

function paneInfo(pane: TmuxPane): herdr.PaneInfo {
  return {
    agent: agentOf(pane) ?? null,
    agent_status: UNKNOWN_STATUS,
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

function agentInfo(pane: TmuxPane): herdr.AgentInfo | null {
  const agent = agentOf(pane);
  if (!agent) return null;
  return {
    agent,
    agent_status: UNKNOWN_STATUS,
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
): herdr.SessionSnapshot {
  const sessions = unique(panes.map((pane) => pane.sessionId));
  const windows = unique(panes.map((pane) => pane.windowId));
  const focused = panes.find((pane) => pane.active);
  return {
    agents: panes.map(agentInfo).filter((agent) => agent !== null),
    focused_pane_id: focused?.paneId ?? null,
    focused_tab_id: focused?.windowId ?? null,
    focused_workspace_id: focused?.sessionId ?? null,
    layouts: [],
    panes: panes.map(paneInfo),
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
