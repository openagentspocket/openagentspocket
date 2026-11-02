import { t } from '@openagentspocket/i18n';
import { Card, Icon, makeStyles, StatusDot, Text } from '@openagentspocket/ui';
import { View } from 'react-native';
import type { HostSummary } from '@/console/store';
import { hostState } from './homeModel';

const useStyles = makeStyles((th) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: th.spacing.sm },
  text: { flex: 1 },
}));

/** What a Host card says under its name. */
export function hostSummaryText(host: HostSummary, agentCount: number): string {
  switch (hostState(host)) {
    case 'loading':
      return t('Loading Agents…');
    case 'offline':
      return t('Offline');
    case 'live':
      return agentCount === 0 ? t('No Agents') : t('%lld Agents', agentCount);
  }
}

interface HostCardProps {
  host: HostSummary;
  agentCount: number;
  onOpen: (hostId: string) => void;
}

/** One Host: its name, a connection dot and an Agent count; opens the Host. */
export function HostCard({ host, agentCount, onOpen }: HostCardProps) {
  const styles = useStyles();
  const state = hostState(host);
  const summary = hostSummaryText(host, agentCount);
  return (
    <Card
      testID={`host-${host.id}`}
      onPress={() => onOpen(host.id)}
      accessibilityLabel={`${host.name}. ${summary}`}
    >
      <View style={styles.row}>
        <Icon name="server" size={18} />
        <View style={styles.text}>
          <Text variant="headline" numberOfLines={1}>
            {host.name}
          </Text>
          <Text variant="caption" tone="secondary">
            {summary}
          </Text>
        </View>
        <StatusDot status={state === 'live' ? 'done' : state === 'offline' ? 'blocked' : 'idle'} />
      </View>
    </Card>
  );
}
