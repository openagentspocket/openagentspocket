import { hostDisplayName } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, Card, EmptyState, Screen, StatusDot, Text } from '@openagentspocket/ui';
import { useEffect } from 'react';
import { View } from 'react-native';
import { ChangedKeySection } from './ChangedKeySection';
import { connectionTitle, HostFacts, RoutesSection } from './HostInfoSections';
import { groupStatus } from './hostRows';
import { PreflightSection } from './PreflightSection';
import { removeHostWithConfirmation } from './removeHost';
import { useHostChecks } from './useHostChecks';
import { useHosts } from './useHosts';

interface HostDetailScreenProps {
  hostId: string;
  onEdit: (hostId: string) => void;
  onRemoved: () => void;
}

/** hosts.detail: the connection status, routes, Host facts and the preflight checklist. */
export function HostDetailScreen({ hostId, onEdit, onRemoved }: HostDetailScreenProps) {
  const snapshot = useHosts();
  const host = snapshot.hosts.find((candidate) => candidate.id === hostId) ?? null;
  const { state, run, cancel, trustNewKey } = useHostChecks(host);
  const connection = snapshot.connections[hostId] ?? 'notConnected';
  const exists = host !== null;

  // Checks run when the page opens, as the Swift app's onboarding does.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per opened Host
  useEffect(() => {
    if (exists) void run();
  }, [exists, hostId]);

  if (!host) {
    return (
      <Screen testID="host-removed">
        <EmptyState icon="server" title={t('Host removed')} />
      </Screen>
    );
  }
  const running = connection === 'connecting';
  return (
    <Screen testID="host-detail">
      <Card padded testID="host-status-card">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <StatusDot status={groupStatus(connection)} />
          <Text variant="headline">{hostDisplayName(host)}</Text>
        </View>
        <Text tone="secondary" testID="host-status-title">
          {connectionTitle(connection)}
        </Text>
        <Button
          kind={running ? 'secondary' : 'primary'}
          icon={running ? 'stop' : 'refresh'}
          title={running ? t('Stop Connecting') : t('Reconnect')}
          onPress={running ? cancel : () => void run()}
          testID="host-reconnect"
        />
      </Card>
      {state.changedKey ? (
        <ChangedKeySection
          presented={state.changedKey.presented}
          onTrust={() => void trustNewKey()}
        />
      ) : null}
      <RoutesSection host={host} routeInUse={state.routeInUse} />
      <HostFacts host={host} />
      <PreflightSection report={state.report} running={state.running} />
      <Button
        kind="secondary"
        title={running ? t('Cancel Checks') : t('Run Checks Again')}
        onPress={running ? cancel : () => void run()}
        testID="host-run-checks"
      />
      <Button
        kind="secondary"
        icon="edit"
        title={t('Edit')}
        onPress={() => onEdit(hostId)}
        testID="host-edit"
      />
      <Button
        kind="destructive"
        icon="trash"
        title={t('Remove Host')}
        onPress={() => void removeHostWithConfirmation(host).then((gone) => gone && onRemoved())}
        testID="host-remove"
      />
    </Screen>
  );
}
