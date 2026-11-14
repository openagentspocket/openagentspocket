import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, type DimensionValue, View } from 'react-native';
import { rounded } from '../theme/corners';
import type { RadiusKey } from '../theme/metrics';
import { makeStyles, useTheme } from '../theme/theme';

const PULSE_MS = 900;

const useStyles = makeStyles((t) => ({
  block: { backgroundColor: t.colors.control, ...rounded(t.radius.mark) },
  rows: { gap: t.spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  lines: { flex: 1, gap: t.spacing.xs },
}));

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled?.().then((value) => {
      if (mounted) setReduce(value);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return reduce;
}

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  /** A step of the corner scale; text lines take the mark corner. */
  radius?: RadiusKey;
}

/** A placeholder block that pulses while content loads (still when Reduce Motion is on). */
export function Skeleton({ width = '100%', height = 14, radius }: SkeletonProps) {
  const styles = useStyles();
  const theme = useTheme();
  const reduce = useReduceMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: PULSE_MS, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: PULSE_MS, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduce]);
  return (
    <Animated.View
      style={[
        styles.block,
        { width, height, opacity: pulse },
        radius !== undefined ? { borderRadius: theme.radius[radius] } : null,
      ]}
      testID="skeleton"
    />
  );
}

interface SkeletonRowsProps {
  rows?: number;
  /** Screen-reader label while loading. Default "Loading". */
  accessibilityLabel?: string;
}

/** Placeholder rows for a list that is loading: a mark and two lines each. */
export function SkeletonRows({ rows = 3, accessibilityLabel = 'Loading' }: SkeletonRowsProps) {
  const styles = useStyles();
  return (
    <View
      style={styles.rows}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: true }}
      testID="skeleton-rows"
    >
      {Array.from({ length: rows }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity.
        <View key={index} style={styles.row}>
          <Skeleton width={28} height={28} radius="chip" />
          <View style={styles.lines}>
            <Skeleton width="60%" />
            <Skeleton width="85%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}
