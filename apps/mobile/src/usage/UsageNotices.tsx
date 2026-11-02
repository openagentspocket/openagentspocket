import {
  exclusionText,
  scopeDayNote,
  scopeRefreshing,
  type UsageScope,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Banner, ListRow, Section, Text } from '@openagentspocket/ui';
import { renderMessage } from './usageText';

interface Props {
  scope: UsageScope;
}

/** Hosts left out and why, the days' time zone, and scan notes. */
export function UsageNotices({ scope }: Props) {
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
        <Text key={host.id} tone="secondary" variant="caption">
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
      {scopeRefreshing(scope) ? (
        <Text tone="secondary" variant="caption">
          {t('Token Usage is still being summarized.')}
        </Text>
      ) : null}
      {dayNote ? (
        <Text tone="tertiary" variant="caption" testID="usage-day-note">
          {renderMessage(dayNote)}
        </Text>
      ) : null}
    </>
  );
}
