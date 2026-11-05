import { View } from 'react-native';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

export const LIMIT_SEGMENTS = 10;

/** How much of segment `index` (0-based) a share fills, 0...1: whole ones, then one partial. */
export function segmentFill(usedShare: number, index: number, segments = LIMIT_SEGMENTS): number {
  const used = Math.min(Math.max(Number.isFinite(usedShare) ? usedShare : 0, 0), 1) * segments;
  return Math.min(Math.max(used - index, 0), 1);
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  label: { width: 64 },
  bar: { flex: 1, flexDirection: 'row', gap: 3 },
  segment: {
    flex: 1,
    height: 10,
    borderRadius: 2,
    backgroundColor: t.colors.control,
    overflow: 'hidden',
  },
  percent: { width: 44, textAlign: 'right' },
  reset: { width: 56, textAlign: 'right' },
}));

export interface LimitWindowRowProps {
  /** "5-hour", "Weekly". */
  label: string;
  /** 0...1; null draws an empty bar. */
  usedShare: number | null;
  /** Bar color: the provider's brand tint. */
  color: string;
  /** "62%"; empty while unknown. */
  percentText: string;
  /** Time until reset ("4d 23h"); empty when unknown. */
  resetText: string;
  testID?: string;
}

/** One limit window: label, a 10-segment bar (partial last segment), percent and time to reset. */
export function LimitWindowRow({
  label,
  usedShare,
  color,
  percentText,
  resetText,
  testID,
}: LimitWindowRowProps) {
  const styles = useStyles();
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={[label, percentText, resetText].filter(Boolean).join(', ')}
      testID={testID}
    >
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.bar}>
        {Array.from({ length: LIMIT_SEGMENTS }, (_, index) => {
          const fill = usedShare === null ? 0 : segmentFill(usedShare, index);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed, ordered segments
            <View key={index} style={styles.segment} testID={`${testID}-segment-${index}`}>
              {fill > 0 ? (
                <View style={{ width: `${fill * 100}%`, height: '100%', backgroundColor: color }} />
              ) : null}
            </View>
          );
        })}
      </View>
      <Text variant="headline" tabularNums style={styles.percent} numberOfLines={1}>
        {percentText}
      </Text>
      <Text variant="footnote" tone="secondary" tabularNums style={styles.reset} numberOfLines={1}>
        {resetText}
      </Text>
    </View>
  );
}
