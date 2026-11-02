// Test support for the Console: fixtures and a scripted Transport. Not exported from the package.

import { BoundedQueue } from '../events/bounded-queue';
import { CallGate, ScriptedEventsTransport } from '../events/scripted-transport';
import { EventsSession } from '../events/session';
import type { EventsSessionStatus, EventsSessionUpdate } from '../events/types';
import { FakeClock } from '../hosts/cancellation';
import type * as herdr from '../protocol/herdr-types.generated';
import type { EventSubscription, HerdrEvent } from '../wire';
import { HostConsoleProjection } from './projection';
import type { ConsoleSession, ConsoleTransport } from './projection-types';
import type { HostIdentity } from './snapshot-rows';
import { consoleSubscriptions } from './subscriptions';

export const testHost = (over: Partial<HostIdentity> = {}): HostIdentity => ({
  id: 'host-1',
  name: 'devbox',
  username: 'root',
  ...over,
});

export function agentInfo(
  paneId: string,
  status: herdr.AgentStatus = 'idle',
  over: Partial<herdr.AgentInfo> = {},
): herdr.AgentInfo {
  return {
    agent: 'claude',
    agent_status: status,
    focused: false,
    pane_id: paneId,
    revision: 1,
    tab_id: 'w1:t1',
    terminal_id: `term_${paneId}`,
    workspace_id: 'w1',
    cwd: '/root/proj',
    terminal_title_stripped: 'Task',
    ...over,
  };
}

export function workspaceInfo(
  id: string,
  label: string,
  over: Partial<herdr.WorkspaceInfo> = {},
): herdr.WorkspaceInfo {
  return {
    active_tab_id: `${id}:t1`,
    agent_status: 'idle',
    focused: false,
    label,
    number: 1,
    pane_count: 1,
    tab_count: 1,
    workspace_id: id,
    ...over,
  };
}

export function tabInfo(
  workspaceId: string,
  label: string,
  number: number,
  suffix = 't1',
): herdr.TabInfo {
  return {
    agent_status: 'idle',
    focused: false,
    label,
    number,
    pane_count: 1,
    tab_id: `${workspaceId}:${suffix}`,
    workspace_id: workspaceId,
  };
}

export function snapshotOf(
  agents: herdr.AgentInfo[] = [],
  over: Partial<herdr.SessionSnapshot> = {},
): herdr.SessionSnapshot {
  return {
    agents,
    layouts: [],
    panes: [],
    protocol: 20,
    tabs: [],
    version: 'test',
    workspaces: [workspaceInfo('w1', 'Proj')],
    ...over,
  };
}

/** A Transport whose snapshot and pane text a test scripts, with gates to hold responses in flight. */
export class ScriptedConsoleTransport extends ScriptedEventsTransport implements ConsoleTransport {
  snapshotFetchCount = 0;
  readonly paneReads: { paneId: string; source: string; lines: number; stripAnsi: boolean }[] = [];
  private current: herdr.SessionSnapshot;
  private snapshotGate: CallGate | undefined;
  private snapshotFailure: Error | undefined;
  private readGate: CallGate | undefined;
  private readonly texts = new Map<string, string>();

  constructor(snapshot: herdr.SessionSnapshot = snapshotOf()) {
    super();
    this.current = snapshot;
  }

  setSnapshot(snapshot: herdr.SessionSnapshot): void {
    this.current = snapshot;
  }

  setPaneText(text: string, paneId: string): void {
    this.texts.set(paneId, text);
  }

  /** Holds the next snapshot response until the gate opens; it carries the state at call time. */
  gateNextSnapshot(gate: CallGate): void {
    this.snapshotGate = gate;
  }

  failNextSnapshot(error: Error): void {
    this.snapshotFailure = error;
  }

  gateNextPaneRead(gate: CallGate): void {
    this.readGate = gate;
  }

  async sessionSnapshot(): Promise<herdr.SessionSnapshot> {
    this.snapshotFetchCount += 1;
    const answer = this.current;
    const gate = this.snapshotGate;
    const failure = this.snapshotFailure;
    this.snapshotGate = undefined;
    this.snapshotFailure = undefined;
    await gate?.waitUntilOpen();
    if (failure) throw failure;
    return answer;
  }

  async readPane(params: {
    paneId: string;
    source: 'recent';
    lines: number;
    stripAnsi: boolean;
  }): Promise<{ text: string }> {
    this.paneReads.push(params);
    const text = this.texts.get(params.paneId) ?? '';
    const gate = this.readGate;
    this.readGate = undefined;
    await gate?.waitUntilOpen();
    return { text };
  }
}

declare const setImmediate: (callback: () => void) => unknown;

/** Lets pending promise work and timers settle, then checks `condition`; fails after `attempts` turns. */
export async function waitUntil(
  description: string,
  condition: () => boolean,
  attempts = 200,
): Promise<void> {
  for (let turn = 0; turn < attempts; turn += 1) {
    if (condition()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`timed out waiting: ${description}`);
}

/** A session a test drives by hand: updates are pushed, nothing reconnects. */
export class FakeConsoleSession<T extends ConsoleTransport> implements ConsoleSession<T> {
  readonly updates = new BoundedQueue<EventsSessionUpdate>();
  readonly latencyUpdates = new BoundedQueue<number>(1);
  readonly terminalTransportGenerations = new BoundedQueue<number>(1);
  readonly subscriptionSets: EventSubscription[][] = [];
  currentLatency: number | undefined;
  currentRouteId: string | undefined;

  constructor(private readonly transport: T) {}

  push(update: EventsSessionUpdate): void {
    this.updates.push(update);
  }

  setStatus(status: EventsSessionStatus): void {
    this.push({ type: 'status', status });
  }

  withTransport<V>(operation: (transport: T) => Promise<V>): Promise<V> {
    return operation(this.transport);
  }

  async updateSubscriptions(subscriptions: readonly EventSubscription[]): Promise<void> {
    this.subscriptionSets.push([...subscriptions]);
  }

  async resume(): Promise<void> {}
  async suspend(): Promise<void> {}
  async retry(): Promise<void> {}
  async revalidate(): Promise<void> {}
  async cancelConnecting(): Promise<void> {}
  async end(): Promise<void> {}
}

export { CallGate };

// A projection over a real EventsSession and the scripted Transport.
export const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

export const statusEvent = (paneId: string, status: string): HerdrEvent => ({
  kind: 'pane.agent_status_changed',
  data: { pane_id: paneId, agent_status: status, state_labels: {} },
});
export const lifecycle = (kind: string): HerdrEvent => ({ kind, data: {} });

export function harness(snapshot = snapshotOf(), options: { snapshotRetryMs?: number } = {}) {
  const transport = new ScriptedConsoleTransport(snapshot);
  const clock = new FakeClock(settle);
  const session = new EventsSession<ScriptedConsoleTransport>({
    subscriptions: consoleSubscriptions([]),
    connect: async () => transport,
    clock,
    keepalive: null,
  });
  const projection = new HostConsoleProjection({
    host: testHost(),
    session,
    clock,
    snapshotRetryMs: options.snapshotRetryMs ?? 1000,
    onChange: () => {},
  });
  projection.start(false);
  const panes = () => [...projection.agentsByPane.keys()];
  const paneSubscribed = (paneId: string) =>
    transport.capturedSubscriptions
      .at(-1)
      ?.some((entry) => entry.kind === 'pane.agent_status_changed' && entry.paneId === paneId) ===
    true;
  return { transport, clock, session, projection, panes, paneSubscribed };
}

export type Harness = ReturnType<typeof harness>;

export async function started(h: Harness, expectedPanes: string[]): Promise<void> {
  await h.projection.session.resume();
  await waitUntil('first snapshot', () => !h.projection.isAwaitingSnapshot);
  for (const paneId of expectedPanes) {
    await waitUntil(`subscribed to ${paneId}`, () => h.paneSubscribed(paneId));
  }
  // The resubscribe's own `connected` asks for one more snapshot; let it settle.
  await waitUntil('post-subscribe resync', () => h.transport.snapshotFetchCount >= 2);
  await h.projection.refresh();
}
