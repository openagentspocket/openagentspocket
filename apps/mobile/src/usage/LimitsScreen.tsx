import {
  buildUsageScope,
  quickContent,
  type UsageSource,
  withClaudeLimits,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { EmptyState, Screen, Text, ToggleRow } from '@openagentspocket/ui';
import { useState } from 'react';
import { QuickCardView } from './QuickCardView';
import { renderMessage } from './usageText';
import { useUsage } from './useUsage';

interface Props {
  source?: UsageSource;
}

/**
 * usage.limits-page: every Host's Usage Limits, per Host (two Hosts may share an account, so they
 * never add up), with the Claude Code limits switch. While it is off no Host shows a cached reading.
 */
export function LimitsScreen({ source }: Props) {
  const { readings, now, refreshing, refresh, source: used } = useUsage(source);
  // A live source keeps the device's consent per Host; the demo one only remembers it here.
  const [local, setLocal] = useState(true);
  const live = used.claudeLimits;
  const [, rerender] = useState(0);
  const claudeLimits = live ? live.enabled() : local;
  const setClaudeLimits = (enabled: boolean) => {
    if (live) {
      live.set(enabled);
      rerender((n) => n + 1);
    } else {
      setLocal(enabled);
    }
  };
  const shown = (readings ?? []).map((reading) =>
    claudeLimits || reading.state.kind !== 'available'
      ? reading
      : {
          ...reading,
          state: {
            ...reading.state,
            report: withClaudeLimits(reading.state.report, 'disabled', null),
          },
        },
  );
  const { cards, empty } = quickContent(shown, now);
  const hostCount = buildUsageScope(shown).included.length;
  return (
    <Screen refreshing={refreshing} onRefresh={refresh} testID="limits-screen">
      <Text variant="title">{t('Usage Limits')}</Text>
      <ToggleRow
        title={t('Claude Code limits')}
        subtitle={t(
          'The plugin asks Claude Code on this computer for your plan limits. Neither the plugin nor Agentico handles your sign-in. This automated use is not officially supported.',
        )}
        value={claudeLimits}
        onValueChange={setClaudeLimits}
        testID="claude-limits-toggle"
      />
      {cards.map((card) => (
        <QuickCardView key={card.id} card={card} now={now} />
      ))}
      {empty?.kind === 'unavailable'
        ? empty.reasons.map((reason) => (
            <Text key={renderMessage(reason)} tone="secondary">
              {renderMessage(reason)}
            </Text>
          ))
        : null}
      {empty && empty.kind !== 'unavailable' ? (
        <EmptyState
          title={empty.kind === 'noHosts' ? t('No Hosts') : t('Loading Usage…')}
          layout="compact"
        />
      ) : null}
      {hostCount > 1 ? (
        <Text variant="caption" tone="tertiary">
          {t(
            'Usage Limits are shown per Host. Two Hosts signed in to the same account show the same windows.',
          )}
        </Text>
      ) : null}
      <Text variant="caption" tone="tertiary">
        {t('Codex shows only its default limit group.')}
      </Text>
    </Screen>
  );
}
