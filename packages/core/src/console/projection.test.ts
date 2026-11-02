import { describe, expect, it } from 'vitest';
import { failures } from '../events/failure';
import { showsTabLabel } from './row';
import { consoleSubscriptions } from './subscriptions';
import {
  agentInfo,
  CallGate,
  harness,
  lifecycle,
  settle,
  snapshotOf,
  started,
  statusEvent,
  tabInfo,
  waitUntil,
  workspaceInfo,
} from './testing';

describe('HostConsoleProjection snapshot', () => {
  it('stays unknown until the connection delivers its first snapshot', async () => {
    const h = harness(snapshotOf([agentInfo('w1:p1', 'working')]));
    const gate = new CallGate();
    h.transport.gateNextSnapshot(gate);
    await h.projection.session.resume();
    await gate.waitForEntry();
    expect(h.projection.isAwaitingSnapshot).toBe(true);
    expect(h.panes()).toEqual([]);
    gate.open();
    await waitUntil('rows', () => h.panes().length === 1);
    expect(h.projection.isAwaitingSnapshot).toBe(false);
    h.projection.end();
  });

  it('joins workspaces and tabs and keeps snapshot order', async () => {
    const snapshot = snapshotOf(
      [
        agentInfo('single:p', 'working', {
          workspace_id: 'single',
          tab_id: 'single:t1',
          state_change_seq: 7,
          title: 'Pane title',
          terminal_title: '◑ Task',
          terminal_title_stripped: 'Task',
        }),
        agentInfo('multi:p', 'idle', { workspace_id: 'multi', tab_id: 'multi:t1' }),
        agentInfo('named:p', 'idle', { workspace_id: 'named', tab_id: 'named:t1' }),
        agentInfo('missing:p', 'idle', { workspace_id: 'missing', tab_id: 'missing:t1' }),
      ],
      {
        panes: [
          {
            agent_status: 'idle',
            focused: false,
            pane_id: 'multi:p',
            revision: 1,
            tab_id: 'multi:t1',
            terminal_id: 'term',
            workspace_id: 'multi',
            label: 'Manual label',
          },
        ],
        tabs: [
          tabInfo('single', '1', 42),
          tabInfo('single', '1', 42),
          tabInfo('multi', '1', 8),
          tabInfo('named', '2', 2),
          tabInfo('multi', 'Shell', 9, 'shell'),
        ],
        workspaces: [
          workspaceInfo('single', 'Single'),
          workspaceInfo('multi', 'Multi'),
          workspaceInfo('named', 'Named'),
        ],
      },
    );
    const h = harness(snapshot);
    await h.projection.session.resume();
    await waitUntil('rows', () => !h.projection.isAwaitingSnapshot);
    const single = h.projection.agentsByPane.get('single:p');
    const multi = h.projection.agentsByPane.get('multi:p');
    expect(single).toMatchObject({ tabLabel: '1', tabPosition: 1, workspaceTabCount: 1 });
    expect(single && showsTabLabel(single)).toBe(false); // tab number 42 is not its position
    expect(single?.snapshotOrder).toBe(0);
    expect(single?.agent.state_change_seq).toBe(7);
    expect(multi).toMatchObject({
      workspaceTabCount: 2,
      snapshotOrder: 1,
      paneLabel: 'Manual label',
    });
    expect(multi && showsTabLabel(multi)).toBe(true); // counts the shell-only tab too
    const named = h.projection.agentsByPane.get('named:p');
    expect(named && showsTabLabel(named)).toBe(true);
    const missing = h.projection.agentsByPane.get('missing:p');
    expect(missing?.tabLabel).toBeUndefined();
    expect(missing && showsTabLabel(missing)).toBe(false);
    h.projection.end();
  });

  it('exposes the workspaces sorted by label, case-insensitively', async () => {
    const h = harness(
      snapshotOf([], {
        workspaces: [
          workspaceInfo('a', 'beta'),
          workspaceInfo('b', 'Alpha'),
          workspaceInfo('c', 'Gamma'),
        ],
      }),
    );
    await h.projection.session.resume();
    await waitUntil('snapshot', () => !h.projection.isAwaitingSnapshot);
    expect(h.projection.workspaces.map((w) => w.label)).toEqual(['Alpha', 'beta', 'Gamma']);
    h.projection.end();
  });
});

describe('HostConsoleProjection ordering of snapshot and subscription', () => {
  it('requests the first snapshot only after the subscription is acknowledged', async () => {
    // Protocol 18 keeps the snapshot from widening the subscription set, which would resubscribe.
    const h = harness(snapshotOf([], { protocol: 18 }));
    const gate = new CallGate();
    h.transport.gateNextSubscription(gate);
    await h.projection.session.resume();
    await gate.waitForEntry();
    expect(h.transport.snapshotFetchCount).toBe(0);
    gate.open();
    await waitUntil('bootstrap', () => h.transport.snapshotFetchCount === 1);

    const reconnect = new CallGate();
    h.transport.gateNextSubscription(reconnect);
    h.transport.failEventStream(failures.channelFailed('scripted'));
    await h.clock.advance(1000);
    await reconnect.waitForEntry();
    expect(h.transport.snapshotFetchCount).toBe(1);
    reconnect.open();
    await waitUntil('fresh snapshot', () => h.transport.snapshotFetchCount === 2);
    h.projection.end();
  });

  it('pushes pane subscriptions into the session after the snapshot', async () => {
    const h = harness(snapshotOf([agentInfo('w1:p1'), agentInfo('w1:p2')]));
    await h.projection.session.resume();
    await waitUntil('pane subscriptions', () => h.paneSubscribed('w1:p2'));
    const sets = h.transport.capturedSubscriptions;
    expect(sets[0]?.some((entry) => entry.paneId !== undefined)).toBe(false);
    expect(sets.at(-1)?.some((entry) => entry.kind === 'pane.agent_detected')).toBe(true);
    h.projection.end();
  });

  it('asks for workspace.reordered only when the snapshot reports protocol 19', () => {
    const has = (version: number | undefined) =>
      consoleSubscriptions([], version).some((entry) => entry.kind === 'workspace.reordered');
    expect(has(undefined)).toBe(false);
    expect(has(18)).toBe(false);
    expect(has(19)).toBe(true);
  });
});

describe('HostConsoleProjection deltas', () => {
  it('surfaces a status change at once, without waiting for a snapshot', async () => {
    const h = harness(snapshotOf([agentInfo('w1:p1', 'working')]));
    await started(h, ['w1:p1']);
    const gate = new CallGate();
    h.transport.gateNextSnapshot(gate);
    h.transport.emit(statusEvent('w1:p1', 'done'));
    await waitUntil(
      'delta',
      () => h.projection.agentsByPane.get('w1:p1')?.agent.agent_status === 'done',
    );
    gate.open();
    h.projection.end();
  });

  it('keeps a status change that arrived while an older snapshot was in flight', async () => {
    const h = harness(snapshotOf([agentInfo('w1:p1', 'idle')]));
    await started(h, ['w1:p1']);
    expect(h.transport.paneReads).toEqual([]); // an idle Agent's output is never read

    const gate = new CallGate();
    h.transport.gateNextSnapshot(gate);
    h.transport.emit(lifecycle('pane.agent_detected'));
    await gate.waitForEntry();

    // The held response stays idle; the follow-up must represent the Host after the event.
    h.transport.setSnapshot(snapshotOf([agentInfo('w1:p1', 'blocked')]));
    h.transport.emit(statusEvent('w1:p1', 'blocked'));
    await waitUntil(
      'live status',
      () => h.projection.agentsByPane.get('w1:p1')?.agent.agent_status === 'blocked',
    );
    await waitUntil('prompt read', () => h.transport.paneReads.length === 1);

    gate.open();
    await h.projection.refresh();
    expect(h.projection.agentsByPane.get('w1:p1')?.agent.agent_status).toBe('blocked');
    h.projection.end();
  });

  it('re-applies a delta newer than the request over a response that predates it', async () => {
    const h = harness(snapshotOf([agentInfo('w1:p1', 'idle')]));
    await started(h, ['w1:p1']);
    const gate = new CallGate();
    h.transport.gateNextSnapshot(gate); // the response will say idle
    h.transport.emit(lifecycle('pane.created'));
    await gate.waitForEntry();
    h.transport.emit(statusEvent('w1:p1', 'working'));
    await waitUntil(
      'delta',
      () => h.projection.agentsByPane.get('w1:p1')?.agent.agent_status === 'working',
    );
    h.transport.setSnapshot(snapshotOf([agentInfo('w1:p1', 'working')]));
    gate.open();
    await h.projection.refresh();
    expect(h.projection.agentsByPane.get('w1:p1')?.agent.agent_status).toBe('working');
    h.projection.end();
  });

  it('applies a live pane directory, and keeps it over a response that predates it', async () => {
    const h = harness(snapshotOf([agentInfo('w1:p1', 'working', { cwd: '/root/old' })]));
    await started(h, ['w1:p1']);
    const held = new CallGate();
    h.transport.gateNextSnapshot(held);
    h.transport.emit(lifecycle('pane.created'));
    await held.waitForEntry();
    const pane = {
      pane_id: 'w1:p1',
      terminal_id: 'term_w1:p1',
      workspace_id: 'w1',
      tab_id: 'w1:t1',
      cwd: '/root/new',
    };
    h.transport.emit({ kind: 'pane.updated', data: { pane } });
    await waitUntil(
      'directory',
      () => h.projection.agentsByPane.get('w1:p1')?.paneDirectory === '/root/new',
    );
    const revision = h.projection.sidebarRevision;
    held.open();
    await waitUntil('stale response applied', () => h.projection.sidebarRevision > revision);
    expect(h.projection.agentsByPane.get('w1:p1')?.paneDirectory).toBe('/root/new');
    h.projection.end();
  });

  it('ignores a pane update for another terminal', async () => {
    const h = harness(snapshotOf([agentInfo('w1:p1', 'working')]));
    await started(h, ['w1:p1']);
    const pane = {
      pane_id: 'w1:p1',
      terminal_id: 'someone_else',
      workspace_id: 'w1',
      tab_id: 'w1:t1',
      cwd: '/elsewhere',
    };
    h.transport.emit({ kind: 'pane.updated', data: { pane } });
    await settle();
    expect(h.projection.agentsByPane.get('w1:p1')?.paneDirectory).toBeUndefined();
    h.projection.end();
  });
});
