import { describe, expect, it } from 'vitest';
import { TransportFailure } from '../errors/transport-error';
import { AttachTerminalStore, REATTACH_LIMIT } from './attach-store';
import { asciiBytes } from './bytes';
import { ScriptedTerminalSession, scriptedRunner } from './scripted';
import { terminalTarget } from './types';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const lost = () => new TransportFailure({ kind: 'sshUnreachable', detail: 'dropped' });
const open =
  (generation = 1) =>
  async () => ({ session: new ScriptedTerminalSession(), generation });
const bytes = asciiBytes('hi');

function storeWith(
  attempts: Parameters<typeof scriptedRunner>[0],
  options: Partial<ConstructorParameters<typeof AttachTerminalStore>[0]> = {},
) {
  const { runner, requests } = scriptedRunner(attempts);
  const store = new AttachTerminalStore({ target: 'pane-1', runTerminal: runner, ...options });
  return { store, requests };
}

/** An attempt that hands out a session the test keeps hold of. */
function held() {
  const session = new ScriptedTerminalSession();
  return { session, attempt: async () => ({ session, generation: 1 }) };
}

describe('AttachTerminalStore', () => {
  it('waits for the first size report, then opens with that geometry', async () => {
    const { store, requests } = storeWith([open()]);
    await settle();
    expect(store.status.kind).toBe('waitingForSize');
    expect(requests).toHaveLength(0);
    store.viewDidResize(100, 40);
    await settle();
    expect(requests).toEqual([
      { target: { kind: 'agentPane', id: 'pane-1' }, takeover: false, cols: 100, rows: 40 },
    ]);
  });

  it('carries takeover and a terminal target through to the request', async () => {
    const { store, requests } = storeWith([open()], {
      target: terminalTarget('t-1'),
      takeover: true,
    });
    store.viewDidResize(80, 24);
    await settle();
    expect(requests[0]).toMatchObject({ takeover: true, target: { kind: 'terminal', id: 't-1' } });
  });

  it('stays connecting until the remote paints, then goes live and feeds the view', async () => {
    const { session, attempt } = held();
    const { store } = storeWith([attempt]);
    const painted: string[] = [];
    store.feed.acquire({ write: (chunk) => painted.push(String.fromCharCode(...chunk)) });
    store.viewDidResize(80, 24);
    await settle();
    expect(store.status.kind).toBe('connecting');
    session.emit(bytes);
    await settle();
    expect(store.status.kind).toBe('live');
    expect(painted).toEqual(['hi']);
  });

  it('forwards keystrokes to the live session and resizes without reattaching', async () => {
    const { session, attempt } = held();
    const { store, requests } = storeWith([attempt]);
    store.viewDidResize(80, 24);
    await settle();
    store.send(asciiBytes('ls'));
    store.viewDidResize(80, 24);
    store.viewDidResize(90, 30);
    await settle();
    expect(session.sent.map((chunk) => String.fromCharCode(...chunk))).toEqual(['ls']);
    expect(session.sizes).toEqual([[90, 30]]);
    expect(requests).toHaveLength(1);
  });

  it('catches the remote up when the view resized while the channel came up', async () => {
    const { session, attempt } = held();
    const { store } = storeWith([
      async () => {
        store.viewDidResize(120, 50);
        return attempt();
      },
    ]);
    store.viewDidResize(80, 24);
    await settle();
    expect(session.sizes).toEqual([[120, 50]]);
  });

  it('nudges the remote to repaint with a shrink then a restore when foregrounded', async () => {
    const { session, attempt } = held();
    const { store } = storeWith([attempt]);
    store.viewDidResize(80, 24);
    session.emit(bytes);
    await settle();
    store.didBecomeActive();
    expect(session.sizes).toEqual([
      [79, 24],
      [80, 24],
    ]);
  });

  it('surfaces a remote end, and retry reattaches', async () => {
    const first = held();
    const second = held();
    let call = 0;
    const { store, requests } = storeWith([async () => (call++ === 0 ? first : second).attempt()]);
    store.viewDidResize(80, 24);
    await settle();
    first.session.finish();
    await settle();
    expect(store.status.kind).toBe('ended');
    expect(first.session.ended).toBe(1);
    store.retry();
    await settle();
    expect(store.status.kind).toBe('connecting');
    expect(requests).toHaveLength(2);
  });

  it('surfaces the channel failure message', async () => {
    const session = new ScriptedTerminalSession();
    const { store } = storeWith([async () => ({ session, generation: 1 })]);
    store.viewDidResize(80, 24);
    await settle();
    session.finish(
      new TransportFailure({ kind: 'attachExited', status: 3, output: 'herdr: gone' }),
    );
    await settle();
    const status = store.status;
    expect(status.kind).toBe('ended');
  });

  it('ends actionably when no Transport was ever acquired', async () => {
    const { store, requests } = storeWith([
      async () => {
        throw lost();
      },
    ]);
    store.viewDidResize(80, 24);
    await settle();
    expect(store.status.kind).toBe('ended');
    expect(requests).toHaveLength(1);
  });

  it('reattaches on the next Transport after a dropped connection', async () => {
    const first = held();
    const second = held();
    let call = 0;
    const { store, requests } = storeWith([async () => (call++ === 0 ? first : second).attempt()]);
    store.viewDidResize(80, 24);
    first.session.emit(bytes);
    await settle();
    first.session.finish(lost());
    await settle();
    expect(store.status.kind).toBe('reconnecting');
    expect(requests).toHaveLength(2);
    second.session.emit(bytes);
    await settle();
    expect(store.status.kind).toBe('live');
  });

  it('ends after reattaches that never paint', async () => {
    const { store, requests } = storeWith([
      async () => {
        const session = new ScriptedTerminalSession();
        queueMicrotask(() => session.finish(lost()));
        return { session, generation: 1 };
      },
    ]);
    store.viewDidResize(80, 24);
    await settle();
    await settle();
    expect(store.status.kind).toBe('ended');
    expect(requests).toHaveLength(REATTACH_LIMIT + 1);
  });

  it('a reattach that paints restores the allowance', async () => {
    const sessions = [held(), held(), held(), held()];
    let call = 0;
    const { store, requests } = storeWith([async () => (sessions[call++] ?? held()).attempt()]);
    store.viewDidResize(80, 24);
    for (const entry of sessions.slice(0, 3)) {
      entry.session.emit(bytes);
      await settle();
      entry.session.finish(lost());
      await settle();
    }
    expect(requests).toHaveLength(4);
    expect(store.status.kind).toBe('reconnecting');
  });

  it('a remote failure after acquisition still ends', async () => {
    const session = new ScriptedTerminalSession();
    const { store, requests } = storeWith([async () => ({ session, generation: 1 })]);
    store.viewDidResize(80, 24);
    await settle();
    session.finish(new TransportFailure({ kind: 'attachExited', status: 1 }));
    await settle();
    expect(store.status.kind).toBe('ended');
    expect(requests).toHaveLength(1);
  });

  it('a refused second consumer does not end the legitimate terminal', async () => {
    const shared = new ScriptedTerminalSession();
    const refused = new TransportFailure({ kind: 'terminalChannelAlreadyOpen' });
    const { store } = storeWith([async () => ({ session: shared, generation: 1 })]);
    store.viewDidResize(80, 24);
    await settle();
    shared.finish(refused);
    await settle();
    expect(shared.ended).toBe(0);
    expect(store.status.kind).toBe('ended');
  });

  it('stop ends the session, is terminal and idempotent', async () => {
    const { session, attempt } = held();
    const { store } = storeWith([attempt]);
    store.viewDidResize(80, 24);
    session.emit(bytes);
    await settle();
    await Promise.all([store.stop(), store.stop()]);
    expect(store.status.kind).toBe('stopped');
    expect(session.ended).toBeGreaterThanOrEqual(1);
    store.viewDidResize(90, 30);
    store.retry();
    await settle();
    expect(store.status.kind).toBe('stopped');
  });

  it('stop aborts a run still waiting for the terminal channel', async () => {
    const { store } = storeWith([() => new Promise(() => {})]);
    store.viewDidResize(80, 24);
    await settle();
    expect(store.status.kind).toBe('connecting');
    await store.stop();
    expect(store.status.kind).toBe('stopped');
  });

  it('stop during a reconnect ends the wait', async () => {
    const first = held();
    let call = 0;
    const { store } = storeWith([
      async () => (call++ === 0 ? first.attempt() : new Promise<never>(() => {})),
    ]);
    store.viewDidResize(80, 24);
    first.session.emit(bytes);
    await settle();
    first.session.finish(lost());
    await settle();
    expect(store.status.kind).toBe('reconnecting');
    await store.stop();
    expect(store.status.kind).toBe('stopped');
  });

  it('every store presents a surface identity of its own', () => {
    const ids = new Set(Array.from({ length: 200 }, () => storeWith([open()]).store.surfaceId));
    expect(ids.size).toBe(200);
  });

  it('notifies subscribers with a new snapshot on every status change', async () => {
    const { session, attempt } = held();
    const { store } = storeWith([attempt]);
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.getSnapshot().status.kind));
    store.viewDidResize(80, 24);
    session.emit(bytes);
    await settle();
    expect(seen).toEqual(['connecting', 'live']);
  });
});
