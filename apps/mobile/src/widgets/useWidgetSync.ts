import type { UsageSource } from '@openagentspocket/core';
import { useEffect } from 'react';
import { useUsageSource } from '@/usage/UsageSourceProvider';
import { publishUsageWidgets } from './widgetPublisher';

/**
 * Keeps the Usage widgets filled from launch, without anyone opening Usage: publishes the source's
 * readings now and whenever a live source says they changed.
 */
export function useWidgetSync(explicit?: UsageSource): void {
  const provided = useUsageSource();
  const source = explicit ?? provided;
  useEffect(() => {
    let cancelled = false;
    const publish = () => {
      source.readings().then((readings) => {
        if (!cancelled) publishUsageWidgets(readings);
      });
    };
    publish();
    const unsubscribe = source.subscribe?.(publish);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [source]);
}
