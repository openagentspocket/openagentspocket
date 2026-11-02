import { FakeUsageSource, type HostReading, type UsageSource } from '@openagentspocket/core';
import { useCallback, useEffect, useState } from 'react';

const demoSource = new FakeUsageSource();

/** Ages and resets are relative to now: re-render once a minute so a passed reset reads expired. */
const TICK_MS = 60_000;

/** The Hosts' Usage readings. The live per-Host store replaces the fake source later. */
export function useUsage(source: UsageSource = demoSource): {
  readings: HostReading[] | null;
  now: Date;
  refreshing: boolean;
  refresh: () => Promise<void>;
} {
  const [readings, setReadings] = useState<HostReading[] | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setReadings(await source.readings());
      setNow(new Date());
    } finally {
      setRefreshing(false);
    }
  }, [source]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return { readings, now, refreshing, refresh };
}
