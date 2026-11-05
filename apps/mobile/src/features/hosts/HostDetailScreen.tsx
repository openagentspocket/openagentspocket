import { hostDisplayName, pluginPresentation } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  Button,
  EmptyState,
  HostStatusCard,
  type HostStatusTone,
  type ScreenHeader,
} from '@openagentspocket/ui';
import { useEffect, useState } from 'react';
import { AppScreen } from '@/navigation/AppScreen';
import { HostUsageSection } from '@/usage/HostUsageSection';
import { ChangedKeySection } from './ChangedKeySection';
import { connectionTitle, HostFacts, RoutesSection, routeLine } from './HostInfoSections';
import { hostsRuntime } from './hostsRuntime';
import { PluginNoticeSheet } from './PluginNoticeSheet';
import { PreflightSection } from './PreflightSection';
import { removeHostWithConfirmation } from './removeHost';
import { useHostChecks } from './useHostChecks';
import { useHostConnections } from './useHostConnections';
import { useHosts } from './useHosts';

interface HostDetailScreenProps {
  hostId: string;
  onBack: () => void;
  onEdit: (hostId: string) => void;
  onRemoved: () => void;
  onOpenUsage?: (hostId: string) => void;
  /** Opens with the plugin notice presented (atlas). */
  initiallyShowingPluginNotice?: boolean;
}

const TONE: Record<string, HostStatusTone> = {
  connected: 'success',
  connecting: 'warning',
  notConnected: 'warning',
  cantConnect: 'danger',
};

/** hosts.detail: status card, key change, routes, Host facts and the preflight checklist. */
export function HostDetailScreen({
  hostId,
  onBack,
  onEdit,
  onRemoved,
  onOpenUsage,
  initiallyShowingPluginNotice = false,
}: HostDetailScreenProps) {
  const snapshot = useHosts();
  const host = snapshot.hosts.find((candidate) => candidate.id === hostId) ?? null;
  const { state, run, cancel, trustNewKey } = useHostChecks(host);
  const connection = useHostConnections()[hostId] ?? 'notConnected';
  const exists = host !== null;
  const [noticeOpen, setNoticeOpen] = useState(initiallyShowingPluginNotice);

  // Checks run when the page opens, as the Swift app's onboarding does.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per opened Host
  useEffect(() => {
    if (exists) void run();
  }, [exists, hostId]);

  const bar: ScreenHeader = {
    variant: 'sheet',
    title: host ? hostDisplayName(host) : t('Host Details'),
    back: true,
    leading: { label: t('Back'), onPress: onBack, testID: 'host-back' },
    trailing: host
      ? [{ label: t('Edit'), onPress: () => onEdit(hostId), testID: 'host-edit' }]
      : [],
  };
  if (!host) {
    return (
      <AppScreen header={bar} testID="host-removed">
        <EmptyState icon="server" title={t('Host removed')} />
      </AppScreen>
    );
  }
  const running = connection === 'connecting';
  const presentation = pluginPresentation(state.plugin, {
    session: host.sessionName,
    endpoint: host.herdrEndpoint,
  });
  return (
    <AppScreen header={bar} testID="host-detail">
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
      <HostFacts
        host={host}
        plugin={presentation.value}
        onPluginPress={presentation.notice ? () => setNoticeOpen(true) : undefined}
      />
      <PreflightSection
        report={state.report}
        running={state.running}
        onToggleRun={running ? cancel : () => void run()}
      />
      <HostUsageSection
        hostId={hostId}
        onOpenUsage={onOpenUsage ? () => onOpenUsage(hostId) : undefined}
      />
      {presentation.notice ? (
        <PluginNoticeSheet
          notice={presentation.notice}
          visible={noticeOpen}
          onClose={() => setNoticeOpen(false)}
          onRunChecks={() => void run()}
          onRunAction={
            hostsRuntime().runPluginSteps
              ? async (steps) => {
                  await hostsRuntime().runPluginSteps?.(host.id, steps);
                  setNoticeOpen(false);
                  void run();
                }
              : undefined
          }
        />
      ) : null}
      <Button
        kind="text"
        icon="trash"
        title={t('Remove Host')}
        onPress={() => void removeHostWithConfirmation(host).then((gone) => gone && onRemoved())}
        testID="host-remove"
      />
    </AppScreen>
  );
}
