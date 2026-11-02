import { fromBase64 } from 'agentico-ssh';

/** Frame and timer cadence of the JS thread while a scenario runs; the spike's jank signal. */
export interface Cadence {
  stop(): { frames: number; over33: number; over100: number; maxGapMs: number; timerMaxMs: number };
}

export function measureCadence(): Cadence {
  let frames = 0;
  let over33 = 0;
  let over100 = 0;
  let maxGap = 0;
  let last = Date.now();
  let timerMax = 0;
  let timerLast = Date.now();
  let raf = 0;
  const tick = () => {
    const now = Date.now();
    const gap = now - last;
    last = now;
    frames++;
    if (gap > 33) over33++;
    if (gap > 100) over100++;
    maxGap = Math.max(maxGap, gap);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  const timer = setInterval(() => {
    const now = Date.now();
    timerMax = Math.max(timerMax, now - timerLast - 50);
    timerLast = now;
  }, 50);
  return {
    stop() {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      return { frames, over33, over100, maxGapMs: maxGap, timerMaxMs: Math.max(0, timerMax) };
    },
  };
}

/** Everything a PTY printed: byte count, a bounded tail of text, and waiters for a marker. */
export interface Sink {
  push(data: Uint8Array): void;
  /** A chunk still base64: counts its bytes and decodes only its last few KB for the tail. */
  pushEncoded(base64: string): void;
  bytes(): number;
  tail(): string;
  waitFor(text: string, timeoutMs?: number): Promise<number>;
}

export function makeSink(decode: (bytes: Uint8Array) => string, limit = 4096): Sink {
  let total = 0;
  let tail = '';
  const waiters = new Set<() => void>();
  const add = (data: Uint8Array) => {
    tail = (tail + decode(data)).slice(-limit);
    for (const waiter of [...waiters]) waiter();
  };
  return {
    pushEncoded(base64) {
      const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
      total += (base64.length / 4) * 3 - padding;
      const from = Math.max(0, Math.floor((base64.length - limit * 2) / 4) * 4);
      add(fromBase64(base64.slice(from)));
    },
    push(data) {
      total += data.length;
      // Only the last `limit` bytes can reach the tail; decoding a flood in JS would be the load.
      tail = (tail + decode(data.length > limit ? data.subarray(data.length - limit) : data)).slice(
        -limit,
      );
      for (const waiter of [...waiters]) waiter();
    },
    bytes: () => total,
    tail: () => tail,
    waitFor: (text, timeoutMs = 15_000) =>
      new Promise((resolve, reject) => {
        const started = Date.now();
        const check = () => {
          if (!tail.includes(text)) return;
          waiters.delete(check);
          clearTimeout(timer);
          resolve(Date.now() - started);
        };
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(new Error(`timed out waiting for ${text}; tail: ${tail.slice(-80)}`));
        }, timeoutMs);
        waiters.add(check);
        check();
      }),
  };
}
