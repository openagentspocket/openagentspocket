import {
  EVENTS_DROPPED,
  type EventSubscription,
  EventsSession,
  FakeClock,
  globalSubscription,
  type HerdrEvent,
  TransportFailure,
} from '@openagentspocket/core';
import { type FakeStream, utf8Encode } from 'agentico-ssh';
import { describe, expect, it } from 'vitest';
import { connectTransport } from './connect';
import { connected, fakeSsh, reply, settingsFor, settle, writtenRequest } from './test-helpers';
import type { SshTransport } from './transport';

const SUBSCRIPTIONS: EventSubscription[] = [{ kind: 'workspace.created' }];
const ack = (id: string) =>
  utf8Encode(`${JSON.stringify({ id, result: { type: 'subscription_started' } })}\n`);
const eventLine = (event: string, data: object = {}) =>
  utf8Encode(`${JSON.stringify({ event, data })}\n`);
const pong = (_s: string, request: Uint8Array) =>
  reply(request, { type: 'pong', version: '0.9.4', protocol: 19 });

async function openStream(transport: SshTransport, streams: () => FakeStream[]) {
  const pending = transport.subscribeToEvents(SUBSCRIPTIONS);
  await settle();
  const stream = streams().at(-1);
  if (!stream) throw new Error('no channel opened');
  stream.emit(ack(writtenRequest(stream).id));
  return { events: await pending, stream };
}

async function next(iterator: AsyncIterator<HerdrEvent>): Promise<HerdrEvent | undefined> {
  return (await iterator.next()).value;
}

describe('events channel', () => {
  it('subscribes over streamlocal and streams events after the ack', async () => {
    const { transport, ssh } = await connected(pong);
    const { events, stream } = await openStream(transport, () => ssh.sessions[0]?.streams ?? []);
    expect(writtenRequest(stream)).toMatchObject({
      method: 'events.subscribe',
      params: { subscriptions: [{ type: 'workspace.created' }] },
    });
    stream.emit(eventLine('workspace_created', { workspace_id: 'w1' }));
    const iterator = events.events[Symbol.asyncIterator]();
    expect(await next(iterator)).toEqual({
      kind: 'workspace.created',
      data: { workspace_id: 'w1' },
    });
    await events.end();
  });

  it('allows one events channel per Host and frees the slot when it ends', async () => {
    const { transport, ssh } = await connected(pong);
    const streams = () => ssh.sessions[0]?.streams ?? [];
    const { events } = await openStream(transport, streams);
    expect(transport.admission.snapshot().events).toBe(1);
    await expect(transport.subscribeToEvents(SUBSCRIPTIONS)).rejects.toMatchObject({
      error: { kind: 'eventsChannelAlreadyOpen' },
    });
    await events.end();
    expect(transport.admission.snapshot().events).toBe(0);
    const again = await openStream(transport, streams);
    await again.events.end();
  });

  it('fails the stream when the remote drops the channel, and the slot frees', async () => {
    const { transport, ssh } = await connected(pong);
    const { events, stream } = await openStream(transport, () => ssh.sessions[0]?.streams ?? []);
    const iterator = events.events[Symbol.asyncIterator]();
    stream.end('connection reset');
    await expect(iterator.next()).rejects.toBeInstanceOf(TransportFailure);
    expect(transport.admission.snapshot().events).toBe(0);
  });

  it("rejects the subscribe with herdr's error and frees the slot", async () => {
    const { transport, ssh } = await connected(pong);
    const pending = transport.subscribeToEvents(SUBSCRIPTIONS);
    await settle();
    const stream = ssh.sessions[0]?.streams[0];
    if (!stream) throw new Error('no channel');
    const { id } = writtenRequest(stream);
    stream.emit(
      utf8Encode(`${JSON.stringify({ id, error: { code: 'pane_not_found', message: 'gone' } })}\n`),
    );
    await expect(pending).rejects.toMatchObject({
      error: { kind: 'apiRejected', code: 'pane_not_found' },
    });
    expect(transport.admission.snapshot().events).toBe(0);
    await openStream(transport, () => ssh.sessions[0]?.streams ?? []);
  });

  it('times out a subscribe that is never acknowledged', async () => {
    const { transport, settings } = await connected(pong);
    const pending = transport.subscribeToEvents(SUBSCRIPTIONS);
    pending.catch(() => undefined);
    await settle();
    await (settings.clock as FakeClock).advance(15_000);
    await expect(pending).rejects.toMatchObject({ error: { kind: 'timedOut' } });
    expect(transport.admission.snapshot().events).toBe(0);
  });

  it('sheds the oldest events under a stall and marks the loss', async () => {
    const { transport, ssh } = await connected(pong);
    const { events, stream } = await openStream(transport, () => ssh.sessions[0]?.streams ?? []);
    for (let n = 0; n < 300; n += 1) stream.emit(eventLine('tab_created', { n }));
    const iterator = events.events[Symbol.asyncIterator]();
    const seen: HerdrEvent[] = [];
    for (let n = 0; n < 256; n += 1) {
      const event = await next(iterator);
      if (event) seen.push(event);
    }
    expect(seen.some((event) => event.kind === EVENTS_DROPPED)).toBe(true);
    await events.end();
  });
});

describe('EventsSession over the SSH transport', () => {
  it('connects, streams, and reconnects after the channel drops', async () => {
    const ssh = await fakeSsh(pong);
    const settings = settingsFor();
    const clock = new FakeClock(settle);
    const session = new EventsSession<SshTransport>({
      subscriptions: [globalSubscription('workspace.created')],
      connect: () => connectTransport(ssh, { ...settings, clock }),
      clock,
      keepalive: null,
    });
    await session.resume();
    const kinds: string[] = [];
    const pump = (async () => {
      for await (const update of session.updates) {
        kinds.push(update.type === 'status' ? update.status.kind : update.type);
        if (kinds.filter((kind) => kind === 'connected').length === 2) return;
      }
    })();
    await settle();
    const first = ssh.sessions[0]?.streams[0];
    if (!first) throw new Error('no events channel');
    first.emit(ack(writtenRequest(first).id));
    await settle();
    first.end('network lost');
    await settle();
    await clock.advance(1_000);
    await settle();
    const second = ssh.sessions.at(-1)?.streams.at(-1);
    if (!second || second === first) throw new Error('no second channel');
    second.emit(ack(writtenRequest(second).id));
    await pump;
    expect(kinds).toContain('reconnecting');
    // A live SSH connection is reused: only the events channel is reopened.
    expect(ssh.sessions[0]?.streams.length).toBe(2);
    await session.end();
  });
});
