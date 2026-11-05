import {
  countdown,
  formatShare,
  type HostReading,
  type ProviderUsage,
  type ProviderUsageState,
  providerUsageOf,
  type QuickEmpty,
  quickContent,
  renderText,
  updatedMessage,
} from '@openagentspocket/core';
import type { ProviderUsageCardProps, Status } from '@openagentspocket/ui';
import { localeTag, renderMessage, translateKey } from './usageText';

export interface ProviderCardModel {
  /** Stable per Host and provider. */
  key: string;
  hostId: string;
  providerId: string;
  state: ProviderUsageState;
  props: Omit<ProviderUsageCardProps, 'onPress' | 'testID'>;
}

export interface ProviderFooterModel {
  text: string;
  status: Status;
}

/** A provider's card props: labels, "62%" and "4d 23h" resolved for the current locale. */
export function providerCardModel(usage: ProviderUsage, now: Date): ProviderCardModel {
  const locale = localeTag();
  const { provider } = usage;
  return {
    key: `${usage.hostId}/${provider.id}`,
    hostId: usage.hostId,
    providerId: provider.id,
    state: usage.state,
    props: {
      program: provider.id,
      brand: provider.brand,
      name: provider.displayName,
      hostName: usage.hostName,
      windows: usage.windows.map((window) => ({
        label: window.label,
        usedShare: window.usedShare,
        percentText: window.usedShare === null ? '' : formatShare(window.usedShare, 1, locale),
        resetText: window.resetsAt ? countdown(window.resetsAt, now, locale) : '',
      })),
      note: usage.note ? renderMessage(usage.note) : undefined,
    },
  };
}

/** "Updated this minute" from the newest reading; the dot says whether every card is fresh. */
export function providerFooter(
  entries: readonly ProviderUsage[],
  now: Date,
): ProviderFooterModel | null {
  const times = entries.flatMap((e) => (e.updatedAt ? [e.updatedAt.getTime()] : []));
  if (times.length === 0) return null;
  const status: Status = entries.some((e) => e.state === 'reading')
    ? 'working'
    : entries.some((e) => e.state === 'stale')
      ? 'idle'
      : 'done';
  const text = renderText(
    updatedMessage(new Date(Math.max(...times)), now, localeTag()),
    translateKey,
  );
  return { text, status };
}

export interface ProviderModels {
  cards: ProviderCardModel[];
  footer: ProviderFooterModel | null;
  /** Why there are no cards (no Hosts, still loading, nothing reported); null with cards. */
  empty: QuickEmpty | null;
}

/** Everything a compact Usage surface shows, from the Hosts' readings. */
export function providerModels(readings: readonly HostReading[], now: Date): ProviderModels {
  const content = quickContent(readings, now);
  const entries = providerUsageOf(content, translateKey);
  return {
    cards: entries.map((entry) => providerCardModel(entry, now)),
    footer: providerFooter(entries, now),
    empty: content.empty,
  };
}
