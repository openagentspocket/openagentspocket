import { View } from 'react-native';
import type { ActionMenuItem } from '../overlay/ActionMenu';
import { Chip } from '../primitives/Chip';
import { Icon } from '../primitives/Icon';
import { ListRow } from '../primitives/ListRow';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  unreachable: { opacity: 0.6 },
  glyph: { width: 28, alignItems: 'center' },
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
  const number = String(port.number);
  // Unreachable without a menu, the row is disabled and ListRow dims it; with one it stays pressable.
  const disabled = !port.reachable && !menu?.length;
  return (
    <View style={port.reachable || disabled ? undefined : styles.unreachable}>
      <ListRow
        title={port.name}
        leading={
          <View style={styles.glyph}>
            <Icon
              name={port.container ? 'container' : 'globe'}
              size={22}
              color={port.reachable ? 'accent' : 'textTertiary'}
            />
          </View>
        }
        detail={
          <>
            <View style={styles.meta}>
              <Chip size="small" label={port.addressLabel} />
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
          </>
        }
        trailing={
          <Text
            variant="body"
            monospaced
            semibold
            tabularNums
            tone={port.reachable ? 'primary' : 'tertiary'}
          >
            {number}
          </Text>
        }
        chevron={port.reachable}
        onPress={onOpen}
        disabled={disabled}
        menu={menu}
        menuTitle={port.name}
        accessibilityLabel={`${port.name}, ${number}`}
        accessibilityHint={port.reachable ? accessibilityHint : undefined}
        testID={testID ?? `port-row-${port.number}`}
      />
    </View>
  );
}
