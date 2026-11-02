import { hostDisplayName } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  Button,
  EmptyState,
  HostStatusCard,
  type HostStatusTone,
  Screen,
  SheetBar,
} from '@openagentspocket/ui';
import { useEffect } from 'react';
import { ChangedKeySection } from './ChangedKeySection';
import { connectionTitle, HostFacts, RoutesSection, routeLine } from './HostInfoSections';
import { PreflightSection } from './PreflightSection';
import { removeHostWithConfirmation } from './removeHost';
import { useHostChecks } from './useHostChecks';
import { useHosts } from './useHosts';

interface HostDetailScreenProps {
  hostId: string;
  onBack: () => void;
  onEdit: (hostId: string) => void;
  onRemoved: () => void;
}

const TONE: Record<string, HostStatusTone> = {
  connected: 'success',
  connecting: 'warning',
  notConnected: 'warning',
  cantConnect: 'danger',
};

/** hosts.detail: status card, key change, routes, Host facts and the preflight checklist. */
export function HostDetailScreen({ hostId, onBack, onEdit, onRemoved }: HostDetailScreenProps) {
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

  const bar = (
    <SheetBar
      title={host ? hostDisplayName(host) : t('Host Details')}
      back
      leading={{ label: t('Back'), onPress: onBack, testID: 'host-back' }}
      trailing={
        host ? [{ label: t('Edit'), onPress: () => onEdit(hostId), testID: 'host-edit' }] : []
      }
    />
  );
  const edges = ['left', 'right', 'bottom'] as const;
  if (!host) {
    return (
      <Screen header={bar} edges={edges} testID="host-removed">
        <EmptyState icon="server" title={t('Host removed')} />
      </Screen>
    );
  }
  const running = connection === 'connecting';
  return (
    <Screen header={bar} edges={edges} testID="host-detail">
      <HostStatusCard
        tone={TONE[connection] ?? 'warning'}
        title={connectionTitle(connection)}
        subtitle={routeLine(host, state.routeInUse)}
        onReconnect={running ? undefined : () => void run()}
        reconnectLabel={t('Reconnect')}
        testID="host-status-card"
      />
      {running ? (
        <Button
          kind="text"
          icon="stop"
          title={t('Stop Connecting')}
          onPress={cancel}
          testID="host-reconnect"
        />
      ) : null}
      {state.changedKey ? (
        <ChangedKeySection
          presented={state.changedKey.presented}
          onTrust={() => void trustNewKey()}
        />
      ) : null}
      <RoutesSection host={host} routeInUse={state.routeInUse} />
      <HostFacts host={host} />
      <PreflightSection
        report={state.report}
        running={state.running}
        onToggleRun={running ? cancel : () => void run()}
      />
      <Button
        kind="text"
        icon="trash"
        title={t('Remove Host')}
        onPress={() => void removeHostWithConfirmation(host).then((gone) => gone && onRemoved())}
        testID="host-remove"
      />
    </Screen>
  );
}
