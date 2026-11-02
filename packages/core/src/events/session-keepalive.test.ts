import { describe, expect, it } from 'vitest';
import { FakeClock } from '../hosts/cancellation';
import { failures } from './failure';
import { CallGate, ScriptedEventsTransport, SequencedConnector } from './scripted-transport';
import { EventsSession } from './session';
import type { EventsSessionOptions, EventsTransport } from './session-options';
import { type EventsSessionUpdate, globalSubscription, statusUpdate } from './types';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const initial = [globalSubscription('pane.agent_detected')];
const connecting = statusUpdate({ kind: 'connecting' });
const connected = statusUpdate({ kind: 'connected' });
const suspended = statusUpdate({ kind: 'suspended' });

function harness<T extends EventsTransport>(
  connect: () => Promise<T>,
  options: Partial<EventsSessionOptions<T>> = {},
) {
  const clock = new FakeClock(settle);
  const session = new EventsSession<T>({ subscriptions: initial, connect, clock, ...options });
  const next = async (): Promise<EventsSessionUpdate | undefined> =>
    (await session.updates.next()).value;
  return { clock, session, next };
}

const status = (index: number) => ({
  kind: 'pane.agent_status_changed',
  data: { pane_id: `w1:p${index}`, agent_status: 'working' },
});

describe('EventsSession keepalive', () => {
  it('pings after 30 s of idle, on the same connection', async () => {
    const transport = new ScriptedEventsTransport();
    const connector = new SequencedConnector([transport]);
    const { clock, session, next } = harness(connector.connect);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    expect(transport.pingCount).toBe(1);

    await clock.advance(29_999);
    expect(transport.pingCount).toBe(1);
    await clock.advance(1);
    expect(transport.pingCount).toBe(2);
    await clock.advance(30_000);
    expect(transport.pingCount).toBe(3);
    expect(connector.connectCount).toBe(1);
    expect(transport.isClosed).toBe(false);
    await session.end();
  });

  it('skips pings while events prove the connection alive', async () => {
    const transport = new ScriptedEventsTransport();
    const { clock, session, next } = harness(async () => transport);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);

    // ~90 s of steady events straddles three keepalive wakeups.
    for (let index = 1; index <= 9; index += 1) {
      await clock.advance(10_000);
      expect(transport.emit(status(index))).toBe(true);
      expect(await next()).toMatchObject({ type: 'event' });
    }
    expect(transport.pingCount).toBe(1);

    // Quiet now: the next wakeup that finds 30 s of silence pings again.
    await clock.advance(30_000);
    expect(transport.pingCount).toBe(2);
    await session.end();
  });

  it('treats an unanswered ping as a dead connection and redials', async () => {
    const first = new ScriptedEventsTransport();
    const second = new ScriptedEventsTransport();
    // Ping 1 is the connect path, 2 the first keepalive; 3 is swallowed whole.
    first.failPing(3, failures.timedOut());
    const connector = new SequencedConnector([first, second]);
    const { clock, session, next } = harness(connector.connect);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);

    await clock.advance(60_000);
    expect(await next()).toEqual(
      statusUpdate({
        kind: 'reconnecting',
        attempt: 1,
        delayMs: 1_000,
        failure: failures.timedOut(),
      }),
    );
    await clock.advance(1_000);
    expect(await next()).toEqual(connected);
    expect(first.pingCount).toBe(3);
    // The whole connection is distrusted, not just the channel.
    expect(connector.connectCount).toBe(2);
    expect(first.isClosed).toBe(true);
    expect(second.pingCount).toBe(1);
    expect(second.capturedSubscriptions).toEqual([initial]);
    await session.end();
  });

  it('sends nothing when disabled', async () => {
    const transport = new ScriptedEventsTransport();
    const { clock, session, next } = harness(async () => transport, { keepalive: null });
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    await clock.advance(300_000);
    expect(transport.pingCount).toBe(1);
    await session.end();
  });
});

describe('EventsSession revalidate', () => {
  it('turns a dead link found on foreground into a visible reconnect', async () => {
    const first = new ScriptedEventsTransport();
    const second = new ScriptedEventsTransport();
    const { clock, session, next } = harness(new SequencedConnector([first, second]).connect, {
      keepalive: null,
    });
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);

    first.setConnectionAlive(false);
    await session.revalidate();
    expect(await next()).toMatchObject({
      status: { kind: 'reconnecting', attempt: 1, failure: { kind: 'sshUnreachable' } },
    });
    await clock.advance(1_000);
    expect(await next()).toEqual(connected);
    expect(first.isClosed).toBe(true);
    await session.end();
  });

  it('fails when herdr is gone on return, instead of retrying', async () => {
    const transport = new ScriptedEventsTransport();
    const gone = { kind: 'streamLocalOpenFailed', path: '/tmp/herdr.sock' };
    transport.failPing(2, gone);
    const { session, next } = harness(async () => transport, { keepalive: null });
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    await session.revalidate();
    expect(await next()).toEqual(statusUpdate({ kind: 'failed', failure: gone }));
    await session.end();
  });

  it('stays silent when its ping is cancelled', async () => {
    const transport = new ScriptedEventsTransport();
    transport.failPing(2, failures.cancelled());
    const connector = new SequencedConnector([transport]);
    const { clock, session, next } = harness(connector.connect, { keepalive: null });
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    await session.revalidate();
    await clock.advance(30_000);
    expect(session.updates.size).toBe(0);
    expect(transport.hasLiveStream).toBe(true);
    expect(connector.connectCount).toBe(1);
    await session.end();
  });

  it('is a no-op without a live channel', async () => {
    const transport = new ScriptedEventsTransport();
    const { session } = harness(async () => transport, { keepalive: null });
    await session.revalidate();
    expect(transport.pingCount).toBe(0);
  });
});

describe('EventsSession latency', () => {
  it('stays unproven until the connect ping answers', async () => {
    const transport = new ScriptedEventsTransport();
    const gate = new CallGate();
    transport.gateNextPing(gate);
    const { clock, session, next } = harness(async () => transport, { keepalive: null });
    await session.resume();
    expect(await next()).toEqual(connecting);
    await gate.waitForEntry();
    expect(session.currentLatency).toBeUndefined();
    await clock.advance(42);
    gate.open();
    expect(await next()).toEqual(connected);
    // Published before the `connected` that announces it.
    expect(session.currentLatency).toBe(42);
    expect((await session.latencyUpdates.next()).value).toBe(42);
    await session.end();
  });

  it('never lets a queued sample outlive the connection that measured it', async () => {
    const transport = new ScriptedEventsTransport();
    const { session, next } = harness(async () => transport, { keepalive: null });
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    const proven = session.currentLatency;
    expect(proven).toBeDefined();

    await session.suspend();
    expect(await next()).toEqual(suspended);
    expect(session.currentLatency).toBeUndefined();
    // The dead connection's sample still sits in its own stream.
    expect((await session.latencyUpdates.next()).value).toBe(proven);
    expect(session.currentLatency).toBeUndefined();
    await session.end();
  });

  it('does not inherit the previous connection’s number across a reconnect', async () => {
    const transport = new ScriptedEventsTransport();
    const { session, next } = harness(async () => transport, { keepalive: null });
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    await session.suspend();
    expect(await next()).toEqual(suspended);

    const gate = new CallGate();
    transport.gateNextPing(gate);
    await session.resume();
    expect(await next()).toEqual(connecting);
    await gate.waitForEntry();
    expect(session.currentLatency).toBeUndefined();
    gate.open();
    expect(await next()).toEqual(connected);
    expect(session.currentLatency).toBeDefined();
    await session.end();
  });

  it('drops a ping answered after its connection was replaced', async () => {
    const first = new ScriptedEventsTransport();
    const second = new ScriptedEventsTransport();
    const connector = new SequencedConnector([first, second]);
    const { clock, session, next } = harness(connector.connect, { keepalive: null });
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);

    const parked = new CallGate();
    first.gateNextPing(parked);
    const revalidation = session.revalidate();
    await parked.waitForEntry();
    await clock.advance(500);

    await session.suspend();
    expect(await next()).toEqual(suspended);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    const fresh = session.currentLatency;
    expect(connector.connectCount).toBe(2);

    parked.open();
    await revalidation;
    expect(first.pingCount).toBe(2);
    expect(session.currentLatency).toBe(fresh);
    expect(session.updates.size).toBe(0);
    await session.end();
  });

  it('clears the value on end', async () => {
    const transport = new ScriptedEventsTransport(undefined, 'route-lan');
    const { session, next } = harness(async () => transport, { keepalive: null });
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    expect(session.currentRouteId).toBe('route-lan');
    await session.end();
    expect(await next()).toEqual(statusUpdate({ kind: 'ended' }));
    expect(session.currentLatency).toBeUndefined();
    expect(session.currentRouteId).toBeUndefined();
  });
});
