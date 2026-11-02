import type {
  ShellTerminalMemory,
  ShellTerminalRemote,
  TerminalConnectionPool,
  TerminalSessionRunner,
} from '@openagentspocket/core';
import { createContext, type ReactNode, useContext } from 'react';
import { createDemoShellServices } from './demo';

/** What the shell terminal screens need from the running app, per Host. */
export interface ShellTerminalServices {
  /** One pool for the whole app: the retention budget is per Host inside it. */
  readonly pool: TerminalConnectionPool;
  hostName(hostId: string): string;
  remote(hostId: string): ShellTerminalRemote;
  /** Where a Workspace's (or directory's) shell tab is remembered. */
  memory(hostId: string, key: string): ShellTerminalMemory;
  runner(hostId: string): TerminalSessionRunner;
  /** The Host's current Transport generation, when known. */
  generation(hostId: string): number | null;
}

let fallback: ShellTerminalServices | undefined;

const Context = createContext<ShellTerminalServices | undefined>(undefined);

export function ShellTerminalServicesProvider({
  services,
  children,
}: {
  services: ShellTerminalServices;
  children: ReactNode;
}) {
  return <Context.Provider value={services}>{children}</Context.Provider>;
}

/** The live services once provided; a scripted demo Host until then. */
export function useShellTerminalServices(): ShellTerminalServices {
  const provided = useContext(Context);
  if (provided) return provided;
  fallback ??= createDemoShellServices();
  return fallback;
}
