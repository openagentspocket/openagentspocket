import { providerUsage, type UsageSource } from '@openagentspocket/core';
import { useMemo } from 'react';
import {
  type ProviderCardModel,
  type ProviderFooterModel,
  providerCardModel,
  providerFooter,
} from './providerCards';
import { translateKey } from './usageText';
import { useUsage } from './useUsage';

/**
 * The provider cards any surface shows (the compact Usage sheet today, Home or a widget later):
 * one per registered provider on each Host, plus the "Updated" footer. `loading` until the first
 * reading lands; `cards` is empty for a Host that reports no provider.
 */
export function useProviderUsage(explicit?: UsageSource): {
  cards: ProviderCardModel[];
  footer: ProviderFooterModel | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
} {
  const { readings, now, refreshing, refresh } = useUsage(explicit);
  const entries = useMemo(
    () => (readings ? providerUsage(readings, now, translateKey) : []),
    [readings, now],
  );
  const cards = useMemo(
    () => entries.map((entry) => providerCardModel(entry, now)),
    [entries, now],
  );
  const footer = useMemo(() => providerFooter(entries, now), [entries, now]);
  return { cards, footer, loading: readings === null, refreshing, refresh };
}
