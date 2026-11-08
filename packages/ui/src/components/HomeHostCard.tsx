import { View } from 'react-native';
import { ActionMenu, type ActionMenuItem } from '../overlay/ActionMenu';
import { useContextMenu } from '../overlay/useContextMenu';
import { Card } from '../primitives/Card';
import { Icon } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { airy } from '../theme/metrics';
import { type Tone, toneColorKey } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';

export interface HomeHost {
  name: string;
  address: string;
  /** "No Agents", "Sync issue", already localized. */
  readiness: string;
  tone: Tone;
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, padding: airy.card },
  glyph: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.control,
  },
  text: { flex: 1, gap: airy.line },
  trailing: { alignItems: 'flex-end', gap: t.spacing.xxs, maxWidth: '40%' },
}));

interface HomeHostCardProps {
  host: HomeHost;
  onPress?: () => void;
  menu?: readonly ActionMenuItem[];
  testID?: string;
}

/** Swift's Home Host card: circle glyph, name, mono address (middle-truncated), readiness with a tone dot. */
export function HomeHostCard({
  host,
  onPress,
  menu,
  testID = 'home-host-card',
}: HomeHostCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const context = useContextMenu();
  return (
    <>
      <Card
        padded={false}
        onPress={onPress}
        onLongPress={menu?.length ? context.open : undefined}
        accessibilityLabel={`${host.name}, ${host.address}. ${host.readiness}`}
        testID={testID}
      >
        <View style={styles.row}>
          <View style={styles.glyph}>
            <Icon name="server" size={18} color="textSecondary" />
          </View>
          <View style={styles.text}>
            <Text variant="headline" numberOfLines={1}>
              {host.name}
            </Text>
            <Text
              variant="caption"
              monospaced
              tone="secondary"
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {host.address}
            </Text>
          </View>
          <View style={styles.trailing}>
            <View
              testID={`${testID}-dot-${host.tone}`}
              style={{
                width: 9,
                height: 9,
                borderRadius: 5,
                backgroundColor: theme.colors[toneColorKey[host.tone]],
              }}
            />
            <Text variant="caption" tone="secondary" numberOfLines={1}>
              {host.readiness}
            </Text>
          </View>
        </View>
      </Card>
      {menu?.length ? <ActionMenu items={menu} title={host.name} {...context.menuProps} /> : null}
    </>
  );
}
