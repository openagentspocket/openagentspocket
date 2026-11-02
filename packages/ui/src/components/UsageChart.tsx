import { useRef, useState } from 'react';
import { type GestureResponderEvent, View } from 'react-native';
import Svg, { Defs, G, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { impact } from '../haptics';
import { Card } from '../primitives/Card';
import { Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';
import { chartMax, niceCeiling, type Point, scrubIndex, smoothPath } from './usageChartMath';

const HEIGHT = 150;
const AXIS_WIDTH = 52;
const HOLD_MS = 250;

const useStyles = makeStyles((t) => ({
  legend: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs },
  dot: { width: 10, height: 10, borderRadius: 5 },
  spacer: { flex: 1 },
  hint: { flexShrink: 1 },
  plot: { height: HEIGHT, marginTop: t.spacing.xs },
  yLabel: { position: 'absolute', right: 0 },
  readout: {
    position: 'absolute',
    top: 0,
    paddingHorizontal: t.spacing.xs,
    paddingVertical: t.spacing.xxs,
    borderRadius: t.metrics.chipRadius,
    backgroundColor: t.colors.surfaceOverlay,
  },
  xRow: { height: 16, marginTop: t.spacing.xxs },
  xLabel: { position: 'absolute' },
}));

export interface ChartSeries {
  key: string;
  label: string;
  /** A resolved color (a program tint or a theme color). */
  color: string;
  /** One value per day, oldest first. */
  points: readonly number[];
}

export interface UsageChartProps {
  series: readonly ChartSeries[];
  /** One axis label per day ("5 Oct"); drawn about every nine days. */
  dayLabels: readonly string[];
  /** Axis and readout format for a value ("US$ 2"). */
  formatValue: (value: number) => string;
  /** The hint at the legend's end ("Hold to read a day"). */
  hint: string;
  /** Names the chart for screen readers. */
  accessibilityLabel: string;
  /** Called with the scrubbed day index while held, null on release. */
  onSelectDay?: (index: number | null) => void;
  testID?: string;
}

/** Indexes whose axis label is drawn: every `step` days, ending on the last day. */
function labelIndexes(count: number, step = 9): number[] {
  if (count === 0) return [];
  const out: number[] = [];
  for (let i = count - 1; i >= 0; i -= step) out.unshift(i);
  return out;
}

/** Daily cost per program as smoothed area lines; press and hold scrubs a day with a rule and readout. */
export function UsageChart({
  series,
  dayLabels,
  formatValue,
  hint,
  accessibilityLabel,
  onSelectDay,
  testID = 'usage-chart',
}: UsageChartProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const held = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const count = Math.max(0, ...series.map((s) => s.points.length));
  const top = niceCeiling(chartMax(series));
  const plotWidth = Math.max(0, width - AXIS_WIDTH);
  const x = (index: number) => (count > 1 ? (index / (count - 1)) * plotWidth : 0);
  const y = (value: number) => HEIGHT - (Math.max(0, value) / top) * (HEIGHT - 2) - 1;

  const select = (next: number | null) => {
    setSelected((previous) => {
      if (previous !== next) {
        if (next !== null) impact('light');
        onSelectDay?.(next);
      }
      return next;
    });
  };
  const touchIndex = (event: GestureResponderEvent) =>
    scrubIndex(event.nativeEvent.locationX, plotWidth, count);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    held.current = false;
    select(null);
  };
  const begin = (event: GestureResponderEvent) => {
    const index = touchIndex(event);
    timer.current = setTimeout(() => {
      held.current = true;
      select(index);
    }, HOLD_MS);
  };
  const move = (event: GestureResponderEvent) => {
    if (held.current) select(touchIndex(event));
  };

  const ticks = [top, top / 2, 0];
  return (
    <Card testID={testID} accessibilityLabel={accessibilityLabel} accessibilityHint={hint}>
      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.key} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text variant="footnote" semibold numberOfLines={1}>
              {s.label}
            </Text>
          </View>
        ))}
        <View style={styles.spacer} />
        <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.hint}>
          {hint}
        </Text>
      </View>
      <View
        style={styles.plot}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => count > 1}
        onResponderGrant={begin}
        onResponderMove={move}
        onResponderRelease={clear}
        onResponderTerminate={clear}
        testID="usage-chart-plot"
      >
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Defs>
              {series.map((s) => (
                <LinearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={s.color} stopOpacity={0.4} />
                  <Stop offset="1" stopColor={s.color} stopOpacity={0.04} />
                </LinearGradient>
              ))}
            </Defs>
            {ticks.map((tick) => (
              <Line
                key={tick}
                x1={0}
                x2={width}
                y1={y(tick)}
                y2={y(tick)}
                stroke={theme.hairline}
                strokeWidth={1}
              />
            ))}
            {series.map((s) => {
              const points: Point[] = s.points.map((value, index) => ({
                x: x(index),
                y: y(value),
              }));
              const line = smoothPath(points);
              const last = points[points.length - 1];
              const first = points[0];
              if (!last || !first) return null;
              return (
                <G key={s.key}>
                  <Path
                    d={`${line}L${last.x},${HEIGHT}L${first.x},${HEIGHT}Z`}
                    fill={`url(#fill-${s.key})`}
                  />
                  <Path d={line} stroke={s.color} strokeWidth={2} fill="none" />
                </G>
              );
            })}
            {selected !== null ? (
              <Line
                x1={x(selected)}
                x2={x(selected)}
                y1={0}
                y2={HEIGHT}
                stroke={theme.colors.textSecondary}
                strokeWidth={1}
                testID="usage-chart-rule"
              />
            ) : null}
          </Svg>
        ) : null}
        {ticks.map((tick) => (
          <Text
            key={tick}
            variant="caption"
            tone="secondary"
            style={[styles.yLabel, { top: Math.min(HEIGHT - 16, Math.max(0, y(tick) - 16)) }]}
          >
            {formatValue(tick)}
          </Text>
        ))}
        {selected !== null ? (
          <View
            style={[
              styles.readout,
              { left: Math.min(Math.max(0, x(selected) - 40), Math.max(0, plotWidth - 90)) },
            ]}
            testID="usage-chart-readout"
          >
            <Text variant="caption" semibold>
              {dayLabels[selected] ?? ''}
            </Text>
            {series.map((s) => (
              <Text key={s.key} variant="caption2" tone="secondary">
                {`${s.label} ${formatValue(s.points[selected] ?? 0)}`}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
      <View
        style={styles.xRow}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {labelIndexes(count).map((index) => (
          <Text
            key={index}
            variant="caption2"
            tone="secondary"
            style={[styles.xLabel, { left: Math.max(0, Math.min(plotWidth - 44, x(index) - 22)) }]}
          >
            {dayLabels[index] ?? ''}
          </Text>
        ))}
      </View>
    </Card>
  );
}
