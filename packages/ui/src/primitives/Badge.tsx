import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Status } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';
import { Text } from './Text';

/** accent: a tag on the accent container; control: a quiet count; outline: never reads as a status. */
export type BadgeKind = 'accent' | 'control' | 'outline';

const useStyles = makeStyles((t) => ({
  capsule: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xxs,
    borderRadius: 999,
    paddingHorizontal: t.spacing.xs,
    paddingVertical: 2,
  },
  accent: { backgroundColor: t.colors.accentContainer },
  control: { backgroundColor: t.colors.control },
  outline: { borderWidth: t.metrics.hairlineWidth, borderColor: t.hairline },
  digits: { fontVariant: ['tabular-nums'] },
}));

interface BadgeProps {
  label: string;
  kind?: BadgeKind;
  testID?: string;
}

/** A short label on a capsule: a count, a tag. */
export function Badge({ label, kind = 'accent', testID }: BadgeProps) {
  const styles = useStyles();
  return (
    <View style={[styles.capsule, styles[kind]]} testID={testID}>
      <Text
        variant="label"
        tone={kind === 'accent' ? 'accent' : 'secondary'}
        style={styles.digits}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

interface StatusPillProps {
  status: Status;
  label: string;
  /** A mark before the words, such as a spinner for Working. */
  leading?: ReactNode;
  testID?: string;
}

/** A status in words on a wash of its color, inked in that same color. */
export function StatusPill({ status, label, leading, testID }: StatusPillProps) {
  const styles = useStyles();
  const theme = useTheme();
  const ink = theme.status(status);
  return (
    <View
      style={[styles.capsule, { backgroundColor: theme.wash(ink) }]}
      testID={testID ?? `status-pill-${status}`}
      accessible
      accessibilityLabel={label}
    >
      {leading}
      <Text variant="label" style={{ color: ink }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
