import type { ConsoleRow, Host } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { HomeHostCard, makeStyles, SectionHeader } from '@openagentspocket/ui';
import { View } from 'react-native';
import type { HostSummary } from '@/console/store';
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

/** The Hosts zone: one quiet card per Host; long-press opens its menu. */
export function HomeHosts({ hosts, rows, saved, columns, onOpen }: HomeHostsProps) {
  const styles = useStyles();
  const menus = useEntryMenus();
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
            onPress={() => onOpen?.(host.id)}
            testID={`host-${host.id}`}
          />
        )}
      />
    </View>
  );
}
