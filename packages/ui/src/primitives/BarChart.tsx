import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { makeStyles, useTheme } from '../theme/theme';
import type { ColorKey } from '../theme/tokens.generated';
import { Text } from './Text';

export interface BarDatum {
  key: string;
  /** The axis label ("Mon", "12"). */
  label: string;
  value: number;
}

/** Each bar's height as a share of the tallest (0...1); all zero when nothing is positive. */
export function barShares(data: readonly BarDatum[]): number[] {
  const max = Math.max(0, ...data.map((datum) => datum.value));
  return data.map((datum) => (max > 0 ? Math.max(0, datum.value) / max : 0));
}

/** Indexes whose axis label is drawn: all of a week, else first, middle and last. */
export function labeledIndexes(count: number): Set<number> {
  if (count <= 7) return new Set(Array.from({ length: count }, (_, index) => index));
  return new Set([0, Math.floor((count - 1) / 2), count - 1]);
}

const useStyles = makeStyles((t) => ({
  chart: { gap: t.spacing.xxs },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  slot: { flex: 1, justifyContent: 'flex-end' },
  bar: { borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 1 },
  labels: { flexDirection: 'row', gap: 3 },
  label: { flex: 1, textAlign: 'center' },
}));

interface SlotProps {
  height: number;
  slotStyle: object;
  label: string;
  testID: string;
  onPress?: () => void;
  children: ReactNode;
}

/** One bar's column: a button when the chart is pressable, else a plain accessible element. */
function Slot({ height, slotStyle, label, testID, onPress, children }: SlotProps) {
  if (!onPress) {
    return (
      <View style={[slotStyle, { height }]} accessible accessibilityLabel={label} testID={testID}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      style={[slotStyle, { height }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

interface BarChartProps {
  data: readonly BarDatum[];
  height?: number;
  tint?: ColorKey;
  /** Draws this bar in full tint and the rest muted (today). */
  highlightKey?: string;
  /** Spoken value of a bar ("12.4k tokens"). */
  formatValue?: (value: number) => string;
  /** Makes each bar pressable (opens that day); bars stay plain elements without it. */
  onPressBar?: (key: string) => void;
  /** Names the chart for screen readers ("Daily tokens"). */
  accessibilityLabel: string;
  testID?: string;
}

/** Daily totals as vertical bars; each bar is one accessible element ("Mon, 12k tokens"). */
export function BarChart({
  data,
  height = 120,
  tint = 'accent',
  highlightKey,
  formatValue = String,
  accessibilityLabel,
  onPressBar,
  testID = 'bar-chart',
}: BarChartProps) {
  const styles = useStyles();
  const theme = useTheme();
  const shares = barShares(data);
  const labeled = labeledIndexes(data.length);
  const color = theme.colors[tint];
  return (
    <View style={styles.chart} testID={testID} accessibilityLabel={accessibilityLabel}>
      <View style={[styles.bars, { height }]}>
        {data.map((datum, index) => (
          <Slot
            key={datum.key}
            height={height}
            slotStyle={styles.slot}
            label={`${datum.label}, ${formatValue(datum.value)}`}
            testID={`bar-${datum.key}`}
            onPress={onPressBar ? () => onPressBar(datum.key) : undefined}
          >
            <View
              style={[
                styles.bar,
                {
                  height: (shares[index] ?? 0) * height,
                  backgroundColor:
                    highlightKey === undefined || highlightKey === datum.key
                      ? color
                      : theme.wash(color),
                },
              ]}
            />
          </Slot>
        ))}
      </View>
      <View
        style={styles.labels}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {data.map((datum, index) => (
          <Text
            key={datum.key}
            variant="footnote"
            tone="tertiary"
            style={styles.label}
            numberOfLines={1}
          >
            {labeled.has(index) ? datum.label : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}
