import { type Host, hostDisplayName } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, EmptyState, ListRow, Screen, Section, StatusDot } from '@openagentspocket/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { useEntryMenus } from '../../navigation/entryMenus';
import { extra } from './extraText';
import type { HostConnection } from './HostsModel';
import { connectionLine, groupHosts, groupStatus, groupTitle } from './hostRows';
import { removeHostWithConfirmation } from './removeHost';
import { useHosts } from './useHosts';

interface HostListScreenProps {
  onOpen: (host: Host) => void;
  onAdd: () => void;
  onScan: () => void;
  onEdit: (host: Host) => void;
  onDuplicate: (host: Host) => void;
}

/** hosts.list: the saved Hosts in connection groups, with Scan to Pair and Add Host. */
export function HostListScreen({
  onOpen,
  onAdd,
  onScan,
  onEdit,
  onDuplicate,
}: HostListScreenProps) {
  const snapshot = useHosts();
  const entries = useEntryMenus();
  const [collapsed, setCollapsed] = useState<ReadonlySet<HostConnection>>(new Set());
  const toggle = (group: HostConnection) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(group)) next.add(group);
      return next;
    });

  if (snapshot.loadError) {
    return (
      <Screen testID="hosts-unavailable">
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

  const actions = (
    <>
      <Button icon="qr" title={t('Scan to Pair')} onPress={onScan} testID="hosts-scan" />
      <Button
        kind="secondary"
        icon="add"
        title={t('Add Host')}
        onPress={onAdd}
        testID="hosts-add"
      />
    </>
  );
  if (snapshot.hosts.length === 0) {
    return (
      <Screen testID="hosts-empty">
        <EmptyState
          icon="server"
          title={t('No Hosts')}
          message={t('Add a machine that runs herdr to get started.')}
          actions={actions}
        />
      </Screen>
    );
  }
  return (
    <Screen testID="hosts-list">
      <View style={{ gap: 8 }}>{actions}</View>
      {groupHosts(snapshot).map(({ group, hosts }) => (
        <Section
          key={group}
          title={groupTitle(group)}
          status={groupStatus(group)}
          count={hosts.length}
          expanded={!collapsed.has(group)}
          onToggle={() => toggle(group)}
        >
          {hosts.map((host) => (
            <ListRow
              key={host.id}
              title={hostDisplayName(host)}
              subtitle={connectionLine(host)}
              leading={<StatusDot status={groupStatus(group)} />}
              chevron
              onPress={() => onOpen(host)}
              menu={[
                ...entries.host({ id: host.id, name: hostDisplayName(host) }),
                { key: 'edit', title: t('Edit'), icon: 'edit', onPress: () => onEdit(host) },
                {
                  key: 'duplicate',
                  title: t('Duplicate'),
                  icon: 'copy',
                  onPress: () => onDuplicate(host),
                },
                {
                  key: 'remove',
                  title: t('Remove Host'),
                  icon: 'trash',
                  destructive: true,
                  onPress: () => void removeHostWithConfirmation(host),
                },
              ]}
              swipeActions={[
                {
                  key: 'remove',
                  title: t('Remove'),
                  icon: 'trash',
                  tone: 'danger',
                  onPress: () => void removeHostWithConfirmation(host),
                },
              ]}
              testID={`host-row-${host.id}`}
            />
          ))}
        </Section>
      ))}
    </Screen>
  );
}
