import type { Host } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, EmptyState, type ScreenHeader, Text } from '@openagentspocket/ui';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { AppScreen } from '@/navigation/AppScreen';
import { extra } from './extraText';
import { HostGroup } from './HostGroup';
import type { HostConnection } from './HostsModel';
import { groupHosts } from './hostRows';
import { useHostConnections } from './useHostConnections';
import { useHosts } from './useHosts';

interface HostListScreenProps {
  onDone: () => void;
  onSetupGuide?: () => void;
  onOpen: (host: Host) => void;
  onAdd: () => void;
  onScan: () => void;
  onEdit: (host: Host) => void;
  onDuplicate: (host: Host) => void;
}

/** hosts.list: the sheet bar (Done, scan, add), then the saved Hosts in connection groups. */
export function HostListScreen({
  onDone,
  onSetupGuide,
  onOpen,
  onAdd,
  onScan,
  onEdit,
  onDuplicate,
}: HostListScreenProps) {
  const snapshot = useHosts();
  const connections = useHostConnections();
  const [collapsed, setCollapsed] = useState<ReadonlySet<HostConnection>>(new Set());
  const toggle = (group: HostConnection) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(group)) next.add(group);
      return next;
    });

  const bar: ScreenHeader = {
    variant: 'sheet',
    title: t('Hosts'),
    large: true,
    leading: { label: t('Done'), onPress: onDone, testID: 'hosts-done' },
    trailing: [
      { label: t('Scan to Pair'), icon: 'qr', onPress: onScan, testID: 'hosts-scan' },
      { label: t('Add Host'), icon: 'add', onPress: onAdd, testID: 'hosts-add' },
    ],
  };

  if (snapshot.loadError) {
    return (
      <AppScreen header={bar} testID="hosts-unavailable">
        <EmptyState
          icon="error"
          title={t('Hosts Unavailable')}
          message={extra(
            'The saved Host catalog could not be read. Its original data was preserved; reinstalling or adding a Host would risk losing it.',
          )}
        />
      </AppScreen>
    );
  }
  if (snapshot.hosts.length === 0) {
    return (
      <AppScreen header={bar} testID="hosts-empty">
        <EmptyState
          icon="server"
          title={t('No Hosts')}
          message={t('Add a machine that runs herdr to get started.')}
          actions={
            <>
              <Button icon="add" title={t('Add Host')} onPress={onAdd} testID="hosts-empty-add" />
              <Button
                kind="text"
                icon="qr"
                title={t('Scan to Pair')}
                onPress={onScan}
                testID="hosts-empty-scan"
              />
            </>
          }
        />
      </AppScreen>
    );
  }
  return (
    <AppScreen header={bar} testID="hosts-list">
      {groupHosts({ ...snapshot, connections }).map(({ group, hosts }) => (
        <HostGroup
          key={group}
          group={group}
          hosts={hosts}
          latencies={snapshot.latencies}
          collapsed={collapsed.has(group)}
          onToggle={() => toggle(group)}
          onOpen={onOpen}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
        />
      ))}
      {onSetupGuide ? (
        <Pressable
          accessibilityRole="link"
          onPress={onSetupGuide}
          style={{ alignSelf: 'flex-start', paddingHorizontal: 4, paddingVertical: 4 }}
          testID="hosts-setup-guide"
        >
          <Text variant="footnote" tone="accent">
            {t('Setup Guide')}
          </Text>
        </Pressable>
      ) : null}
    </AppScreen>
  );
}
