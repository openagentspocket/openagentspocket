export interface WriteBatcher {
  push(chunk: Uint8Array): void;
  /** Sends what is queued now. */
  flush(): void;
  dispose(): void;
}

/**
 * Coalesces PTY chunks so a flood crosses the bridge as a few large writes, not thousands of
 * small ones. Sends after `intervalMs` or as soon as `maxBytes` are queued.
 */
export function createWriteBatcher(
  send: (bytes: Uint8Array) => void,
  { intervalMs = 8, maxBytes = 65_536 }: { intervalMs?: number; maxBytes?: number } = {},
): WriteBatcher {
  let chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (!size) return;
    const out = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    chunks = [];
    size = 0;
    send(out);
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
