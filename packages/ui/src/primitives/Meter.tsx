import { View } from 'react-native';
import { makeStyles, useTheme } from '../theme/theme';
import type { ColorKey } from '../theme/tokens.generated';

/** Shares of a limit where the meter turns to warning, then to danger. */
export const METER_WARNING = 0.8;
export const METER_DANGER = 0.95;

const clamp = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/** The color key a meter fills with at `value` (0...1 of the limit used). */
export function meterColor(value: number, tint: ColorKey = 'accent'): ColorKey {
  const used = clamp(value);
  if (used >= METER_DANGER) return 'danger';
  if (used >= METER_WARNING) return 'warning';
  return tint;
}

const useStyles = makeStyles((t) => ({
  track: {
    height: 6,
    borderRadius: t.radius.capsule,
    backgroundColor: t.colors.control,
    overflow: 'visible',
    justifyContent: 'center',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: t.radius.capsule },
  tick: {
    position: 'absolute',
    width: 2,
    top: -3,
    bottom: -3,
    borderRadius: t.radius.capsule,
    backgroundColor: t.colors.textPrimary,
  },
}));

interface MeterProps {
  /** Share of the limit used, 0...1. */
  value: number;
  /** Where usage would be at an even pace through the window, 0...1; drawn as a tick. */
  pace?: number;
  /** The fill below the warning share. */
  tint?: ColorKey;
  /** What screen readers hear before the percentage ("Weekly limit"). */
  accessibilityLabel: string;
  testID?: string;
}

/** A usage-limit bar: fills with the share used, turns warning at 80% and danger at 95%, with a pace tick. */
export function Meter({ value, pace, tint = 'accent', accessibilityLabel, testID }: MeterProps) {
  const styles = useStyles();
  const theme = useTheme();
  const used = clamp(value);
  return (
    <View
      style={styles.track}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(used * 100) }}
      testID={testID ?? 'meter'}
    >
      <View
        style={[
          styles.fill,
          { width: `${used * 100}%`, backgroundColor: theme.colors[meterColor(used, tint)] },
        ]}
        testID="meter-fill"
      />
      {pace !== undefined ? (
        <View style={[styles.tick, { left: `${clamp(pace) * 100}%` }]} testID="meter-pace" />
      ) : null}
    </View>
  );
}
