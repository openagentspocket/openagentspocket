import type { ConsoleAgent } from './agents';

/** Offline stand-in for the SSH transport: fixed demo Agents, no network. */
export interface AgentSource {
  listAgents(): Promise<ConsoleAgent[]>;
}

const DEMO: ConsoleAgent[] = [
  {
    hostId: 'demo',
    hostName: 'Demo Host',
    paneId: 'p1',
    name: 'claude',
    status: 'blocked',
    workspaceLabel: 'api-server',
    summary: 'Wants to run the migration. Needs your approval.',
    stateChangeSeq: 9,
  },
  {
    hostId: 'demo',
    hostName: 'Demo Host',
    paneId: 'p2',
    name: 'codex',
    status: 'working',
    workspaceLabel: 'mobile',
    summary: 'Refactoring the settings screen.',
    stateChangeSeq: 7,
  },
  {
    hostId: 'demo',
    hostName: 'Demo Host',
    paneId: 'p3',
    name: 'omp',
    status: 'working',
    workspaceLabel: 'docs',
    summary: 'Rewriting the install guide.',
    stateChangeSeq: 4,
  },
  {
    hostId: 'demo',
    hostName: 'Demo Host',
    paneId: 'p4',
    name: 'claude',
    status: 'done',
    workspaceLabel: 'infra',
    summary: 'Finished the lint cleanup.',
    stateChangeSeq: 2,
  },
];

export class FakeTransport implements AgentSource {
  constructor(private readonly agents: readonly ConsoleAgent[] = DEMO) {}

  async listAgents(): Promise<ConsoleAgent[]> {
    return this.agents.map((agent) => ({ ...agent }));
  }
}
