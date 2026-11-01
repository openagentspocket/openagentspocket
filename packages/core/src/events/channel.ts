import { BoundedQueue } from './bounded-queue';
import type { Clock } from './clock';
import { failures, failWith } from './failure';
import { EVENTS_BUFFER_LIMIT } from './policies';
import {
  EVENTS_DROPPED,
  type EventSubscription,
  type HerdrEvent,
  type HerdrEventStream,
} from './types';
import { decodeUtf8, encodeUtf8 } from './utf8';
import { checkSubscribeAck, decodeEventLine, subscribeRequestLine } from './wire';

/**
 * A byte duplex to herdr's socket (a direct-streamlocal channel, or the
 * Windows remote-api bridge). The SSH module's `Stream` satisfies it.
 */
export interface EventsDuplex {
  write(data: Uint8Array): Promise<void>;
  onData(listener: (data: Uint8Array) => void): () => void;
  onClose(listener: (reason?: string) => void): () => void;
  close(): Promise<void>;
}

export interface EventsChannelOptions {
  readonly subscriptions: readonly EventSubscription[];
  readonly requestId: string;
  readonly clock: Clock;
  /** Deadline for the acknowledgement. Default 15 s. */
  readonly requestTimeoutMs?: number;
  readonly bufferLimit?: number;
  /** A line longer than this fails the channel. Default 1 MiB. */
  readonly maxLineBytes?: number;
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
export const MAX_RESPONSE_BYTES = 1_048_576;

const NEWLINE = 0x0a;

/** Splits complete lines off `pending`; returns them and the unfinished rest. */
function takeLines(pending: Uint8Array): [lines: Uint8Array[], rest: Uint8Array] {
  const lines: Uint8Array[] = [];
  let start = 0;
  for (
    let index = pending.indexOf(NEWLINE);
    index !== -1;
    index = pending.indexOf(NEWLINE, start)
  ) {
    lines.push(pending.subarray(start, index));
    start = index + 1;
  }
  return [lines, pending.subarray(start)];
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b;
  const joined = new Uint8Array(a.length + b.length);
  joined.set(a);
  joined.set(b, a.length);
  return joined;
}

/**
 * Opens the Host's long-lived events channel on `duplex`: writes the
 * `events.subscribe` request, waits for its acknowledgement (subscribe ack
 * precedes any event), then streams NDJSON event lines into a bounded buffer
 * whose overflow sheds the oldest and enqueues `local.events_dropped`.
 *
 * On any failure before the ack the duplex is closed and the failure thrown.
 * Afterwards a remote close rejects the stream; `end()` finishes it cleanly.
 */
export async function openEventsChannel(
  duplex: EventsDuplex,
  options: EventsChannelOptions,
): Promise<HerdrEventStream> {
  const maxLine = options.maxLineBytes ?? MAX_RESPONSE_BYTES;
  const events = new BoundedQueue<HerdrEvent>(options.bufferLimit ?? EVENTS_BUFFER_LIMIT);
  let pending: Uint8Array = new Uint8Array(0);
  let sawAck = false;
  let ending = false;
  let closed = false;
  let settleAck: { resolve(): void; reject(error: unknown): void } | undefined;
  const ack = new Promise<void>((resolve, reject) => {
    settleAck = { resolve, reject };
  });
  // Awaited below; this only keeps an early failure from reading as unhandled.
  ack.catch(() => {});

  const detach: (() => void)[] = [];
  const shutDown = (failure?: unknown) => {
    if (closed) return;
    closed = true;
    for (const stop of detach) stop();
    void duplex.close().catch(() => {});
    if (!sawAck) settleAck?.reject(failure ?? failWith(failures.cancelled()));
    events.finish(failure);
  };

  const deliver = (line: Uint8Array) => {
    const text = decodeUtf8(line);
    if (!sawAck) {
      try {
        checkSubscribeAck(text, options.requestId);
      } catch (error) {
        shutDown(error);
        return;
      }
      sawAck = true;
      settleAck?.resolve();
      return;
    }
    const event = decodeEventLine(text);
    if (event && events.push(event) === 'dropped') events.push(EVENTS_DROPPED);
  };

  detach.push(
    duplex.onData((chunk) => {
      if (closed) return;
      const [lines, rest] = takeLines(concat(pending, chunk));
      pending = rest.slice();
      if (rest.length > maxLine || lines.some((line) => line.length > maxLine)) {
        shutDown(failWith(failures.malformedResponse(`events line exceeds ${maxLine} bytes`)));
        return;
      }
      for (const line of lines) {
        if (closed) return;
        deliver(line);
      }
    }),
    duplex.onClose((reason) => {
      if (closed || ending) return;
      const detail = sawAck
        ? (reason ?? 'events channel closed by remote')
        : 'events channel ended before ack';
      shutDown(failWith(failures.channelFailed(detail)));
    }),
  );

  try {
    await duplex.write(encodeUtf8(subscribeRequestLine(options.requestId, options.subscriptions)));
  } catch (error) {
    shutDown(error);
    throw error;
  }

  const clearDeadline = options.clock.setTimer(
    options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    () => shutDown(failWith(failures.timedOut())),
  );
  try {
    await ack;
  } finally {
    clearDeadline();
  }

  let ended: Promise<void> | undefined;
  return {
    events,
    end() {
      ended ??= (async () => {
        ending = true;
        if (closed) return;
        closed = true;
        for (const stop of detach) stop();
        await duplex.close().catch(() => {});
        events.finish();
      })();
      return ended;
    },
  };
}
