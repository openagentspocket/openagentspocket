import { useCallback, useEffect, useRef } from 'react';

/** Delay before a held key starts repeating, then the gap between repeats (ms). */
export const REPEAT_DELAY_MS = 420;
export const REPEAT_INTERVAL_MS = 70;

/**
 * Press-and-hold repeat for terminal keys: `start` fires once, then repeats after a hold;
 * `stop` ends it. Timers clear on unmount.
 */
export function useKeyRepeat(fire: () => void) {
  const delay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const latest = useRef(fire);
  latest.current = fire;
  const stop = useCallback(() => {
    if (delay.current) clearTimeout(delay.current);
    if (timer.current) clearInterval(timer.current);
    delay.current = null;
    timer.current = null;
  }, []);
  const start = useCallback(() => {
    stop();
    latest.current();
    delay.current = setTimeout(() => {
      timer.current = setInterval(() => latest.current(), REPEAT_INTERVAL_MS);
    }, REPEAT_DELAY_MS);
  }, [stop]);
  useEffect(() => stop, [stop]);
  return { start, stop };
}
