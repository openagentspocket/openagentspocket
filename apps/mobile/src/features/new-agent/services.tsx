import type {
  DirectoryLister,
  LaunchHost,
  NewAgentEnvironment,
  RecentDirectories,
  RecentWorkspaces,
  WorktreeDetailOptions,
} from '@openagentspocket/core';
import { createContext, type ReactNode, useContext } from 'react';
import { createDemoServices } from './demo';

/** What the New Agent and Worktree Details screens need from the running app. */
export interface NewAgentServices {
  readonly hosts: readonly LaunchHost[];
  readonly environment: NewAgentEnvironment;
  readonly recentWorkspaces: RecentWorkspaces;
  readonly recentDirectories: RecentDirectories;
  /** The folder lister for one Host's directory browser. */
  directoryLister(hostId: string): DirectoryLister;
  /** Worktree Details for one Agent's workspace; undefined when it is not a linked worktree. */
  worktreeDetail(hostId: string, paneId: string): WorktreeDetailOptions | undefined;
  /** Opens the started Agent (the Agent detail route); absent leaves the user on the Console. */
  openAgent?(hostId: string, paneId: string): void;
  /** Opens Changes for a directory (after the Worktree sheet dismissed). */
  openChanges?(hostId: string, directory: string): void;
}

let fallback: NewAgentServices | undefined;

const Context = createContext<NewAgentServices | undefined>(undefined);

export function NewAgentServicesProvider({
  services,
  children,
}: {
  services: NewAgentServices;
  children: ReactNode;
}) {
  return <Context.Provider value={services}>{children}</Context.Provider>;
}

/** The live services once provided; a demo Host until then. */
export function useNewAgentServices(): NewAgentServices {
  const provided = useContext(Context);
  if (provided) return provided;
  fallback ??= createDemoServices();
  return fallback;
}
