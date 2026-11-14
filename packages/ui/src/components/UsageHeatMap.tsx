import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { impact } from '../haptics';
import { Card } from '../primitives/Card';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { withAlpha } from '../theme/color';
import { rounded } from '../theme/corners';
import { airy } from '../theme/metrics';
import { makeStyles, type Theme, useTheme } from '../theme/theme';
import { HEAT_LEVELS, heatLevel, heatRows } from './usageHeatMath';

const GAP = 4;
/** Share of the ink color laid over the track at each step. */
const INK_SHARE = [0, 0.3, 0.5, 0.75, 0.95] as const;

const useStyles = makeStyles((t) => ({
  // The card pads itself little so the tiles span the card, as Swift's do.
  body: { padding: t.spacing.sm, gap: t.spacing.xs },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: t.spacing.xs,
  },
  title: { flexShrink: 0 },
  caption: { flexShrink: 1 },
  weekdays: { flexDirection: 'row', gap: GAP, marginTop: t.spacing.xxs },
  weekday: { flex: 1, textAlign: 'center' },
  grid: { gap: GAP, marginTop: t.spacing.xxs },
  week: { flexDirection: 'row', gap: GAP },
  cell: {
    flex: 1,
    aspectRatio: 1.05,
    ...rounded(t.radius.chip),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: t.colors.control,
  },
  empty: { flex: 1, aspectRatio: 1.05 },
  hatch: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: t.spacing.xs,
    marginTop: t.spacing.sm,
  },
  swatches: { flexDirection: 'row', alignItems: 'center', gap: airy.chipV },
  swatch: { width: 12, height: 12, borderRadius: t.radius.mark, overflow: 'hidden' },
  key: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs },
  spacer: { flex: 1 },
}));

export interface HeatDay {
  /** A stable id, usually the ISO date. */
  date: string;
  /** What the cell shows ("12", "1 Nov"). */
  label: string;
  /** Spoken description ("Sunday, 1 Nov, US$ 1,44"). */
  accessibilityLabel: string;
  value: number;
  /** False for a day no Host recorded: drawn hatched, not tappable. */
  recorded: boolean;
}

export interface HeatLegend {
  less: string;
  more: string;
  today: string;
  notRecorded: string;
}

export interface UsageHeatMapProps {
  days: readonly HeatDay[];
  /** Empty cells before the first day, so it lands under its weekday (Monday first). */
  leading?: number;
  /** The `date` of today: outlined in the accent. */
  today?: string;
  /** Seven weekday letters, Monday first. */
  weekdays: readonly string[];
  /** The range title ("3 Oct – 1 Nov"). */
  title?: string;
  /** Secondary text at the header's end ("Estimated API cost per day"). */
  caption?: string;
  /** Present: the legend row of the expanded calendar. */
  legend?: HeatLegend;
  onSelect?: (date: string) => void;
  testID?: string;
}

function Hatch({ color }: { color: string }) {
  const styles = useStyles();
  return (
    <Svg style={styles.hatch} viewBox="0 0 100 100" preserveAspectRatio="none">
      {[-100, -75, -50, -25, 0, 25, 50, 75, 100].map((offset) => (
        <Line
          key={offset}
          x1={offset}
          y1={100}
          x2={offset + 100}
          y2={0}
          stroke={color}
          strokeWidth={3}
        />
      ))}
    </Svg>
  );
}

/** The cell fill of an intensity step: the track with the ink laid over it. */
function fillOf(theme: Theme, level: number): string {
  const share = INK_SHARE[Math.min(level, HEAT_LEVELS - 1)] ?? 0;
  return share === 0 ? theme.colors.control : withAlpha(theme.colors.textPrimary, share);
}

function Swatch({ level }: { level: number }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={[styles.swatch, { backgroundColor: theme.colors.control }]}>
      <View style={[styles.hatch, { backgroundColor: fillOf(theme, level) }]} />
    </View>
  );
}

/** A month of days as a 7-column grid with five intensity steps; tap a recorded day to open it. */
export function UsageHeatMap({
  days,
  leading = 0,
  today,
  weekdays,
  title,
  caption,
  legend,
  onSelect,
  testID = 'usage-heat-map',
}: UsageHeatMapProps) {
  const styles = useStyles();
  const theme = useTheme();
  const max = Math.max(0, ...days.filter((day) => day.recorded).map((day) => day.value));
  const rows = heatRows(days, leading);
  return (
    <Card testID={testID} padded={false}>
      <View style={styles.body}>
        {title || caption ? (
          <View style={styles.head}>
            {title ? (
              <Text
                variant="headline"
                accessibilityRole="header"
                numberOfLines={1}
                style={styles.title}
              >
                {title}
              </Text>
            ) : null}
            {caption ? (
              <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.caption}>
                {caption}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View
          style={styles.weekdays}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {weekdays.map((letter, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: weekday letters repeat (T, S)
            <Text key={index} variant="caption" tone="secondary" style={styles.weekday}>
              {letter}
            </Text>
          ))}
        </View>
        <View style={styles.grid}>
          {rows.map((week, weekIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: weeks are positional
            <View key={weekIndex} style={styles.week}>
              {week.map((day, dayIndex) => {
                // biome-ignore lint/suspicious/noArrayIndexKey: padding cells are positional
                if (!day) return <View key={`pad-${dayIndex}`} style={styles.empty} />;
                const level = day.recorded ? heatLevel(day.value, max) : 0;
                const isToday = day.date === today;
                const bright = level >= 3;
                return (
                  <Tappable
                    key={day.date}
                    disabled={!day.recorded || !onSelect}
                    onPress={() => {
                      impact('light');
                      onSelect?.(day.date);
                    }}
                    accessibilityRole={day.recorded && onSelect ? 'button' : undefined}
                    accessibilityLabel={day.accessibilityLabel}
                    accessibilityState={{ disabled: !day.recorded }}
                    style={[
                      styles.cell,
                      { backgroundColor: theme.colors.control },
                      isToday && { borderWidth: 2, borderColor: theme.colors.accent },
                    ]}
                    testID={`heat-${day.date}`}
                  >
                    {day.recorded ? (
                      <View
                        style={[styles.hatch, { backgroundColor: fillOf(theme, level) }]}
                        testID={`heat-${day.date}-level-${level}`}
                      />
                    ) : (
                      <Hatch color={withAlpha(theme.colors.textPrimary, 0.12)} />
                    )}
                    <Text
                      variant={day.label.length > 2 ? 'footnote' : 'callout'}
                      numberOfLines={1}
                      ellipsizeMode="clip"
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                      tone={day.recorded ? 'primary' : 'tertiary'}
                      style={bright ? { color: theme.colors.canvas } : undefined}
                    >
                      {day.label}
                    </Text>
                  </Tappable>
                );
              })}
            </View>
          ))}
        </View>
        {legend ? (
          <View style={styles.legend} testID="usage-heat-legend">
            <Text variant="caption" tone="secondary">
              {legend.less}
            </Text>
            <View style={styles.swatches}>
              {Array.from({ length: HEAT_LEVELS }, (_, level) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed five steps
                <Swatch key={level} level={level} />
              ))}
            </View>
            <Text variant="caption" tone="secondary">
              {legend.more}
            </Text>
            <View style={styles.spacer} />
            <View style={styles.key}>
              <View style={[styles.swatch, { borderWidth: 2, borderColor: theme.colors.accent }]} />
              <Text variant="caption" tone="secondary">
                {legend.today}
              </Text>
            </View>
            <View style={styles.key}>
              <View style={[styles.swatch, { backgroundColor: theme.colors.control }]}>
                <Hatch color={withAlpha(theme.colors.textPrimary, 0.3)} />
              </View>
              <Text variant="caption" tone="secondary">
                {legend.notRecorded}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </Card>
  );
}
