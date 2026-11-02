import type { Host } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, EmptyState, Screen, SheetBar } from '@openagentspocket/ui';
import { useState } from 'react';
import { extra } from './extraText';
import { HostGroup } from './HostGroup';
import type { HostConnection } from './HostsModel';
import { groupHosts } from './hostRows';
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
  const [collapsed, setCollapsed] = useState<ReadonlySet<HostConnection>>(new Set());
  const toggle = (group: HostConnection) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(group)) next.add(group);
      return next;
    });

  const bar = (
    <SheetBar
      title={t('Hosts')}
      large
      leading={{ label: t('Done'), onPress: onDone, testID: 'hosts-done' }}
      trailing={[
        { label: t('Scan to Pair'), icon: 'qr', onPress: onScan, testID: 'hosts-scan' },
        { label: t('Add Host'), icon: 'add', onPress: onAdd, testID: 'hosts-add' },
      ]}
    />
  );
  const edges = ['left', 'right', 'bottom'] as const;

  if (snapshot.loadError) {
    return (
      <Screen header={bar} edges={edges} testID="hosts-unavailable">
        <EmptyState
          icon="error"
          title={t('Hosts Unavailable')}
          message={extra(
            'The saved Host catalog could not be read. Its original data was preserved; reinstalling or adding a Host would risk losing it.',
          )}
        />
      </Screen>
    );
  }
  if (snapshot.hosts.length === 0) {
    return (
      <Screen header={bar} edges={edges} testID="hosts-empty">
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
      </Screen>
    );
  }
  return (
    <Screen header={bar} edges={edges} testID="hosts-list">
      {groupHosts(snapshot).map(({ group, hosts }) => (
        <HostGroup
          key={group}
          group={group}
          hosts={hosts}
          collapsed={collapsed.has(group)}
          onToggle={() => toggle(group)}
          onOpen={onOpen}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
        />
      ))}
      {onSetupGuide ? (
        <Button
          kind="text"
          title={t('Setup Guide')}
          onPress={onSetupGuide}
          testID="hosts-setup-guide"
        />
      ) : null}
    </Screen>
  );
}
