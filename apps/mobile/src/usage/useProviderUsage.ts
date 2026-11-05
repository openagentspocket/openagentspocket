import type { UsageSource } from '@openagentspocket/core';
import { useMemo } from 'react';
import { type ProviderModels, providerModels } from './providerCards';
import { useUsage } from './useUsage';

/**
 * The provider cards any surface shows (the compact Usage sheet today, Home or a widget later):
 * one per registered provider on each Host, plus the "Updated" footer. `loading` until the first
 * reading lands; `cards` is empty for a Host that reports no provider.
 */
export function useProviderUsage(explicit?: UsageSource): ProviderModels & {
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
} {
  const { readings, now, refreshing, refresh } = useUsage(explicit);
  const models = useMemo(() => providerModels(readings ?? [], now), [readings, now]);
  return { ...models, loading: readings === null, refreshing, refresh };
}
