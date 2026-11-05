import { describe, expect, it } from 'vitest';
import { failures } from '../events/failure';
import { FakeClock } from '../hosts/cancellation';
import { EVENTS_DROPPED_EVENT } from '../wire';
import { HostConsoleProjection } from './projection';
import {
  agentInfo,
  CallGate,
  FakeConsoleSession,
  harness,
  lifecycle,
  ScriptedConsoleTransport,
  settle,
  snapshotOf,
  started,
  statusEvent,
  testHost,
  waitUntil,
} from './testing';

describe('HostConsoleProjection resync', () => {
  it('runs one resync at a time and folds a burst into one pending follow-up', async () => {
    const h = harness(snapshotOf([agentInfo('w1:p1')]));
    await started(h, ['w1:p1']);
    const before = h.transport.snapshotFetchCount;
    const gate = new CallGate();
    h.transport.gateNextSnapshot(gate);
    h.transport.emit(lifecycle('tab.created'));
    await gate.waitForEntry();
    for (let i = 0; i < 5; i += 1) h.transport.emit(lifecycle('tab.closed'));
    await settle();
    expect(h.transport.snapshotFetchCount).toBe(before + 1);
    gate.open();
    await waitUntil('follow-up', () => h.transport.snapshotFetchCount === before + 2);
    for (let i = 0; i < 5; i += 1) await settle();
    expect(h.transport.snapshotFetchCount).toBe(before + 2);
    h.projection.end();
  });

  it('converges on a lifecycle event that arrived during the initial snapshot', async () => {
    const h = harness(snapshotOf());
    const gate = new CallGate();
    h.transport.gateNextSnapshot(gate);
    await h.projection.session.resume();
    await gate.waitForEntry();
    h.transport.setSnapshot(snapshotOf([agentInfo('w1:p-new')]));
    h.transport.emit({ kind: 'pane.agent_detected', data: { pane_id: 'w1:p-new' } });
    gate.open();
    await waitUntil('converged', () => h.panes().join() === 'w1:p-new');
    expect(h.transport.snapshotFetchCount).toBeGreaterThanOrEqual(2);
    h.projection.end();
  });

  it('resyncs from a fresh snapshot after the stream drops', async () => {
    const h = harness(snapshotOf([agentInfo('w1:p1', 'idle')]));
    await started(h, ['w1:p1']);
    h.transport.setSnapshot(
      snapshotOf([agentInfo('w1:p1', 'blocked'), agentInfo('w1:p9', 'working')]),
    );
    h.transport.failEventStream(failures.channelFailed('stream died'));
    await waitUntil('reconnecting', () => h.projection.status?.kind === 'reconnecting');
    await h.clock.advance(1000);
    await waitUntil('new snapshot', () => h.panes().join() === 'w1:p1,w1:p9');
    expect(h.projection.agentsByPane.get('w1:p1')?.agent.agent_status).toBe('blocked');
    h.projection.end();
  });

  it('keeps the rows, marked stale, while the Host reconnects', async () => {
    const h = harness(snapshotOf([agentInfo('w1:p1', 'working')]));
    await started(h, ['w1:p1']);
    expect(h.projection.isStale).toBe(false);
    h.transport.failEventStream(failures.channelFailed('offline'));
    await waitUntil('reconnecting', () => h.projection.status?.kind === 'reconnecting');
    expect(h.panes()).toEqual(['w1:p1']);
    expect(h.projection.isAwaitingSnapshot).toBe(true);
    expect(h.projection.isStale).toBe(true);
    h.projection.end();
  });

  it('is not stale before any snapshot: an empty projection is unknown', () => {
    const h = harness(snapshotOf([agentInfo('w1:p1', 'working')]));
    expect(h.projection.isStale).toBe(false);
    expect(h.projection.isAwaitingSnapshot).toBe(true);
    h.projection.end();
  });

  it('keeps the rows over a background and foreground, and drops a removed Agent only with the fresh snapshot', async () => {
    const h = harness(snapshotOf([agentInfo('w1:p1', 'working'), agentInfo('w1:p2', 'idle')]));
    await started(h, ['w1:p1', 'w1:p2']);
    await h.projection.session.suspend();
    await waitUntil('suspended', () => h.projection.status?.kind === 'suspended');
    expect(h.panes()).toEqual(['w1:p1', 'w1:p2']);
    expect(h.projection.isStale).toBe(true);
    // p2 was closed while the app was away.
    h.transport.setSnapshot(snapshotOf([agentInfo('w1:p1', 'working')]));
    const gate = new CallGate();
    h.transport.gateNextSnapshot(gate);
    await h.projection.session.resume();
    await gate.waitForEntry();
    expect(h.panes()).toEqual(['w1:p1', 'w1:p2']);
    expect(h.projection.isStale).toBe(true);
    gate.open();
    await waitUntil('fresh snapshot', () => !h.projection.isAwaitingSnapshot);
    expect(h.panes()).toEqual(['w1:p1']);
    expect(h.projection.isStale).toBe(false);
    h.projection.end();
  });

  it('never lets a response from before a disconnect repopulate the rows', async () => {
    const h = harness(snapshotOf([agentInfo('w1:p1', 'working')]));
    await started(h, ['w1:p1']);
    const gate = new CallGate();
    h.transport.gateNextSnapshot(gate);
    h.transport.emit(lifecycle('workspace.metadata_updated'));
    await gate.waitForEntry();
    h.transport.failEventStream(failures.channelFailed('offline'));
    await waitUntil('reconnecting', () => h.projection.status?.kind === 'reconnecting');
    gate.open();
    await settle();
    await settle();
    // The old response is discarded: it did not become the fresh snapshot.
    expect(h.projection.isAwaitingSnapshot).toBe(true);
    expect(h.projection.isStale).toBe(true);
    h.projection.end();
  });

  it('converges from a fresh snapshot when the disconnect hit the initial one', async () => {
    const h = harness(snapshotOf([agentInfo('w1:p1', 'idle')]));
    const gate = new CallGate();
    h.transport.gateNextSnapshot(gate);
    await h.projection.session.resume();
    await gate.waitForEntry();
    h.transport.setSnapshot(snapshotOf([agentInfo('w1:p1', 'blocked')]));
    h.transport.failEventStream(failures.channelFailed('ordering barrier'));
    await waitUntil('reconnecting', () => h.projection.status?.kind === 'reconnecting');
    gate.open();
    await settle();
    expect(h.projection.isAwaitingSnapshot).toBe(true);
    expect(h.panes()).toEqual([]);
    await h.clock.advance(1000);
    await waitUntil(
      'fresh',
      () => h.projection.agentsByPane.get('w1:p1')?.agent.agent_status === 'blocked',
    );
    h.projection.end();
  });

  it('resnapshots on an unknown status and drops the released Agent', async () => {
    const h = harness(snapshotOf([agentInfo('w1:p1', 'working')]));
    await started(h, ['w1:p1']);
    h.transport.setSnapshot(snapshotOf());
    h.transport.emit(statusEvent('w1:p1', 'unknown'));
    await waitUntil('gone', () => h.panes().length === 0);
    h.projection.end();
  });

  it('resyncs on the drop marker a full events buffer leaves behind', async () => {
    const transport = new ScriptedConsoleTransport(snapshotOf([agentInfo('w1:p1', 'idle')]));
    const session = new FakeConsoleSession(transport);
    const projection = new HostConsoleProjection({
      host: testHost(),
      session,
      clock: new FakeClock(settle),
      snapshotRetryMs: 1000,
      onChange: () => {},
    });
    projection.start(false);
    session.setStatus({ kind: 'connected' });
    await waitUntil('first snapshot', () => !projection.isAwaitingSnapshot);
    // The server changed with no membership event: only the marker can reach the new snapshot.
    transport.setSnapshot(snapshotOf([agentInfo('w1:p1', 'idle'), agentInfo('w1:p9', 'blocked')]));
    session.push({ type: 'event', event: EVENTS_DROPPED_EVENT });
    await waitUntil('marker resync', () => projection.agentsByPane.has('w1:p9'));
    projection.end();
  });

  it('surfaces a snapshot failure and retries until it recovers', async () => {
    const h = harness(snapshotOf([agentInfo('w1:p1')]));
    h.transport.failNextSnapshot(new Error('boom'));
    await h.projection.session.resume();
    await waitUntil('sync error', () => h.projection.syncError !== undefined);
    expect(h.projection.isAwaitingSnapshot).toBe(true);
    await h.clock.advance(1000);
    await waitUntil('recovered', () => h.panes().length === 1);
    expect(h.projection.syncError).toBeUndefined();
    h.projection.end();
  });
});

describe('HostConsoleProjection Blocked prompt', () => {
  it('reads the prompt of a Blocked Agent as recent, ANSI-stripped text', async () => {
    const h = harness(snapshotOf([agentInfo('w1:p1', 'blocked')]));
    h.transport.setPaneText('\n› Allow Claude to run rm -rf?\n\n  1. Yes  2. No\n', 'w1:p1');
    await h.projection.session.resume();
    await waitUntil('prompt', () => !!h.projection.agentsByPane.get('w1:p1')?.lastOutputSnippet);
    const row = h.projection.agentsByPane.get('w1:p1');
    expect(row?.lastOutputSnippet).toContain('rm -rf');
    expect(h.transport.paneReads[0]).toMatchObject({ source: 'recent', stripAnsi: true });
    h.projection.end();
  });

  it('schedules a follow-up read when a new prompt arrives during a read', async () => {
    const h = harness(snapshotOf([agentInfo('w1:p1', 'blocked')]));
    h.transport.setPaneText('First prompt?', 'w1:p1');
    await started(h, ['w1:p1']);
    await waitUntil(
      'first',
      () => h.projection.agentsByPane.get('w1:p1')?.lastOutputSnippet === 'First prompt?',
    );

    const stale = new CallGate();
    h.transport.gateNextPaneRead(stale);
    h.transport.emit(statusEvent('w1:p1', 'blocked'));
    await stale.waitForEntry();
    const reads = h.transport.paneReads.length;

    const followUp = new CallGate();
    h.transport.setPaneText('Second prompt?', 'w1:p1');
    h.transport.gateNextPaneRead(followUp);
    h.transport.emit(statusEvent('w1:p1', 'blocked'));
    await settle();
    expect(h.transport.paneReads.length).toBe(reads); // the second wait is queued, not started

    stale.open();
    await followUp.waitForEntry();
    followUp.open();
    await waitUntil(
      'replaced',
      () => h.projection.agentsByPane.get('w1:p1')?.lastOutputSnippet === 'Second prompt?',
    );
    h.projection.end();
  });

  it('clears the prompt without reading when the Agent leaves Blocked', async () => {
    const h = harness(snapshotOf([agentInfo('w1:p1', 'blocked')]));
    h.transport.setPaneText('Allow this command?', 'w1:p1');
    await started(h, ['w1:p1']);
    await waitUntil('prompt', () => !!h.projection.agentsByPane.get('w1:p1')?.lastOutputSnippet);
    const reads = h.transport.paneReads.length;
    h.transport.setSnapshot(snapshotOf([agentInfo('w1:p1', 'working')]));
    h.transport.emit(statusEvent('w1:p1', 'working'));
    await waitUntil('cleared', () => {
      const row = h.projection.agentsByPane.get('w1:p1');
      return row?.agent.agent_status === 'working' && row.lastOutputSnippet === undefined;
    });
    await h.projection.refresh();
    expect(h.transport.paneReads.length).toBe(reads);
    h.projection.end();
  });
});

describe('HostConsoleProjection connection facts', () => {
  it('drops the latency with the connection that measured it', async () => {
    const h = harness(snapshotOf());
    expect(h.projection.routeId).toBeUndefined();
    await h.projection.session.resume();
    await waitUntil('connected', () => h.projection.status?.kind === 'connected');
    h.transport.failEventStream(failures.channelFailed('x'));
    await waitUntil('reconnecting', () => h.projection.status?.kind === 'reconnecting');
    expect(h.projection.latency).toBeUndefined();
    h.projection.end();
  });

  it('refuses to focus before the Host is ready, and for an Agent that is not Done', async () => {
    const h = harness(snapshotOf([agentInfo('w1:p1', 'working'), agentInfo('w1:p2', 'done')]));
    const focus = async () => {};
    await expect(h.projection.focusAgent('w1:p2', focus)).rejects.toThrow();
    await started(h, ['w1:p1', 'w1:p2']);
    let focused = 0;
    await h.projection.focusAgent('w1:p1', async () => {
      focused += 1;
    });
    expect(focused).toBe(0);
    await h.projection.focusAgent('w1:p2', async () => {
      focused += 1;
    });
    expect(focused).toBe(1);
    await expect(h.projection.focusAgent('missing', focus)).rejects.toThrow();
    h.projection.end();
  });
});
