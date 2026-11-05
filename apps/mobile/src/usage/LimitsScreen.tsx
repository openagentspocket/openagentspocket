import { buildUsageScope, quickContent, type UsageSource } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { EmptyState, makeStyles, Text } from '@openagentspocket/ui';
import { useState } from 'react';
import { AppScreen } from '@/navigation/AppScreen';
import { AccountsSheet } from './AccountsSheet';
import { LimitsHostGroup } from './LimitsHostGroup';
import { useAccountFiles } from './UsageSourceProvider';
import { renderMessage } from './usageText';
import { useClaudeLimits } from './useClaudeLimits';
import { useUsage } from './useUsage';

const useStyles = makeStyles(() => ({
  intro: { textAlign: 'center' },
}));

interface Props {
  source?: UsageSource;
}

/**
 * usage.limits-sheet: every Host's Usage Limits, grouped per Host (two Hosts may share an account,
 * so they never add up), each with the Claude Code limits switch and its Accounts. While the switch
 * is off no Host shows a cached reading.
 */
export function LimitsScreen({ source }: Props) {
  const { readings, now, refreshing, refresh, source: used } = useUsage(source);
  const styles = useStyles();
  const files = useAccountFiles();
  const limits = useClaudeLimits(used);
  const [accountsHost, setAccountsHost] = useState<string | null>(null);
  const shown = limits.apply(readings ?? []);
  const { cards, empty } = quickContent(shown, now);
  const scope = buildUsageScope(shown);
  const open = scope.included.find((host) => host.id === accountsHost);
  return (
    <AppScreen
      header={{ variant: 'native' }}
      refreshing={refreshing}
      onRefresh={refresh}
      testID="limits-screen"
    >
      {scope.included.length > 1 ? (
        <Text variant="footnote" tone="tertiary" style={styles.intro}>
          {t(
            'Usage Limits are shown per Host. Two Hosts signed in to the same account show the same windows.',
          )}
        </Text>
      ) : null}
      {scope.included.map((host) => (
        <LimitsHostGroup
          key={host.id}
          host={host}
          cards={cards.filter((card) => card.hostId === host.id)}
          now={now}
          claudeLimits={limits.enabled}
          onClaudeLimits={limits.set}
          onAccounts={() => setAccountsHost(host.id)}
        />
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
      <Text variant="footnote" tone="tertiary">
        {t('Codex shows only its default limit group.')}
      </Text>
      {open ? (
        <AccountsSheet
          visible
          onClose={() => setAccountsHost(null)}
          hostId={open.id}
          hostName={open.name}
          report={open.report}
          store={files}
        />
      ) : null}
    </AppScreen>
  );
}
