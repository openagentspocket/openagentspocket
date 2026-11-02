import {
  exclusionText,
  formatTokens,
  scopeDayNote,
  scopeRefreshing,
  scopeTotal,
  type UsageRange,
  type UsageScope,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Banner, ListRow, Section, Text } from '@openagentspocket/ui';
import { localeTag, renderMessage, type UsageMetric } from './usageText';

interface Props {
  scope: UsageScope;
  range: UsageRange;
  metric: UsageMetric;
}

/** Hosts left out and why, the days' time zone, and scan notes. */
export function UsageNotices({ scope, range, metric }: Props) {
  const unpriced = scopeTotal(scope, range).unpricedTokens;
  const dayNote = scopeDayNote(scope);
  // A truncated or partial scan must never read as complete: say what could not be read.
  const unreadable = scope.included.reduce(
    (sum, host) => sum + (host.report.scan?.unreadableFiles ?? 0),
    0,
  );
  return (
    <>
      {scope.excluded.length > 0 ? (
        <Section grouped title={t('Not included')}>
          {scope.excluded.map((host) => (
            <ListRow
              key={host.id}
              title={host.name}
              subtitle={renderMessage(exclusionText(host.exclusion))}
              testID={`excluded-${host.id}`}
            />
          ))}
        </Section>
      ) : null}
      {scope.loading.map((host) => (
        <Text key={host.id} tone="secondary" variant="footnote">
          {t('%@: Loading Usage…', host.name)}
        </Text>
      ))}
      {unreadable > 0 ? (
        <Banner
          tone="warning"
          title={
            unreadable === 1
              ? t(
                  '%@ Transcript or folder could not be read. It is retried on the next refresh.',
                  '1',
                )
              : t(
                  '%@ Transcripts or folders could not be read. They are retried on the next refresh.',
                  String(unreadable),
                )
          }
          testID="usage-unreadable"
        />
      ) : null}
      {metric === 'cost' && unpriced > 0 ? (
        <Text variant="footnote" tone="warning" testID="usage-unpriced">
          {t('Includes unpriced tokens (%@)', formatTokens(unpriced, localeTag()))}
        </Text>
      ) : null}
      {metric === 'cost' ? (
        <Text variant="footnote" tone="tertiary">
          {t('Estimated API cost is based on recorded Token Usage, not your subscription bill.')}
        </Text>
      ) : null}
      {scopeRefreshing(scope) ? (
        <Text tone="secondary" variant="footnote">
          {t('Token Usage is still being summarized.')}
        </Text>
      ) : null}
      {dayNote ? (
        <Text tone="tertiary" variant="footnote" testID="usage-day-note">
          {renderMessage(dayNote)}
        </Text>
      ) : null}
    </>
  );
}
