import { View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { Meter } from '../primitives/Meter';
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
  stack: { gap: t.spacing.xxs },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: t.spacing.xs,
  },
  inlineName: { width: 92 },
  inlineBar: { flex: 1 },
  inlineReset: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs, minWidth: 72 },
}));

const LEVEL_TONE = { normal: 'primary', warning: 'warning', danger: 'danger' } as const;

export type LimitWindowLevel = keyof typeof LEVEL_TONE;

interface LimitWindowCommon {
  /** "5-hour", "Weekly". */
  label: string;
  /** 0...1; null while unknown. */
  usedShare: number | null;
  /** "62%"; empty while unknown. */
  percentText: string;
  /** When it resets ("4d 23h", "Resets in 2 days"); empty when unknown. */
  resetText: string;
  testID?: string;
}

export interface SegmentedLimitWindow extends LimitWindowCommon {
  variant?: 'segmented';
  /** Bar color: the provider's brand tint. */
  color: string;
}

export interface MeterLimitWindow extends LimitWindowCommon {
  /** meter: stacked, with the pace line. meterInline: name, bar, percent and reset on one line. */
  variant: 'meter' | 'meterInline';
  /** Where an even pace would stand, 0...1: the bar's tick. */
  paceShare?: number;
  /** Colors the percent. */
  level?: LimitWindowLevel;
  /** Stands in for the bar while the share is unknown (meter only). */
  unknownText?: string;
  /** "Ahead of pace" (meter only). */
  paceText?: string;
  meterTestID?: string;
  paceTestID?: string;
}

export type LimitWindowRowProps = SegmentedLimitWindow | MeterLimitWindow;

const isSegmented = (props: LimitWindowRowProps): props is SegmentedLimitWindow =>
  props.variant === undefined || props.variant === 'segmented';

/** Label, a 10-segment bar (partial last segment), percent and time to reset. */
function SegmentedRow({
  label,
  usedShare,
  color,
  percentText,
  resetText,
  testID,
}: SegmentedLimitWindow) {
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

function WindowMeter({
  label,
  usedShare,
  paceShare,
  meterTestID,
}: Pick<MeterLimitWindow, 'label' | 'paceShare' | 'meterTestID'> & { usedShare: number }) {
  return (
    <Meter value={usedShare} pace={paceShare} accessibilityLabel={label} testID={meterTestID} />
  );
}

/** Name and percent, the bar with its pace tick, then the reset and pace lines. */
function MeterRow(props: MeterLimitWindow) {
  const { label, usedShare, percentText, resetText, level, unknownText, paceText } = props;
  const styles = useStyles();
  return (
    <View
      style={styles.stack}
      accessible
      accessibilityLabel={[label, percentText].filter(Boolean).join(', ')}
      testID={props.testID}
    >
      <View style={styles.line}>
        <Text variant="body">{label}</Text>
        {percentText ? (
          <Text variant="headline" tone={LEVEL_TONE[level ?? 'normal']}>
            {percentText}
          </Text>
        ) : null}
      </View>
      {usedShare === null ? (
        <Text variant="callout" tone="secondary">
          {unknownText}
        </Text>
      ) : (
        <WindowMeter {...props} usedShare={usedShare} />
      )}
      <View style={styles.line}>
        <Text variant="footnote" tone="secondary">
          {resetText || ' '}
        </Text>
        {paceText ? (
          <Text variant="footnote" tone="secondary" testID={props.paceTestID}>
            {paceText}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Name, short bar, percent and reset clock on one line. */
function MeterInlineRow(props: MeterLimitWindow) {
  const { label, usedShare, percentText, resetText, level } = props;
  const styles = useStyles();
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={[label, percentText].filter(Boolean).join(', ')}
      testID={props.testID}
    >
      <Text style={styles.inlineName} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.inlineBar}>
        {usedShare === null ? null : <WindowMeter {...props} usedShare={usedShare} />}
      </View>
      <Text variant="headline" tone={LEVEL_TONE[level ?? 'normal']} tabularNums>
        {percentText || '–'}
      </Text>
      <View style={styles.inlineReset}>
        <Icon name="clock" size={12} color="textSecondary" />
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {resetText || ' '}
        </Text>
      </View>
    </View>
  );
}

/**
 * One limit window. segmented: a provider's card, in its brand tint. meter and meterInline: the
 * Usage Limits sheets, whose bar turns warning and danger near the limit and carries a pace tick.
 */
export function LimitWindowRow(props: LimitWindowRowProps) {
  if (isSegmented(props)) return <SegmentedRow {...props} />;
  return props.variant === 'meter' ? <MeterRow {...props} /> : <MeterInlineRow {...props} />;
}
