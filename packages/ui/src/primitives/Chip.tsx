import type { ReactNode } from 'react';
import { View } from 'react-native';
import { airy } from '../theme/metrics';
import { makeStyles } from '../theme/theme';
import { Icon, type IconName } from './Icon';
import { Tappable } from './Tappable';
import { Text } from './Text';

const useStyles = makeStyles((t) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: t.spacing.xxs,
    backgroundColor: t.colors.control,
    borderRadius: t.metrics.chipRadius,
    paddingHorizontal: t.spacing.xs,
    paddingVertical: airy.badgeV,
    maxWidth: '100%',
  },
  small: { paddingHorizontal: airy.stack, paddingVertical: airy.chipV },
  label: { flexShrink: 1 },
  selected: { backgroundColor: t.colors.accentContainer },
  pressed: { opacity: 0.7 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs },
}));

interface ChipProps {
  label: string;
  icon?: IconName;
  /** Monospaced, for technical metadata (Host, folder, model). */
  mono?: boolean;
  /** Swift's `MetadataChip`: caption2 with roomier padding, for metadata under a title. */
  size?: 'regular' | 'small';
  /** A filter chip: pressable, with a selected state. */
  onPress?: () => void;
  selected?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

/** Technical metadata or a filter in a small chip on the control fill. */
export function Chip({
  label,
  icon,
  mono = true,
  size = 'regular',
  onPress,
  selected = false,
  accessibilityLabel,
  testID,
}: ChipProps) {
  const styles = useStyles();
  const small = size === 'small';
  const content = (
    <>
      {icon ? (
        <Icon name={icon} size={small ? 11 : 12} color={selected ? 'accent' : 'textSecondary'} />
      ) : null}
      <Text
        variant={small ? 'caption2' : 'caption'}
        monospaced={mono}
        tone={selected ? 'accent' : 'secondary'}
        numberOfLines={1}
        style={styles.label}
      >
        {label}
      </Text>
    </>
  );
  if (!onPress) {
    return (
      <View
        style={[styles.chip, small && styles.small]}
        testID={testID}
        accessible
        accessibilityLabel={accessibilityLabel ?? label}
      >
        {content}
      </View>
    );
  }
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      testID={testID}
      hitSlop={8}
      style={({ pressed }) => [
        styles.chip,
        small && styles.small,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      {content}
    </Tappable>
  );
}

/** Chips that wrap onto as many lines as they need. */
export function ChipRow({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.row}>{children}</View>;
}
