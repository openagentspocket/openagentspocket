import {
  ScriptedTerminalSession,
  type ShellTerminalIdentity,
  type ShellTerminalMemory,
  type ShellTerminalRemote,
  TerminalConnectionPool,
} from '@openagentspocket/core';
import { utf8Encode } from 'agentico-ssh';
import { systemClock } from '@/console/systemClock';
import type { ShellTerminalServices } from './services';

let counter = 0;

/** A Host that always answers: every create makes a tab and every attach prints a prompt. */
export function createDemoShellServices(): ShellTerminalServices {
  const remembered = new Map<string, ShellTerminalIdentity>();
  const remote: ShellTerminalRemote = {
    async create() {
      counter += 1;
      return {
        paneId: `demo-pane-${counter}`,
        tabId: `demo-tab-${counter}`,
        terminalId: `demo-${counter}`,
      };
    },
    verify: async () => true,
    close: async () => undefined,
  };
  return {
    pool: new TerminalConnectionPool({ clock: systemClock }),
    hostName: () => 'Demo Host',
    remote: () => remote,
    memory: (hostId, key): ShellTerminalMemory => ({
      recall: () => remembered.get(`${hostId}/${key}`),
      remember: (identity) => void remembered.set(`${hostId}/${key}`, identity),
      forget: () => void remembered.delete(`${hostId}/${key}`),
    }),
    runner: () => async (_request, handler) => {
      const session = new ScriptedTerminalSession();
      session.emit(utf8Encode('you@host:~$ '));
      handler.transportDidBecomeReady(1);
      await handler.runEndingSession(session);
    },
    generation: () => 1,
  };
}
