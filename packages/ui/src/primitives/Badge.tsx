import type { ReactNode } from 'react';
import { View } from 'react-native';
import { airy } from '../theme/metrics';
import type { Status } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';
import { Text } from './Text';

/** accent: a tag on the accent container; control: a quiet count; outline: never reads as a status. */
export type BadgeKind = 'accent' | 'control' | 'tertiary' | 'quaternary' | 'outline' | 'wash';

const useStyles = makeStyles((t) => ({
  capsule: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xxs,
    borderRadius: 999,
    paddingHorizontal: airy.stack,
    paddingVertical: airy.badgeV,
  },
  accent: { backgroundColor: t.colors.accentContainer },
  control: { backgroundColor: t.colors.control },
  tertiary: { backgroundColor: t.colors.control, opacity: 0.8 },
  quaternary: { backgroundColor: t.colors.control, opacity: 0.55 },
  wash: {},
  outline: { borderWidth: t.metrics.hairlineWidth, borderColor: t.hairline },
  digits: { fontVariant: ['tabular-nums'] },
}));

interface BadgeProps {
  label: string;
  kind?: BadgeKind;
  /** The ink and wash color of `kind="wash"` (a status or tone color, from the theme). */
  color?: string;
  testID?: string;
}

/** A short label on a capsule: a count, a tag. */
export function Badge({ label, kind = 'accent', color, testID }: BadgeProps) {
  const styles = useStyles();
  const theme = useTheme();
  const wash = kind === 'wash' && color ? { backgroundColor: theme.wash(color) } : null;
  return (
    <View style={[styles.capsule, styles[kind], wash]} testID={testID}>
      <Text
        variant="caption2"
        semibold
        tone={kind === 'accent' ? 'accent' : 'secondary'}
        style={[styles.digits, wash && color ? { color } : null]}
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
      <Text variant="caption2" semibold style={{ color: ink }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
