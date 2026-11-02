import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { makeStyles } from '../theme/theme';
import { Icon, type IconName } from './Icon';
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
    paddingVertical: 3,
  },
  selected: { backgroundColor: t.colors.accentContainer },
  pressed: { opacity: 0.7 },
  small: { fontSize: 12, lineHeight: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs },
}));

interface ChipProps {
  label: string;
  icon?: IconName;
  /** Monospaced, for technical metadata (Host, folder, model). */
  mono?: boolean;
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
  onPress,
  selected = false,
  accessibilityLabel,
  testID,
}: ChipProps) {
  const styles = useStyles();
  const content = (
    <>
      {icon ? <Icon name={icon} size={12} color={selected ? 'accent' : 'textSecondary'} /> : null}
      <Text
        variant={mono ? 'mono' : 'caption'}
        tone={selected ? 'accent' : 'secondary'}
        numberOfLines={1}
        style={mono ? styles.small : undefined}
      >
        {label}
      </Text>
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.chip} testID={testID} accessible accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      testID={testID}
      hitSlop={8}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

/** Chips that wrap onto as many lines as they need. */
export function ChipRow({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.row}>{children}</View>;
}
