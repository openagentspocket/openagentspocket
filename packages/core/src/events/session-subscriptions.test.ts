import { describe, expect, it } from 'vitest';
import { FakeClock } from '../hosts/cancellation';
import { EVENTS_DROPPED_EVENT, type HerdrEvent } from '../wire';
import { failures } from './failure';
import { ScriptedEventsTransport, SequencedConnector } from './scripted-transport';
import { EventsSession } from './session';
import type { EventsSessionOptions, EventsTransport } from './session-options';
import {
  type EventsSessionUpdate,
  eventUpdate,
  globalSubscription,
  paneSubscription,
  statusUpdate,
} from './types';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const initial = [globalSubscription('pane.agent_detected')];
const updated = [...initial, paneSubscription('pane.agent_status_changed', 'w1:p1')];
const connecting = statusUpdate({ kind: 'connecting' });
const connected = statusUpdate({ kind: 'connected' });

const working = (index: number): HerdrEvent => ({
  kind: 'pane.agent_status_changed',
  data: { pane_id: `w1:p${index}`, agent_status: 'working', state_labels: {} },
});

function harness<T extends EventsTransport>(
  connect: () => Promise<T>,
  options: Partial<EventsSessionOptions<T>> = {},
) {
  const clock = new FakeClock(settle);
  const session = new EventsSession<T>({
    subscriptions: initial,
    connect,
    clock,
    keepalive: null,
    ...options,
  });
  const next = async (): Promise<EventsSessionUpdate | undefined> =>
    (await session.updates.next()).value;
  return { clock, session, next };
}

describe('EventsSession subscription updates', () => {
  it('resubscribes a live update on the same connection, without reconnecting', async () => {
    const transport = new ScriptedEventsTransport();
    const { session, next } = harness(async () => transport);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);

    await session.updateSubscriptions(updated);
    expect(await next()).toEqual(connected);
    expect(session.transportGeneration).toBe(0);
    expect(transport.capturedSubscriptions).toEqual([initial, updated]);
    expect(transport.isClosed).toBe(false);

    expect(transport.emit(working(1))).toBe(true);
    expect(await next()).toEqual(eventUpdate(working(1)));
    await session.end();
  });

  it('treats an unchanged set as a no-op', async () => {
    const transport = new ScriptedEventsTransport();
    const { session, next } = harness(async () => transport);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    await session.updateSubscriptions([globalSubscription('pane.agent_detected')]);
    await settle();
    expect(transport.capturedSubscriptions).toEqual([initial]);
    await session.end();
  });

  it('applies an update made while suspended on resume', async () => {
    const transport = new ScriptedEventsTransport();
    const { session, next } = harness(async () => transport);
    await session.updateSubscriptions(updated);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    expect(transport.capturedSubscriptions).toEqual([updated]);
    await session.end();
  });

  it('retries a subscribe that names an exited pane with the baseline, silently', async () => {
    const transport = new ScriptedEventsTransport();
    transport.setMissingPanes(['w1:p1']);
    const { session, next } = harness(async () => transport, { subscriptions: updated });
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    expect(transport.capturedSubscriptions).toEqual([updated, initial]);
    expect(transport.isClosed).toBe(false);
    await session.end();
  });

  it('drops pane subscriptions when the connection drops', async () => {
    const transport = new ScriptedEventsTransport();
    const { clock, session, next } = harness(async () => transport);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    await session.updateSubscriptions(updated);
    expect(await next()).toEqual(connected);

    // The pane exits while the channel is down.
    transport.setMissingPanes(['w1:p1']);
    transport.failEventStream(failures.channelFailed('remote closed'));
    expect(await next()).toMatchObject({ status: { kind: 'reconnecting', attempt: 1 } });
    await clock.advance(1_000);
    expect(await next()).toEqual(connected);
    expect(transport.capturedSubscriptions).toEqual([initial, updated, initial]);
    await session.end();
  });

  it('drops pane subscriptions on an explicit retry too', async () => {
    const transport = new ScriptedEventsTransport();
    const { session, next } = harness(async () => transport);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    await session.updateSubscriptions(updated);
    expect(await next()).toEqual(connected);

    transport.setMissingPanes(['w1:p1']);
    await session.retry();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    expect(transport.capturedSubscriptions).toEqual([initial, updated, initial]);
    await session.end();
  });

  it('drops protocol-19 workspace.reordered until a fresh snapshot proves it again', async () => {
    const first = new ScriptedEventsTransport();
    const replacement = new ScriptedEventsTransport();
    const { session, next } = harness(new SequencedConnector([first, replacement]).connect);
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    const withReorder = [...updated, globalSubscription('workspace.reordered')];
    await session.updateSubscriptions(withReorder);
    expect(await next()).toEqual(connected);
    expect(first.capturedSubscriptions.at(-1)).toEqual(withReorder);

    await session.suspend();
    expect(await next()).toEqual(statusUpdate({ kind: 'suspended' }));
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    expect(replacement.capturedSubscriptions).toEqual([initial]);
    await session.end();
  });
});

describe('EventsSession buffering', () => {
  it('sheds the oldest updates under overflow and surfaces the drop marker', async () => {
    const transport = new ScriptedEventsTransport();
    const { session } = harness(async () => transport, { updatesBufferLimit: 3 });
    await session.resume();
    await settle();
    expect(transport.hasLiveStream).toBe(true);

    // Nobody reads yet: connecting, connected and ten events into three slots.
    for (let index = 1; index <= 10; index += 1) transport.emit(working(index));
    await settle();
    expect(session.droppedUpdateCount).toBeGreaterThan(0);

    const delivered: EventsSessionUpdate[] = [];
    for (let n = session.updates.size; n > 0; n -= 1) {
      const update = (await session.updates.next()).value;
      if (update) delivered.push(update);
    }
    expect(delivered).toContainEqual(eventUpdate(EVENTS_DROPPED_EVENT));
    expect(delivered).toContainEqual(eventUpdate(working(10)));
    // The shed `connected` is gone for good; the marker stands in for it.
    expect(delivered).not.toContainEqual(connected);
    await session.end();
  });

  it('delivers every update in order with no marker under the limit', async () => {
    const transport = new ScriptedEventsTransport();
    const { session, next } = harness(async () => transport, { updatesBufferLimit: 8 });
    await session.resume();
    expect(await next()).toEqual(connecting);
    expect(await next()).toEqual(connected);
    for (const index of [1, 2, 3]) transport.emit(working(index));
    for (const index of [1, 2, 3]) expect(await next()).toEqual(eventUpdate(working(index)));
    expect(session.droppedUpdateCount).toBe(0);
    await session.end();
  });

  it('keeps the suspended status through an overflowing backlog', async () => {
    const transport = new ScriptedEventsTransport();
    const { session, next } = harness(async () => transport, { updatesBufferLimit: 2 });
    await session.resume();
    await settle();
    for (let index = 1; index <= 5000; index += 1) transport.emit(working(index));
    await settle();
    expect(session.droppedUpdateCount).toBeGreaterThan(0);
    await session.suspend();
    expect(await next()).toEqual(statusUpdate({ kind: 'suspended' }));
    expect(await next()).toEqual(eventUpdate(EVENTS_DROPPED_EVENT));
    await session.end();
  });

  it('never yields backlog events after the terminal status when suspend lands mid-drain', async () => {
    const transport = new ScriptedEventsTransport();
    const { session } = harness(async () => transport, { updatesBufferLimit: 10_000 });
    await session.resume();
    await settle();
    for (let index = 1; index <= 5000; index += 1) transport.emit(working(index));
    await session.suspend();
    const delivered: EventsSessionUpdate[] = [];
    for (let n = session.updates.size; n > 0; n -= 1) {
      const update = (await session.updates.next()).value;
      if (update) delivered.push(update);
    }
    expect(delivered.at(-1)).toEqual(statusUpdate({ kind: 'suspended' }));
    expect(delivered.length).toBeLessThan(5003);
    await session.end();
  });
});
