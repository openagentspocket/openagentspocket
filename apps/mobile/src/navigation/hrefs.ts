import type { Href } from 'expo-router';
import { changesTargetId } from '@/changes/target';

/** Every entry point builds its destination here, so a route change lands in one file. */
export const hrefs = {
  /** Home: the Sessions and Hosts. */
  home: (): Href => '/',
  /** Adding a Host starts at a choice sheet: Easy Pair with QR or Add Manually. */
  /** Easy Pair: the camera and the command to run on the machine (Swift ADR 0007's Scan to Pair). */
  easyPair: (): Href => '/hosts/pair',
  /** How to prepare a machine and show its Pairing Code. */
  setupGuide: (): Href => '/hosts/guide',
  /** The manual Host form: new, or editing / duplicating a saved Host. */
  hostForm: (origin?: { edit?: string; duplicate?: string }): Href => ({
    pathname: '/hosts/form',
    params: {
      ...(origin?.edit ? { edit: origin.edit } : {}),
      ...(origin?.duplicate ? { duplicate: origin.duplicate } : {}),
    },
  }),
  /**
   * An Agent's detail. `surface` opens it on Chat or Terminal; `request` (any fresh token) makes a
   * detail that is already open apply that surface again.
   */
  agent: (
    hostId: string,
    paneId: string,
    open?: { surface: 'chat' | 'terminal'; request?: string },
  ): Href => ({
    pathname: '/agent/[hostId]/[paneId]',
    params: {
      hostId,
      paneId,
      ...(open ? { surface: open.surface } : {}),
      ...(open?.request ? { request: open.request } : {}),
    },
  }),
  /** New Agent on a Host; with a workspace and directory it starts a tab beside an Agent. */
  newAgent: (origin?: { hostId: string; workspaceId?: string; cwd?: string }): Href => ({
    pathname: '/new-agent',
    params: {
      ...(origin ? { host: origin.hostId } : {}),
      ...(origin?.workspaceId ? { workspace: origin.workspaceId } : {}),
      ...(origin?.cwd ? { cwd: origin.cwd } : {}),
    },
  }),
  /** Every Agent on every Host, the pinned ones first. */
  board: (): Href => '/board',
  /** Worktree Details for the linked worktree an Agent runs in. */
  worktree: (hostId: string, paneId: string): Href => ({
    pathname: '/worktree',
    params: { host: hostId, pane: paneId },
  }),
  terminals: (hostId?: string): Href => ({
    pathname: '/terminals',
    params: hostId ? { host: hostId } : {},
  }),
  /** A new shell in a workspace's directory. */
  shell: (target: { hostId: string; workspaceId: string; cwd: string }): Href => ({
    pathname: '/terminal',
    params: { host: target.hostId, workspace: target.workspaceId, cwd: target.cwd },
  }),
  /** A shell pane that already exists on the Host. */
  openShell: (target: {
    hostId: string;
    workspaceId: string;
    cwd: string;
    paneId: string;
    tabId: string;
    terminalId: string;
  }): Href => ({
    pathname: '/terminal',
    params: {
      host: target.hostId,
      workspace: target.workspaceId,
      cwd: target.cwd,
      pane: target.paneId,
      tab: target.tabId,
      terminal: target.terminalId,
    },
  }),
  files: (hostId: string, path?: string): Href => ({
    pathname: '/files',
    params: { host: hostId, ...(path ? { path } : {}) },
  }),
  ports: (hostId: string, name: string): Href => ({
    pathname: '/ports',
    params: { host: hostId, name },
  }),
  changesForAgent: (hostId: string, paneId: string): Href => ({
    pathname: '/changes',
    params: { agent: changesTargetId({ kind: 'agent', hostId, paneId }) },
  }),
  changesForDirectory: (hostId: string, directory: string): Href => ({
    pathname: '/changes',
    params: { agent: changesTargetId({ kind: 'directory', hostId, directory }) },
  }),
} as const;
