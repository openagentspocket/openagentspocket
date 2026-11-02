import { View } from 'react-native';
import type { ActionMenuItem } from '../overlay/ActionMenu';
import { Button } from '../primitives/Button';
import { Icon } from '../primitives/Icon';
import { ListRow } from '../primitives/ListRow';
import { StatusDot } from '../primitives/StatusDot';
import type { SwipeAction } from '../primitives/SwipeRow';
import type { Status } from '../theme/status';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles(() => ({
  glyph: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', right: 0, bottom: 1 },
}));

export type HostConnection = 'connected' | 'connecting' | 'failed' | 'idle';

const STATUS: Record<HostConnection, Status> = {
  connected: 'done',
  connecting: 'working',
  failed: 'blocked',
  idle: 'idle',
};

export interface HostRowHost {
  name: string;
  /** user@address. */
  subtitle: string;
  connection: HostConnection;
  /** "<1 ms"; shown before the chevron while connected. */
  latencyLabel?: string;
}

interface HostRowProps {
  host: HostRowHost;
  onPress: () => void;
  /** A failed Host shows a retry button when this is set. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Edit and Remove. */
  swipeActions?: readonly SwipeAction[];
  menu?: readonly ActionMenuItem[];
  testID?: string;
}

/**
 * One saved Host: a server glyph with a 10 pt status dot at its lower right, name, user@address,
 * latency and a chevron. Transparent: put several in a grouped `Section` (one card, hairlines).
 */
export function HostRow({
  host,
  onPress,
  onRetry,
  retryLabel,
  swipeActions,
  menu,
  testID,
}: HostRowProps) {
  const styles = useStyles();
  const failed = host.connection === 'failed';
  return (
    <ListRow
      title={host.name}
      titleSemibold
      subtitleVariant="subheadline"
      subtitle={host.subtitle}
      subtitleLines={1}
      leading={
        <View style={styles.glyph}>
          <Icon name="server" size={24} />
          <View style={styles.dot}>
            <StatusDot status={STATUS[host.connection]} size={10} />
          </View>
        </View>
      }
      value={host.connection === 'connected' ? host.latencyLabel : undefined}
      trailing={
        failed && onRetry ? (
          <Button
            icon="refresh"
            kind="text"
            size="small"
            accessibilityLabel={retryLabel ?? host.name}
            onPress={onRetry}
            testID={testID ? `${testID}-retry` : 'host-row-retry'}
          />
        ) : undefined
      }
      chevron
      onPress={onPress}
      swipeActions={swipeActions}
      menu={menu}
      menuTitle={host.name}
      testID={testID}
    />
  );
}
