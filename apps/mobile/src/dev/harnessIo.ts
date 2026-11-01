import { type SshSession, type Stream, utf8Decode, utf8Encode } from 'agentico-ssh';

/** Fails a harness step with a short reason. */
export function check(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(reason);
}

/** One herdr API request over a fresh direct-streamlocal channel; returns the parsed line. */
export async function herdr(
  session: SshSession,
  socketPath: string,
  method: string,
  params: Record<string, unknown> = {},
  maxResponseBytes?: number,
): Promise<{ id?: string; result?: Record<string, unknown>; error?: unknown; bytes: number }> {
  const id = `${method}-${Date.now()}`;
  const line = `${JSON.stringify({ id, method, params })}\n`;
  const response = await session.exchangeStreamLocal(socketPath, utf8Encode(line), {
    maxResponseBytes,
  });
  const parsed = JSON.parse(utf8Decode(response));
  check(parsed.error || parsed.id === id, `response id ${parsed.id} is not ${id}`);
  return { ...parsed, bytes: response.length };
}

export interface Tap {
  /** Everything received so far, UTF-8 decoded (first 256 KiB). */
  text(): string;
  bytes(): number;
  closed(): boolean;
  /** Resolves once `done` holds (checked on every chunk and at close); rejects on timeout. */
  waitFor(done: (tap: Tap) => boolean, timeoutMs?: number): Promise<void>;
}

/** Listens to a stream once for its whole life, so no chunk falls between two waits. */
export function tap(stream: Stream): Tap {
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let isClosed = false;
  let decoded: string | undefined;
  const waiters = new Set<() => void>();
  const notify = () => {
    for (const waiter of [...waiters]) waiter();
  };
  const self: Tap = {
    text: () => {
      decoded ??= utf8Decode(concat(chunks));
      return decoded;
    },
    bytes: () => bytes,
    closed: () => isClosed,
    waitFor: (done, timeoutMs = 15_000) =>
      new Promise((resolve, reject) => {
        const waiter = () => {
          if (!done(self)) return;
          waiters.delete(waiter);
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error(`timed out after ${bytes} bytes: ${self.text().slice(-120)}`));
        }, timeoutMs);
        waiters.add(waiter);
        waiter();
      }),
  };
  stream.onData((data) => {
    bytes += data.length;
    if (bytes - data.length < 262_144) {
      chunks.push(data);
      decoded = undefined;
    }
    notify();
  });
  stream.onClose(() => {
    isClosed = true;
    notify();
  });
  return self;
}

export function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Posts to the local harness fixture (loopback HTTP). */
export async function post(port: number, path: string, body: string): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', body });
  const text = await response.text();
  check(response.ok, `${path} answered ${response.status}`);
  return text;
}
