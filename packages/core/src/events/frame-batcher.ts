/**
 * Schedules `flush` before the next frame. In the app: `requestAnimationFrame`
 * (or `InteractionManager`/`setTimeout(…, 0)` off the UI thread).
 */
export type FrameScheduler = (flush: () => void) => void;

export interface FrameBatcher {
  /** Resolves once the source ended and the final batch was delivered. */
  readonly done: Promise<void>;
  /** Stops delivering; anything not yet delivered is discarded. */
  stop(): void;
}

/**
 * Drains `source` (for example `EventsSession.updates`) as its only consumer
 * and hands the UI one batch per frame instead of one render per event.
 * Batches keep arrival order. When the source ends, whatever is pending is
 * delivered at once, so a final `ended` status is never stranded.
 */
export function batchPerFrame<T>(
  source: AsyncIterable<T>,
  schedule: FrameScheduler,
  onBatch: (batch: readonly T[]) => void,
): FrameBatcher {
  let pending: T[] = [];
  let scheduled = false;
  let stopped = false;

  const flush = () => {
    scheduled = false;
    if (stopped || pending.length === 0) return;
    const batch = pending;
    pending = [];
    onBatch(batch);
  };

  const drain = async () => {
    try {
      for await (const item of source) {
        if (stopped) return;
        pending.push(item);
        if (!scheduled) {
          scheduled = true;
          schedule(flush);
        }
      }
    } finally {
      flush();
    }
  };

  return {
    done: drain(),
    stop() {
      stopped = true;
      pending = [];
    },
  };
}
