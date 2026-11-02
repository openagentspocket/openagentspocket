const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as PromiseLike<unknown> | undefined)?.then === 'function';

export interface WriteBatcher {
  push(chunk: Uint8Array): void;
  /** Sends what is queued now. */
  flush(): void;
  dispose(): void;
}

/**
 * Coalesces PTY chunks so a flood crosses the bridge as a few large writes, not thousands of
 * small ones. Sends after `intervalMs` or as soon as `maxBytes` are queued. When `send` returns a
 * promise, only one write is in flight: output piles up meanwhile and goes out when it settles
 * (an unbounded fan of pending native calls overflowed the stack on iOS under `yes`).
 */
export function createWriteBatcher(
  send: (bytes: Uint8Array) => unknown,
  { intervalMs = 8, maxBytes = 65_536 }: { intervalMs?: number; maxBytes?: number } = {},
): WriteBatcher {
  let chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;

  const flush = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (!size || busy) return;
    const out = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    chunks = [];
    size = 0;
    const pending = send(out);
    if (isThenable(pending)) {
      busy = true;
      const done = () => {
        busy = false;
        if (size) flush();
      };
      pending.then(done, done);
    }
  };

  return {
    push(chunk) {
      chunks.push(chunk);
      size += chunk.length;
      if (size >= maxBytes) flush();
      else timer ??= setTimeout(flush, intervalMs);
    },
    flush,
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      chunks = [];
      size = 0;
    },
  };
}
