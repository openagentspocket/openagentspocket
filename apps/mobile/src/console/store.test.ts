import { agentKey } from '@openagentspocket/core';
import { waitFor } from '@testing-library/react-native';
import { createDemoConsoleStore } from './demo';
import type { ConsoleStore } from './store';

async function ready(store: ConsoleStore): Promise<void> {
  for (let turn = 0; turn < 200; turn += 1) {
    if (store.getState().rows.length > 0) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('store never produced rows');
}

describe('ConsoleStore with the demo Host', () => {
  it('lists the Agents in Console order once the snapshot lands', async () => {
    const store = createDemoConsoleStore();
    await ready(store);
    const panes = store.getState().rows.map((row) => row.agent.pane_id);
    expect(panes).toEqual(['p1', 'p4', 'p2', 'p3', 'p5']);
    expect(store.getState().readyHosts.has('demo')).toBe(true);
    store.removeHost('demo');
  });

  it('moves a pinned Agent to the front and notifies subscribers', async () => {
    const store = createDemoConsoleStore();
    await ready(store);
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    store.togglePin('demo', 'p3');
    expect(store.getState().rows[0]?.agent.pane_id).toBe('p3');
    expect(notified).toBeGreaterThan(0);
    store.removeHost('demo');
  });

  it('runs a mutation on the Host and rejects an unknown Host', async () => {
    const store = createDemoConsoleStore();
    await ready(store);
    const value = await store.mutate('demo', async () => 7);
    expect(value).toBe(7);
    expect(() => store.mutate('nope', async () => 1)).toThrow();
    store.removeHost('demo');
    expect(store.getState().hosts).toHaveLength(0);
    expect(store.getState().rows).toHaveLength(0);
  });

  it('lists the workspaces a Host reports, and none for an unknown Host', async () => {
    const store = createDemoConsoleStore();
    await ready(store);
    expect(store.workspaces('demo').map((workspace) => workspace.label)).toContain('api-server');
    expect(store.workspaces('nope')).toEqual([]);
  });

  it('reads the Blocked prompt from the terminal into the row', async () => {
    const store = createDemoConsoleStore();
    await ready(store);
    for (let turn = 0; turn < 200; turn += 1) {
      if (store.getState().rows.find((row) => row.agent.pane_id === 'p1')?.lastOutputSnippet) break;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    const blocked = store.getState().rows[0];
    expect(blocked && agentKey(blocked.hostId, blocked.agent.pane_id)).toBeTruthy();
    expect(blocked?.lastOutputSnippet).toBeTruthy();
    store.removeHost('demo');
  });

  it('reorders pinned Agents with movePin', async () => {
    const store = createDemoConsoleStore();
    await ready(store);
    const front = () =>
      store
        .getState()
        .rows.slice(0, 2)
        .map((row) => row.agent.pane_id);
    store.togglePin('demo', 'p3');
    store.togglePin('demo', 'p2');
    expect(front()).toEqual(['p2', 'p3']);
    store.movePin('demo', 'p3', 'up');
    expect(front()).toEqual(['p3', 'p2']);
    store.removeHost('demo');
  });

  it('reads a Host the user stopped as stopped, not resuming or offline, until it connects again', async () => {
    const store = createDemoConsoleStore();
    await ready(store);
    expect(store.getState().hosts[0]?.link).toBe('live');
    await store.stopConnecting('demo');
    await waitFor(() => expect(store.getState().hosts[0]?.status?.kind).toBe('suspended'));
    expect(store.getState().hosts[0]?.link).toBe('stopped');
    await store.retry('demo');
    await waitFor(() => expect(store.getState().hosts[0]?.link).toBe('live'));
    store.removeHost('demo');
  });
});
