import { View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { Meter } from '../primitives/Meter';
import { Text, type TextTone } from '../primitives/Text';
import { airy } from '../theme/metrics';
import { makeStyles } from '../theme/theme';

export const LIMIT_SEGMENTS = 10;

/** How much of segment `index` (0-based) a share fills, 0...1: whole ones, then one partial. */
export function segmentFill(usedShare: number, index: number, segments = LIMIT_SEGMENTS): number {
  const used = Math.min(Math.max(Number.isFinite(usedShare) ? usedShare : 0, 0), 1) * segments;
  return Math.min(Math.max(used - index, 0), 1);
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  stacked: { gap: t.spacing.xxs },
  label: { width: 64 },
  inlineLabel: { width: 92 },
  bar: { flex: 1, flexDirection: 'row', gap: airy.badgeV },
  segment: {
    flex: 1,
    height: 10,
    borderRadius: 2,
    backgroundColor: t.colors.control,
    overflow: 'hidden',
  },
  percent: { width: 44, textAlign: 'right' },
  reset: { width: 56, textAlign: 'right' },
  clock: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs, minWidth: 72 },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: t.spacing.xs,
  },
}));

export interface LimitWindowRowProps {
  /** "5-hour", "Weekly". */
  label: string;
  /** 0...1; null draws an empty bar (segments) or `unknownText` (stacked). */
  usedShare: number | null;
  /** "62%"; empty while unknown. */
  percentText: string;
  /** Time until reset ("4d 23h"); empty when unknown. */
  resetText: string;
  /**
   * `segments`: one line, a 10-segment bar in `color` (provider cards). `inline`: one line, a
   * Meter and a clock before the reset (Limits sheet). `stacked`: label and percent, the Meter,
   * then reset and pace (Usage Limits card).
   */
  layout?: 'segments' | 'inline' | 'stacked';
  /** Segment color: the provider's brand tint. */
  color?: string;
  /** 0...1 of the window elapsed: the Meter's pace tick. */
  pace?: number;
  /** Ink of the percent (warning, danger near the limit). */
  tone?: TextTone;
  /** Stacked: said instead of the Meter while the share is unknown. */
  unknownText?: string;
  /** Stacked: the pace verdict at the end of the reset line. */
  paceText?: string;
  testID?: string;
  /** testID of the Meter (inline, stacked). */
  meterTestID?: string;
  /** testID of the pace verdict (stacked). */
  paceTestID?: string;
}

/** One limit window: label, a bar (segments or Meter), percent and time to reset. */
export function LimitWindowRow({
  label,
  usedShare,
  percentText,
  resetText,
  layout = 'segments',
  color,
  pace,
  tone = 'primary',
  unknownText,
  paceText,
  testID,
  meterTestID,
  paceTestID,
}: LimitWindowRowProps) {
  const styles = useStyles();
  const a11y = {
    accessible: true,
    accessibilityLabel: [label, percentText, layout === 'segments' ? resetText : '']
      .filter(Boolean)
      .join(', '),
    testID,
  };
  const meter =
    usedShare === null ? null : (
      <Meter value={usedShare} pace={pace} accessibilityLabel={label} testID={meterTestID} />
    );
  if (layout === 'stacked') {
    return (
      <View style={styles.stacked} {...a11y}>
        <View style={styles.line}>
          <Text variant="body">{label}</Text>
          {percentText ? (
            <Text variant="headline" tone={tone}>
              {percentText}
            </Text>
          ) : null}
        </View>
        {meter ?? (
          <Text variant="callout" tone="secondary">
            {unknownText}
          </Text>
        )}
        <View style={styles.line}>
          <Text variant="footnote" tone="secondary">
            {resetText || ' '}
          </Text>
          {paceText ? (
            <Text variant="footnote" tone="secondary" testID={paceTestID}>
              {paceText}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }
  const inline = layout === 'inline';
  return (
    <View style={styles.row} {...a11y}>
      <Text style={inline ? styles.inlineLabel : styles.label} numberOfLines={1}>
        {label}
      </Text>
      {inline ? (
        <View style={styles.bar}>{meter}</View>
      ) : (
        <View style={styles.bar}>
          {Array.from({ length: LIMIT_SEGMENTS }, (_, index) => {
            const fill = usedShare === null ? 0 : segmentFill(usedShare, index);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed, ordered segments
              <View key={index} style={styles.segment} testID={`${testID}-segment-${index}`}>
                {fill > 0 ? (
                  <View
                    style={{ width: `${fill * 100}%`, height: '100%', backgroundColor: color }}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      )}
      <Text
        variant="headline"
        tone={tone}
        tabularNums
        style={inline ? undefined : styles.percent}
        numberOfLines={1}
      >
        {inline ? percentText || '–' : percentText}
      </Text>
      {inline ? (
        <View style={styles.clock}>
          <Icon name="clock" size={12} color="textSecondary" />
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {resetText || ' '}
          </Text>
        </View>
      ) : (
        <Text
          variant="footnote"
          tone="secondary"
          tabularNums
          style={styles.reset}
          numberOfLines={1}
        >
          {resetText}
        </Text>
      )}
    </View>
  );
}
