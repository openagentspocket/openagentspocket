import { Pressable, View } from 'react-native';
import { ActionMenu, type ActionMenuItem } from '../overlay/ActionMenu';
import { useRowMenu } from '../overlay/useRowMenu';
import { Icon } from '../primitives/Icon';
import { MetaChip } from '../primitives/MetaChip';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: t.metrics.rowMinHeight,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.xs,
  },
  pressed: { backgroundColor: t.colors.surfaceRaised },
  unreachable: { opacity: 0.6 },
  glyph: { width: 28, alignItems: 'center' },
  text: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  detail: { flexShrink: 1 },
}));

export interface PortRowPort {
  number: number;
  /** Container name or process. */
  name: string;
  /** "All interfaces", "Localhost" or an address. */
  addressLabel: string;
  /** Image or "pid 42". */
  detail?: string;
  container?: boolean;
  reachable: boolean;
}

interface PortRowProps {
  port: PortRowPort;
  /** Says why a port cannot be previewed. */
  unreachableLabel?: string;
  /** Long press: Copy URL and the like. */
  menu?: readonly ActionMenuItem[];
  onOpen: () => void;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * One listening server: container or globe glyph, the name, its bound address as a chip with the
 * image or pid, and the port in semibold monospaced digits before the chevron. Transparent: group
 * rows in one card. A port the preview cannot reach is dimmed and says why.
 */
export function PortRow({
  port,
  unreachableLabel,
  menu,
  onOpen,
  accessibilityHint,
  testID,
}: PortRowProps) {
  const styles = useStyles();
  const rowMenu = useRowMenu(menu);
  const number = String(port.number);
  return (
    <>
      <Pressable
        onPress={onOpen}
        onLongPress={rowMenu.onLongPress}
        disabled={!port.reachable && !menu?.length}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${port.name}, ${number}`}
        accessibilityHint={port.reachable ? accessibilityHint : undefined}
        accessibilityState={{ disabled: !port.reachable }}
        {...rowMenu.a11y}
        style={({ pressed }) => [
          styles.row,
          !port.reachable && styles.unreachable,
          pressed && port.reachable && styles.pressed,
        ]}
        testID={testID ?? `port-row-${port.number}`}
      >
        <View style={styles.glyph}>
          <Icon
            name={port.container ? 'container' : 'globe'}
            size={22}
            color={port.reachable ? 'accent' : 'textTertiary'}
          />
        </View>
        <View style={styles.text}>
          <Text numberOfLines={1}>{port.name}</Text>
          <View style={styles.meta}>
            <MetaChip label={port.addressLabel} />
            {port.detail ? (
              <Text
                variant="caption"
                monospaced
                tone="secondary"
                numberOfLines={1}
                style={styles.detail}
              >
                {port.detail}
              </Text>
            ) : null}
          </View>
          {!port.reachable && unreachableLabel ? (
            <Text variant="caption" tone="secondary">
              {unreachableLabel}
            </Text>
          ) : null}
        </View>
        <Text
          variant="body"
          monospaced
          semibold
          tabularNums
          tone={port.reachable ? 'primary' : 'tertiary'}
        >
          {number}
        </Text>
        {port.reachable ? <Icon name="chevronRight" size={13} color="textTertiary" /> : null}
      </Pressable>
      {menu?.length ? <ActionMenu items={menu} title={port.name} {...rowMenu.menuProps} /> : null}
    </>
  );
}
