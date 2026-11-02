import { View } from 'react-native';
import { StatusDot } from '../primitives/StatusDot';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, flexShrink: 1 },
  text: { flex: 1, gap: 3 },
  dimmed: { opacity: 0.6 },
}));

export interface OverlayPeerSummaryProps {
  name: string;
  /** True online (green dot), false idle (grey dot), undefined unknown (no dot). */
  online?: boolean;
  offline?: boolean;
  /** The address a Host would use, drawn in mono. */
  address?: string;
  /** "Relayed · 46 ms", "Direct · 14 ms", "Offline"; may be empty. */
  reachability?: string;
  /** The network the peer belongs to, already worded ("Network home"). */
  network?: string;
  testID?: string;
}

/**
 * A peer in a list: online dot, name, the address with how the peer is reached, and optionally
 * its network. Offline peers dim. The caller adds trailing controls and press handling.
 */
export function OverlayPeerViews({
  name,
  online,
  offline = false,
  address,
  reachability = '',
  network,
  testID = 'overlay-peer',
}: OverlayPeerSummaryProps) {
  const styles = useStyles();
  const detail = [address, reachability].filter((part) => part) as string[];
  return (
    <View style={[styles.row, offline && styles.dimmed]} testID={testID}>
      {online !== undefined ? <StatusDot status={online ? 'done' : 'idle'} /> : null}
      <View style={styles.text}>
        <Text variant="headline" tone={offline ? 'secondary' : 'primary'} numberOfLines={1}>
          {name}
        </Text>
        {address ? (
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            <Text variant="footnote" tone="secondary" monospaced>
              {address}
            </Text>
            {reachability ? ` · ${reachability}` : ''}
          </Text>
        ) : detail.length ? (
          <Text variant="footnote" tone="secondary">
            {reachability}
          </Text>
        ) : null}
        {network ? (
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {network}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
