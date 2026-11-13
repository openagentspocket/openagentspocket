import type { ConsoleRow, Host } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { HomeHostCard, makeStyles, SectionHeader } from '@openagentspocket/ui';
import { View } from 'react-native';
import type { HostSummary } from '@/console/store';
import { useHostConnectionSheet } from '@/features/hosts/HostConnectionSheet';
import { isConnectionDown } from '@/features/hosts/useHostConnection';
import { useEntryMenus } from '../navigation/entryMenus';
import { ColumnRows } from './HomeInbox';
import { presentHost } from './hostCards';

const useStyles = makeStyles((th) => ({
  section: { gap: th.spacing.xxs },
}));

interface HomeHostsProps {
  hosts: readonly HostSummary[];
  rows: readonly ConsoleRow[];
  saved: readonly Host[];
  columns: 1 | 2;
  onOpen?: (hostId: string) => void;
}

/**
 * The Hosts zone: one quiet card per Host in the Console, which holds every saved Host whatever its
 * link. A card opens the Host, or its connection sheet while its link is down; long-press opens
 * its menu.
 */
export function HomeHosts({ hosts, rows, saved, columns, onOpen }: HomeHostsProps) {
  const styles = useStyles();
  const menus = useEntryMenus();
  const connection = useHostConnectionSheet();
  return (
    <View style={styles.section}>
      <SectionHeader title={t('Hosts')} />
      <ColumnRows
        items={hosts}
        columns={columns}
        keyOf={(host) => host.id}
        render={(host) => (
          <HomeHostCard
            host={presentHost(host, rows.filter((row) => row.hostId === host.id).length, saved)}
            menu={menus.host(host)}
            onPress={() => (isConnectionDown(host) ? connection.open(host.id) : onOpen?.(host.id))}
            testID={`host-${host.id}`}
          />
        )}
      />
      {connection.sheet}
    </View>
  );
}
