import type { Translate } from '../../errors/text';
import { message, renderText } from '../../errors/text';
import { type QuickCard, type QuickContent, type QuickWindow, quickContent } from '../quick-sheet';
import type { HostReading } from '../scope';
import type { ProviderLimitWindow, ProviderUsage, ProviderUsageState } from './provider';
import { usageProvider, usageProviders } from './registry';

const share = (percent: number | null): number | null =>
  percent === null ? null : Math.min(Math.max(percent / 100, 0), 1);

function windowOf(window: QuickWindow, translate: Translate): ProviderLimitWindow {
  return {
    id: window.id,
    label: renderText(window.name, translate),
    usedShare: share(window.usedPercent),
    resetsAt: window.resetsAt,
    elapsedShare: share(window.elapsedPercent),
  };
}

function usageOf(card: QuickCard, translate: Translate): ProviderUsage | null {
  const provider = usageProvider(card.program);
  if (!provider) return null;
  const base = {
    provider,
    hostId: card.hostId,
    hostName: card.hostName,
    updatedAt: card.observedAt,
  };
  const { body } = card;
  const none = { windows: [], note: null };
  switch (body.kind) {
    case 'windows': {
      const state: ProviderUsageState = card.isStale ? 'stale' : 'ok';
      return {
        ...base,
        windows: body.windows.map((w) => windowOf(w, translate)),
        note: null,
        state,
      };
    }
    case 'reading':
      return { ...base, ...none, state: 'reading' };
    case 'limitsOff':
      return { ...base, ...none, state: 'off', note: message('Usage Limits are off.') };
    case 'message':
      return { ...base, ...none, state: body.off ? 'off' : 'unavailable', note: body.text };
    case 'uncounted':
      return { ...base, ...none, state: 'unavailable', note: body.reason };
  }
}

/**
 * One entry per (Host, registered provider), from the same readings the Usage stores hold. A
 * program with several accounts (Claude Code) shows the first account that has windows.
 */
export function providerUsage(
  readings: readonly HostReading[],
  now: Date,
  translate: Translate,
): ProviderUsage[] {
  return providerUsageOf(quickContent(readings, now), translate);
}

/** `providerUsage` from content already built (a surface that also needs its empty state). */
export function providerUsageOf(content: QuickContent, translate: Translate): ProviderUsage[] {
  const picked = new Map<string, ProviderUsage>();
  for (const card of content.cards) {
    const usage = usageOf(card, translate);
    if (!usage) continue;
    const key = `${usage.hostId}/${usage.provider.id}`;
    const held = picked.get(key);
    if (!held || (held.windows.length === 0 && usage.windows.length > 0)) picked.set(key, usage);
  }
  const order = usageProviders();
  return [...picked.values()].sort((a, b) => order.indexOf(a.provider) - order.indexOf(b.provider));
}
