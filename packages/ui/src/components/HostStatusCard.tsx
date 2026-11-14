import { View } from 'react-native';
import { impact } from '../haptics';
import { Card } from '../primitives/Card';
import { Icon, type IconName } from '../primitives/Icon';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { rounded } from '../theme/corners';
import { airy } from '../theme/metrics';
import { toneColorKey } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';

export type HostStatusTone = 'success' | 'warning' | 'danger';

const GLYPH: Record<HostStatusTone, IconName> = {
  success: 'check',
  warning: 'warning',
  danger: 'error',
};

const useStyles = makeStyles((t) => ({
  card: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  tile: {
    width: 48,
    height: 48,
    ...rounded(t.radius.control),
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: airy.line },
  reconnect: {
    width: 36,
    height: 36,
    borderRadius: t.radius.capsule,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

interface HostStatusCardProps {
  tone: HostStatusTone;
  title: string;
  /** "address - route". */
  subtitle: string;
  onReconnect?: () => void;
  reconnectLabel?: string;
  testID?: string;
}

/**
 * The connection state of a Host on a wash of its tone: glyph tile, state, address and route,
 * and a circular reconnect button (haptic on press).
 */
export function HostStatusCard({
  tone,
  title,
  subtitle,
  onReconnect,
  reconnectLabel,
  testID,
}: HostStatusCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const ink = theme.colors[toneColorKey[tone]];
  return (
    <Card tint={toneColorKey[tone]} style={styles.card} testID={testID}>
      <View style={[styles.tile, { backgroundColor: theme.wash(ink) }]}>
        <Icon name={GLYPH[tone]} size={26} tint={ink} />
      </View>
      <View style={styles.text} accessible accessibilityLabel={`${title}, ${subtitle}`}>
        <Text variant="headline" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="subheadline" tone="secondary" numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      {onReconnect ? (
        <Tappable
          accessibilityRole="button"
          accessibilityLabel={reconnectLabel}
          hitSlop={4}
          onPress={() => {
            impact('light');
            onReconnect();
          }}
          style={({ pressed }) => [
            styles.reconnect,
            { backgroundColor: theme.wash(ink) },
            pressed && { opacity: 0.6 },
          ]}
          testID={testID ? `${testID}-reconnect` : 'host-status-reconnect'}
        >
          <Icon name="refresh" size={17} tint={ink} />
        </Tappable>
      ) : null}
    </Card>
  );
}
