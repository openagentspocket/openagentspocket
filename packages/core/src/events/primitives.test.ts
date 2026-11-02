import { describe, expect, it } from 'vitest';
import { TransportFailure } from '../errors/transport-error';
import { FakeClock } from '../hosts/cancellation';
import { eventKindFromWire } from '../wire';
import { BoundedQueue } from './bounded-queue';
import { failures } from './failure';
import { batchPerFrame } from './frame-batcher';
import { DEFAULT_RECONNECT_POLICY, reconnectDelay } from './policies';
import {
  GENERATED_PROTOCOL_VERSION,
  MINIMUM_PROTOCOL_VERSION,
  serverInfoFromPing,
} from './protocol';
import { decodeUtf8, encodeUtf8 } from './utf8';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('reconnectDelay', () => {
  it('backs off 1, 2, 4, 8, 16 s, then holds at 30 s', () => {
    const delays = [1, 2, 3, 4, 5, 6, 7, 50].map((n) =>
      reconnectDelay(DEFAULT_RECONNECT_POLICY, n),
    );
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]);
  });

  it('treats a multiplier below 1 as a constant delay', () => {
    const policy = { initialDelayMs: 10, multiplier: 0, maxDelayMs: 50 };
    expect([1, 2, 9].map((n) => reconnectDelay(policy, n))).toEqual([10, 10, 10]);
  });
});

describe('serverInfoFromPing (protocol floor)', () => {
  it('is a floor at 17, never an equality check', () => {
    expect(MINIMUM_PROTOCOL_VERSION).toBe(17);
    for (const protocolVersion of [17, 19, GENERATED_PROTOCOL_VERSION, 40]) {
      expect(serverInfoFromPing({ version: 'x', protocolVersion }).protocolVersion).toBe(
        protocolVersion,
      );
    }
  });

  it('rejects an older protocol as a non-retryable mismatch', () => {
    let thrown: unknown;
    try {
      serverInfoFromPing({ version: 'old', protocolVersion: 16 });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TransportFailure);
    expect((thrown as TransportFailure).error).toEqual(failures.protocolVersionMismatch(16, 17));
  });

  it('flags a newer-than-generated protocol as advisory only', () => {
    expect(serverInfoFromPing({ version: 'x', protocolVersion: 22 }).exceedsGeneratedProtocol).toBe(
      false,
    );
    expect(serverInfoFromPing({ version: 'x', protocolVersion: 23 }).exceedsGeneratedProtocol).toBe(
      true,
    );
  });
});

describe('eventKindFromWire', () => {
  it('maps snake_case event lines and dotted names onto one kind', () => {
    expect(eventKindFromWire('pane_agent_status_changed')).toBe('pane.agent_status_changed');
    expect(eventKindFromWire('workspace_metadata_updated')).toBe('workspace.metadata_updated');
    expect(eventKindFromWire('pane.created')).toBe('pane.created');
    expect(eventKindFromWire('pane_output_matched')).toBe('pane.output_matched');
  });

  it('passes unknown kinds through untouched', () => {
    expect(eventKindFromWire('future_thing_happened')).toBe('future_thing_happened');
  });
});

describe('BoundedQueue', () => {
  it('keeps the newest items and reports each shed', () => {
    const queue = new BoundedQueue<number>(2);
    expect([1, 2, 3].map((n) => queue.push(n))).toEqual(['enqueued', 'enqueued', 'dropped']);
    expect(queue.size).toBe(2);
  });

  it('hands an item straight to a waiting consumer without buffering it', async () => {
    const queue = new BoundedQueue<number>(1);
    const next = queue.next();
    expect(queue.push(1)).toBe('enqueued');
    expect(queue.push(2)).toBe('enqueued');
    expect(await next).toEqual({ value: 1, done: false });
    expect(queue.size).toBe(1);
  });

  it('delivers buffered items before ending or rejecting', async () => {
    const failing = new BoundedQueue<number>();
    failing.push(1);
    failing.finish(new Error('gone'));
    expect(failing.push(2)).toBe('terminated');
    expect(await failing.next()).toEqual({ value: 1, done: false });
    await expect(failing.next()).rejects.toThrow('gone');

    const clean = new BoundedQueue<number>();
    clean.push(1);
    clean.finish();
    const seen: number[] = [];
    for await (const value of clean) seen.push(value);
    expect(seen).toEqual([1]);
  });

  it('admits a single consumer', async () => {
    const queue = new BoundedQueue<number>();
    void queue.next();
    await expect(queue.next()).rejects.toThrow('single consumer');
  });
});

describe('utf8', () => {
  it('round-trips 1- to 4-byte characters', () => {
    const text = 'a ñ € 😀 end';
    expect(decodeUtf8(encodeUtf8(text))).toBe(text);
    expect(encodeUtf8('😀')).toEqual(Uint8Array.from([0xf0, 0x9f, 0x98, 0x80]));
  });

  it('replaces invalid and truncated input with U+FFFD', () => {
    expect(decodeUtf8(Uint8Array.from([0x61, 0xff, 0x62]))).toBe('a�b');
    expect(decodeUtf8(Uint8Array.from([0xe2, 0x82]))).toBe('�');
    expect(decodeUtf8(Uint8Array.from([0xc0, 0x80]))).toBe('��');
    expect(decodeUtf8(encodeUtf8('\ud800'))).toBe('�');
  });
});

describe('FakeClock', () => {
  it('fires timers in time order, including ones scheduled inside the window', async () => {
    const clock = new FakeClock(settle);
    const fired: string[] = [];
    clock.setTimeout(() => fired.push('b'), 20);
    clock.setTimeout(() => {
      fired.push('a');
      clock.setTimeout(() => fired.push('a+5'), 5);
    }, 10);
    clock.clearTimeout(clock.setTimeout(() => fired.push('cancelled'), 12));
    await clock.advance(19);
    expect(fired).toEqual(['a', 'a+5']);
    expect(clock.monotonicMs()).toBe(19);
    await clock.advance(1);
    expect(fired).toEqual(['a', 'a+5', 'b']);
    expect(clock.pendingTimers).toBe(0);
  });
});

describe('batchPerFrame', () => {
  it('delivers one ordered batch per frame and flushes the tail when the source ends', async () => {
    const source = new BoundedQueue<number>();
    const frames: (() => void)[] = [];
    const batches: number[][] = [];
    const batcher = batchPerFrame(
      source,
      (flush) => frames.push(flush),
      (batch) => batches.push([...batch]),
    );

    for (const n of [1, 2, 3]) source.push(n);
    await settle();
    expect(frames).toHaveLength(1);
    expect(batches).toEqual([]);
    frames.shift()?.();
    expect(batches).toEqual([[1, 2, 3]]);

    source.push(4);
    await settle();
    expect(frames).toHaveLength(1);
    source.push(5);
    source.finish();
    await batcher.done;
    expect(batches).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
    frames.shift()?.();
    expect(batches).toHaveLength(2);
  });

  it('discards pending items once stopped', async () => {
    const source = new BoundedQueue<number>();
    const frames: (() => void)[] = [];
    const batches: number[][] = [];
    const batcher = batchPerFrame(
      source,
      (flush) => frames.push(flush),
      (batch) => batches.push([...batch]),
    );
    source.push(1);
    await settle();
    batcher.stop();
    frames.shift()?.();
    source.push(2);
    source.finish();
    await batcher.done;
    expect(batches).toEqual([]);
  });
});
