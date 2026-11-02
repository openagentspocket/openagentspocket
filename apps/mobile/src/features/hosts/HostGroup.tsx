import type { Host } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { FoldHeader, HostRow, Section } from '@openagentspocket/ui';
import { View } from 'react-native';
import { useEntryMenus } from '../../navigation/entryMenus';
import type { HostConnection } from './HostsModel';
import { connectionLine, groupTitle, hostTitle, latencyLabel, rowConnection } from './hostRows';
import { removeHostWithConfirmation } from './removeHost';

interface HostGroupProps {
  group: HostConnection;
  hosts: readonly Host[];
  /** Round trip per Host id, in milliseconds. */
  latencies: Readonly<Record<string, number>>;
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (host: Host) => void;
  onEdit: (host: Host) => void;
  onDuplicate: (host: Host) => void;
}

/** One connection group of the list: a fold header over a card of Host rows. */
export function HostGroup({
  group,
  hosts,
  latencies,
  collapsed,
  onToggle,
  onOpen,
  onEdit,
  onDuplicate,
}: HostGroupProps) {
  const entries = useEntryMenus();
  return (
    <View style={{ gap: 4 }}>
      <FoldHeader
        kind="status"
        title={groupTitle(group)}
        count={hosts.length}
        collapsed={collapsed}
        onToggle={onToggle}
        testID={`hosts-group-${group}`}
      />
      {collapsed ? null : (
        <Section>
          {hosts.map((host) => (
            <HostRow
              key={host.id}
              host={{
                name: hostTitle(host),
                subtitle: connectionLine(host),
                connection: rowConnection(group),
                latencyLabel: latencyLabel(latencies[host.id]),
              }}
              onPress={() => onOpen(host)}
              onRetry={() => onOpen(host)}
              retryLabel={t('Reconnect')}
              menu={[
                ...entries.host({ id: host.id, name: hostTitle(host) }),
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
      )}
    </View>
  );
}
