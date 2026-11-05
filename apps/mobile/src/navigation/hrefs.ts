import type { Href } from 'expo-router';
import { changesTargetId } from '@/changes/target';

/** Every entry point builds its destination here, so a route change lands in one file. */
export const hrefs = {
  agent: (hostId: string, paneId: string): Href => ({
    pathname: '/agent/[hostId]/[paneId]',
    params: { hostId, paneId },
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
  terminals: (hostId?: string): Href => ({
    pathname: '/terminals',
    params: hostId ? { host: hostId } : {},
  }),
  /** A new shell in a workspace's directory. */
  shell: (target: { hostId: string; workspaceId: string; cwd: string }): Href => ({
    pathname: '/terminal',
    params: { host: target.hostId, workspace: target.workspaceId, cwd: target.cwd },
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
