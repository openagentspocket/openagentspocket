import {
  accountDisplayName,
  type ClaudeAccount,
  formatCost,
  formatTokens,
  renderText,
  type Summary,
  type Text,
} from '@openagentspocket/core';
import { getLocale, getLocaleTag, t, translate } from '@openagentspocket/i18n';

/** What the Usage tab's figures count. */
export type UsageMetric = 'cost' | 'tokens';

/** Renders core's unresolved text (catalog keys with arguments) in the current locale. */
export function renderMessage(text: Text): string {
  return renderText(text, (key, args) => translate(getLocale(), 'app', key, args, getLocaleTag()));
}

/** A translate function for core helpers that need one (`cardSubtitle`). */
export const translateKey = (key: string, args: readonly string[]): string =>
  translate(getLocale(), 'app', key, args, getLocaleTag());

export const localeTag = (): string => getLocaleTag();

/** A summary's figure for the metric: "$1.20" or "12.4k". Unpriced reads "Unpriced". */
export function metricText(summary: Summary, metric: UsageMetric): string {
  if (metric === 'tokens') return formatTokens(summary.tokens.total, getLocaleTag());
  return summary.estimatedCostUSD === null
    ? t('Unpriced')
    : formatCost(summary.estimatedCostUSD, getLocaleTag());
}

/** A plotted number as text: dollars or compact tokens. */
export const metricNumberText = (value: number, metric: UsageMetric): string =>
  metric === 'tokens' ? formatTokens(value, getLocaleTag()) : formatCost(value, getLocaleTag());

/** The number a chart plots for the metric. */
export function metricValue(summary: Summary, metric: UsageMetric): number {
  return metric === 'tokens' ? summary.tokens.total : (summary.estimatedCostUSD ?? 0);
}

/** The Default Account has no name of its own: the app words it. */
export const accountLabel = (account: ClaudeAccount): string =>
  account.name === null ? t('Default') : accountDisplayName(account);

export const metricTitle = (metric: UsageMetric): string =>
  metric === 'cost' ? t('Est. Cost') : t('Tokens');

/** The dashboard's status line: "Refreshing" or "Updated 01:12". */
export const updatedText = (refreshing: boolean, now: Date): string =>
  refreshing
    ? t('Refreshing')
    : t('Updated %@', new Intl.DateTimeFormat(getLocaleTag(), { timeStyle: 'short' }).format(now));
