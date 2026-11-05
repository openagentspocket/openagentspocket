import {
  countdown,
  formatShare,
  type ProviderUsage,
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
