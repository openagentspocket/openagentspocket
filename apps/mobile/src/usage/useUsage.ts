import type { HostReading, UsageSource } from '@openagentspocket/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { publishUsageWidgets } from '@/widgets/widgetPublisher';
import { useUsageSource } from './UsageSourceProvider';

/** Ages and resets are relative to now: re-render once a minute so a passed reset reads expired. */
const TICK_MS = 60_000;

/**
 * The Hosts' Usage readings. A live source also reports changes, polls while a surface is
 * visible and reads again on a pull; the demo source answers once.
 */
export function useUsage(explicit?: UsageSource): {
  readings: HostReading[] | null;
  now: Date;
  refreshing: boolean;
  refresh: () => Promise<void>;
  source: UsageSource;
} {
  const provided = useUsageSource();
  const source = explicit ?? provided;
  const [readings, setReadings] = useState<HostReading[] | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const next = await source.readings();
    if (!mounted.current) return;
    setReadings(next);
    publishUsageWidgets(next);
    setNow(new Date());
  }, [source]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await source.refresh?.();
      await load();
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, [source, load]);

  useEffect(() => {
    mounted.current = true;
    load();
    const stopWatching = source.watch?.();
    const unsubscribe = source.subscribe?.(() => {
      load();
    });
    return () => {
      mounted.current = false;
      unsubscribe?.();
      stopWatching?.();
    };
  }, [source, load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return { readings, now, refreshing, refresh, source };
}
