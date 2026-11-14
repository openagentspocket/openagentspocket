import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../primitives/Card';
import { Icon } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { airy } from '../theme/metrics';
import { makeStyles, useTheme } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  program: { gap: t.spacing.xs },
  line: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  dot: { width: 10, height: 10, borderRadius: t.radius.capsule },
  title: { flex: 1 },
  amounts: { flexDirection: 'row', alignItems: 'baseline', gap: t.spacing.xs },
  bar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: t.radius.capsule,
    overflow: 'hidden',
    gap: airy.line,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs },
  swatch: { width: 12, height: 12, borderRadius: t.radius.mark },
  host: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  hostTitles: { flex: 1 },
  hostAmounts: { alignItems: 'flex-end' },
  hostPad: { padding: t.spacing.md },
  separator: { height: t.metrics.hairlineWidth, backgroundColor: t.hairline },
}));

export interface UsageSplit {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

export interface UsageBreakdownRowProps {
  /** `program`: dot, name, split bar and legend; `host`: a Host glyph in a card with its date and zone. */
  variant?: 'program' | 'host';
  title: string;
  /** Host variant: the date and zone caption. */
  subtitle?: string;
  /** The cost, formatted ("US$ 1,11"). */
  cost: string;
  /** The tokens, formatted ("1,01M tokens"). */
  tokens: string;
  /** Program variant: the program's dot (a program tint). */
  dotColor?: string;
  /** Host variant: draw the row bare, to sit inside a `UsageHostGroup` (one card, hairline separators). */
  grouped?: boolean;
  split?: UsageSplit;
  /** Legend names in split order: input, cache read, cache write, output. */
  splitLabels?: readonly [string, string, string, string];
  testID?: string;
}

/** One breakdown line of the usage dashboard: a program with its token split, or a Host with its day. */
export function UsageBreakdownRow({
  variant = 'program',
  title,
  subtitle,
  cost,
  tokens,
  dotColor,
  grouped,
  split,
  splitLabels,
  testID = 'usage-breakdown-row',
}: UsageBreakdownRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const spoken = `${title}, ${cost}, ${tokens}`;
  if (variant === 'host') {
    const label = subtitle ? `${title}, ${subtitle}, ${cost}, ${tokens}` : spoken;
    const row = (
      <View style={[styles.host, grouped && styles.hostPad]}>
        <Icon name="server" size={26} color="textSecondary" />
        <View style={styles.hostTitles}>
          <Text variant="headline" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="footnote" tone="secondary" numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.hostAmounts}>
          <Text variant="headline" tabularNums>
            {cost}
          </Text>
          <Text variant="footnote" tone="secondary" tabularNums>
            {tokens}
          </Text>
        </View>
      </View>
    );
    if (grouped)
      return (
        <View testID={testID} accessible accessibilityLabel={label}>
          {row}
        </View>
      );
    return (
      <Card testID={testID} accessibilityLabel={label}>
        {row}
      </Card>
    );
  }
  const parts = split ? [split.input, split.cacheRead, split.cacheWrite, split.output] : [];
  const colors = [
    theme.colors.textTertiary,
    theme.colors.info,
    theme.colors.warning,
    theme.colors.textPrimary,
  ];
  return (
    <View style={styles.program} testID={testID} accessible accessibilityLabel={spoken}>
      <View style={styles.line}>
        <View style={[styles.dot, { backgroundColor: dotColor ?? theme.colors.accent }]} />
        <Text variant="headline" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        <View style={styles.amounts}>
          <Text variant="headline" tabularNums>
            {cost}
          </Text>
          <Text variant="subheadline" tone="secondary" tabularNums>
            {tokens}
          </Text>
        </View>
      </View>
      {split ? (
        <View style={styles.bar} testID="usage-split-bar">
          {parts.map((part, index) =>
            part > 0 ? (
              <View
                // biome-ignore lint/suspicious/noArrayIndexKey: four fixed segments
                key={index}
                style={{ flex: part, backgroundColor: colors[index] }}
                testID={`usage-split-${index}`}
              />
            ) : null,
          )}
        </View>
      ) : null}
      {split && splitLabels ? (
        <View style={styles.legend} testID="usage-split-legend">
          {splitLabels.map((label, index) => (
            <View key={label} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: colors[index] }]} />
              <Text variant="caption2" tone="secondary">
                {label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The Hosts section: rows made with `grouped` share one card, split by hairlines (Swift's grouped list). */
export function UsageHostGroup({
  children,
  testID = 'usage-host-group',
}: {
  children: ReactNode[] | ReactNode;
  testID?: string;
}) {
  const styles = useStyles();
  const rows = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <Card padded={false} testID={testID}>
      {rows.map((row, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
        <View key={index}>
          {index > 0 ? <View style={styles.separator} /> : null}
          {row}
        </View>
      ))}
    </Card>
  );
}
