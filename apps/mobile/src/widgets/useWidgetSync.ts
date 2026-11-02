import { FakeUsageSource, type UsageSource } from '@openagentspocket/core';
import { useEffect } from 'react';
import { publishUsageWidgets } from './widgetPublisher';

const demoSource = new FakeUsageSource();

/**
 * Keeps the Usage widgets filled from launch, without anyone opening Usage. Until the live
 * per-Host store lands the source is the demo one; the live store replaces it.
 */
export function useWidgetSync(source: UsageSource = demoSource): void {
  useEffect(() => {
    let cancelled = false;
    source.readings().then((readings) => {
      if (!cancelled) publishUsageWidgets(readings);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);
}
