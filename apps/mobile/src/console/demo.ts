import {
  AgentStatusClocks,
  type Clock,
  type ConsoleTransport,
  consoleSubscriptions,
  EventsSession,
  type herdr,
  MemoryStorage,
  PinnedAgents,
  ScriptedEventsTransport,
  type TerminalAttachSession,
} from '@openagentspocket/core';
import { DemoTerminalSession } from './demoTerminal';
import { ConsoleStore } from './store';
import { systemClock } from './systemClock';

const DEMO_HOST = { id: 'demo', name: 'Demo Host', username: 'demo' };

const AGENTS: readonly {
  pane: string;
  program: string;
  status: herdr.AgentStatus;
  workspace: string;
  title: string;
  seq: number;
}[] = [
  {
    pane: 'p1',
    program: 'claude',
    status: 'blocked',
    workspace: 'api-server',
    title: 'Migration',
    seq: 9,
  },
  {
    pane: 'p2',
    program: 'codex',
    status: 'working',
    workspace: 'mobile',
    title: 'Settings refactor',
    seq: 7,
  },
  {
    pane: 'p3',
    program: 'omp',
    status: 'working',
    workspace: 'docs',
    title: 'Install guide',
    seq: 4,
  },
  {
    pane: 'p4',
    program: 'claude',
    status: 'done',
    workspace: 'infra',
    title: 'Lint cleanup',
    seq: 2,
  },
  {
    pane: 'p5',
    program: 'claude',
    status: 'idle',
    workspace: 'scratch',
    title: 'Scratch pad',
    seq: 1,
  },
];

function demoSnapshot(): herdr.SessionSnapshot {
  return {
    agents: AGENTS.map((a, index) => ({
      agent: a.program,
      agent_status: a.status,
      focused: false,
      pane_id: a.pane,
      revision: 1,
      tab_id: `w${index}:t1`,
      terminal_id: `term_${a.pane}`,
      workspace_id: `w${index}`,
      cwd: `/work/${a.workspace}`,
      terminal_title_stripped: a.title,
      state_change_seq: a.seq,
    })),
    layouts: [],
    panes: [],
    protocol: 20,
    tabs: [],
    version: 'demo',
    workspaces: AGENTS.map((a, index) => ({
      active_tab_id: `w${index}:t1`,
      agent_status: a.status,
      focused: false,
      label: a.workspace,
      number: index + 1,
      pane_count: 1,
      tab_count: 1,
      workspace_id: `w${index}`,
    })),
  };
}

/** Offline Transport: a fixed snapshot and a canned prompt for the Blocked Agent. */
export class DemoConsoleTransport extends ScriptedEventsTransport implements ConsoleTransport {
  async sessionSnapshot(): Promise<herdr.SessionSnapshot> {
    return demoSnapshot();
  }

  async readPane(): Promise<{ text: string }> {
    return { text: 'Run the migration on the staging database?\n1. Yes\n2. No' };
  }

  /** The demo terminal echoes keystrokes; the live Transport opens a PTY attach. */
  async attachTerminal(): Promise<TerminalAttachSession> {
    return new DemoTerminalSession();
  }

  /** The demo has no panes to close; the live Transport sends `pane.close`. */
  async closePane(_paneId: string): Promise<void> {}

  /** The demo keeps no names; the live Transport sends `agent.rename`. */
  async renameAgent(_params: { target: string; name: string | null }): Promise<void> {}
}

/** A Console store fed by one demo Host, until the live Transport lands. */
export function createDemoConsoleStore(
  clock: Clock = systemClock,
  transport: DemoConsoleTransport = new DemoConsoleTransport(),
): ConsoleStore {
  const store = new ConsoleStore({
    pins: new PinnedAgents(new MemoryStorage()),
    clocks: new AgentStatusClocks(new MemoryStorage()),
    clock,
  });
  const session = new EventsSession<DemoConsoleTransport>({
    subscriptions: consoleSubscriptions([]),
    connect: async () => transport,
    clock,
    keepalive: null,
  });
  store.addHost(DEMO_HOST, session);
  return store;
}
