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
  STATUS_CLOCKS_STORAGE_KEY,
  type TerminalAttachSession,
} from '@openagentspocket/core';
import { systemClock } from '@openagentspocket/transport';
import { DemoTerminalSession } from './demoTerminal';
import { ConsoleStore } from './store';

const DEMO_HOST = { id: 'demo', name: 'Demo Host', username: 'demo' };
/** The second Host of the rich demo (the atlas): same pane ids as the first, as on real Hosts. */
const LAB_HOST = { id: 'lab', name: 'Lab', username: 'ada' };

interface DemoAgent {
  pane: string;
  program: string;
  status: herdr.AgentStatus;
  workspace: string;
  title: string;
  seq: number;
  /** Agents with the same workspace id share one workspace (default: their own). */
  workspaceId?: string;
  session?: string;
  /** Shell panes (no Agent) in this Agent's workspace. */
  shells?: readonly { pane: string; label?: string; cwd: string }[];
}

const AGENTS: readonly DemoAgent[] = [
  {
    pane: 'p1',
    program: 'claude',
    status: 'blocked',
    workspace: 'api-server',
    title: 'Migration',
    seq: 9,
    shells: [{ pane: 's1', label: 'logs', cwd: '/work/api-server/logs' }],
  },
  {
    pane: 'p2',
    program: 'codex',
    status: 'working',
    workspace: 'mobile',
    title: 'Settings refactor',
    seq: 7,
    session: '01a1108c-69c0-7a5e-8d2c-4f6b1e3a9c70',
    shells: [
      { pane: 's2', label: 'landing', cwd: '/work/mobile/landing' },
      { pane: 's3', cwd: '/work/mobile' },
    ],
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

/** Rich demo: a second Agent in the mobile workspace, so it nests two rows. */
const EXTRA_AGENTS: readonly DemoAgent[] = [
  {
    pane: 'p5',
    program: 'claude',
    status: 'idle',
    workspace: 'mobile',
    title: 'Dark mode pass',
    seq: 1,
    workspaceId: 'w1',
  },
];

/** Rich demo: what runs on the Lab Host. */
const LAB_AGENTS: readonly DemoAgent[] = [
  {
    pane: 'p1',
    program: 'codex',
    status: 'working',
    workspace: 'render-farm',
    title: 'Cache warmup',
    seq: 5,
  },
  {
    pane: 'p2',
    program: 'claude',
    status: 'done',
    workspace: 'render-farm',
    title: 'Queue review',
    seq: 3,
    workspaceId: 'w0',
  },
];

function demoSnapshot(list: readonly DemoAgent[] = AGENTS): herdr.SessionSnapshot {
  const wsOf = (a: DemoAgent, index: number) => a.workspaceId ?? `w${index}`;
  const unique = list.filter(
    (a, index) => list.findIndex((o, i) => wsOf(o, i) === wsOf(a, index)) === index,
  );
  return {
    agents: list.map((a, index) => ({
      agent: a.program,
      agent_status: a.status,
      focused: false,
      pane_id: a.pane,
      revision: 1,
      tab_id: `${wsOf(a, index)}:t${a.pane}`,
      terminal_id: `term_${a.pane}`,
      workspace_id: wsOf(a, index),
      cwd: `/work/${a.workspace}`,
      terminal_title_stripped: a.title,
      agent_session: a.session
        ? { agent: a.program, kind: 'id', source: 'demo', value: a.session }
        : null,
      state_change_seq: a.seq,
    })),
    layouts: [],
    panes: list.flatMap((a, index) =>
      (a.shells ?? []).map((shell) => ({
        agent_status: 'unknown' as const,
        cwd: shell.cwd,
        focused: false,
        label: shell.label,
        pane_id: shell.pane,
        revision: 1,
        tab_id: `${wsOf(a, index)}:t${shell.pane}`,
        terminal_id: `term_${shell.pane}`,
        workspace_id: wsOf(a, index),
      })),
    ),
    protocol: 20,
    tabs: [],
    version: 'demo',
    workspaces: unique.map((a, index) => ({
      active_tab_id: `${wsOf(a, index)}:t${a.pane}`,
      agent_status: a.status,
      focused: false,
      label: a.workspace,
      number: index + 1,
      pane_count: 1,
      tab_count: 1,
      workspace_id: wsOf(a, list.indexOf(a)),
    })),
  };
}

/** Offline Transport: a fixed snapshot and a canned prompt for the Blocked Agent. */
export class DemoConsoleTransport extends ScriptedEventsTransport implements ConsoleTransport {
  constructor(private readonly agents: readonly DemoAgent[] = AGENTS) {
    super();
  }

  async sessionSnapshot(): Promise<herdr.SessionSnapshot> {
    return demoSnapshot(this.agents);
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

  async renameWorkspace(_params: { workspace_id: string; label: string }): Promise<void> {}
}

/** A Console store fed by one demo Host (two with `rich`, for the atlas), until the live Transport lands. */
export function createDemoConsoleStore(
  clock: Clock = systemClock,
  transport: DemoConsoleTransport = new DemoConsoleTransport(),
  rich = false,
): ConsoleStore {
  const store = new ConsoleStore({
    pins: new PinnedAgents(new MemoryStorage()),
    clocks: new AgentStatusClocks(demoStampStorage()),
    clock,
  });
  const sessionFor = (host: DemoConsoleTransport) =>
    new EventsSession<DemoConsoleTransport>({
      subscriptions: consoleSubscriptions([]),
      connect: async () => host,
      clock,
      keepalive: null,
    });
  if (!rich) {
    store.addHost(DEMO_HOST, sessionFor(transport));
    seedDemoExtras(store);
    return store;
  }
  store.addHost(DEMO_HOST, sessionFor(new DemoConsoleTransport([...AGENTS, ...EXTRA_AGENTS])));
  store.addHost(LAB_HOST, sessionFor(new DemoConsoleTransport(LAB_AGENTS)));
  seedDemoExtras(store);
  return store;
}

/** Checkout totals and context usage the demo Agents report, as the Swift atlas shows them. */
function seedDemoExtras(store: ConsoleStore): void {
  const window = 200_000;
  store.setRowExtras('demo', 'p1', { changeTotals: { added: 12, removed: 7 } });
  store.setRowExtras('demo', 'p2', { changeTotals: { added: 2, removed: 2 } });
  store.setRowExtras('demo', 'p3', { changeTotals: { added: 5, removed: 1 } });
  store.setRowExtras('demo', 'p4', {
    changeTotals: { added: 1, removed: 1 },
    contextUsage: { usedTokens: 168_000, windowTokens: window },
  });
  store.setRowExtras('demo', 'p5', { changeTotals: { added: 2, removed: 2 } });
  store.setRowExtras('lab', 'p1', { changeTotals: { added: 8, removed: 0 } });
}

/** How long each demo Agent has been in its status (minutes), so ages read "7m", not "now". */
const DEMO_AGE_MINUTES: Record<string, number> = { p1: 4, p2: 7, p3: 18, p4: 42, p5: 26 };

function demoStampStorage(): MemoryStorage {
  const storage = new MemoryStorage();
  const now = Date.now();
  const all = [...AGENTS, ...EXTRA_AGENTS].map((agent) => ({ hostId: 'demo', agent }));
  const entries = all.map(({ hostId, agent }) => ({
    hostId,
    paneId: agent.pane,
    stamp: {
      status: agent.status,
      since: now - (DEMO_AGE_MINUTES[agent.pane] ?? 5) * 60_000,
      isApproximate: false,
      terminalId: `term_${agent.pane}`,
      stateChangeSeq: agent.seq,
      dismissed: false,
    },
  }));
  storage.set(STATUS_CLOCKS_STORAGE_KEY, JSON.stringify({ version: 1, entries }));
  return storage;
}
