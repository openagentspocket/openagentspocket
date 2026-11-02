import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { Segmented, type SegmentedOption } from '../primitives/Segmented';
import { Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';

const BUTTON = 32;

const useStyles = makeStyles((t) => ({
  root: { gap: t.spacing.sm, paddingHorizontal: t.spacing.xs },
  controls: { flexDirection: 'row', gap: t.spacing.xxs, alignItems: 'center' },
  // Basis auto + grow by segment count: each group is at least as wide as its labels.
  metric: { flexGrow: 2, flexShrink: 0, flexBasis: 'auto' },
  range: { flexGrow: 3, flexShrink: 0, flexBasis: 'auto' },
  totals: { gap: t.spacing.xxs },
  total: { fontSize: 44, lineHeight: 52, fontWeight: '700' },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  headTitles: { flex: 1, minWidth: 0 },
  button: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flip: { transform: [{ rotate: '180deg' }] },
  scope: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xxs,
    paddingHorizontal: t.spacing.sm,
    minHeight: 32,
    borderRadius: 999,
    backgroundColor: t.colors.control,
  },
}));

interface Segments<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export interface UsageTotalsProps<M extends string = string, R extends string = string> {
  /** `summary`: the dashboard header; `day`: the day sheet header with step arrows. */
  mode?: 'summary' | 'day';
  metric?: Segments<M>;
  range?: Segments<R>;
  /** The scope menu pill ("All Hosts"). */
  scope?: { label: string; onPress: () => void };
  /** Day mode: the date title and what it covers ("Token Usage on these 2 Hosts"). */
  title?: string;
  subtitle?: string;
  /** Secondary line above the total in summary mode ("Estimated API cost · Last 30 days"). */
  caption?: string;
  total: string;
  /** Secondary line under the total ("44,9M tokens on these 2 Hosts"). */
  tokens: string;
  day?: {
    previousLabel: string;
    nextLabel: string;
    closeLabel: string;
    onPrevious: () => void;
    /** Omit on the latest day: the next arrow is disabled. */
    onNext?: () => void;
    onClose: () => void;
  };
  testID?: string;
}

interface RoundButtonProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  children: ReactNode;
  testID: string;
}

function RoundButton({ label, onPress, disabled, children, testID }: RoundButtonProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={4}
      style={[
        styles.button,
        {
          backgroundColor: disabled ? theme.colors.control : theme.wash(theme.colors.accent),
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

/** The usage total: metric and range segments over a big currency figure, or the day sheet's dated header. */
export function UsageTotals<M extends string, R extends string>({
  mode = 'summary',
  metric,
  range,
  scope,
  title,
  subtitle,
  caption,
  total,
  tokens,
  day,
  testID = 'usage-totals',
}: UsageTotalsProps<M, R>) {
  const styles = useStyles();
  const totals = (
    <View style={styles.totals}>
      {caption ? (
        <Text variant="subheadline" tone="secondary">
          {caption}
        </Text>
      ) : null}
      <Text style={styles.total} tabularNums numberOfLines={1} testID="usage-total">
        {total}
      </Text>
      <Text variant="subheadline" tone="secondary" testID="usage-tokens">
        {tokens}
      </Text>
    </View>
  );
  if (mode === 'day') {
    return (
      <View style={styles.root} testID={testID}>
        <View style={styles.head}>
          <View style={styles.headTitles} accessible accessibilityRole="header">
            <Text variant="title2" numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="subheadline" tone="secondary" numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {day ? (
            <>
              <RoundButton
                label={day.previousLabel}
                onPress={day.onPrevious}
                testID="usage-day-previous"
              >
                <View style={styles.flip}>
                  <Icon name="chevronRight" size={16} color="accent" />
                </View>
              </RoundButton>
              <RoundButton
                label={day.nextLabel}
                onPress={day.onNext}
                disabled={!day.onNext}
                testID="usage-day-next"
              >
                <Icon name="chevronRight" size={16} color="accent" />
              </RoundButton>
              <RoundButton label={day.closeLabel} onPress={day.onClose} testID="usage-day-close">
                <Icon name="close" size={16} color="accent" />
              </RoundButton>
            </>
          ) : null}
        </View>
        {totals}
      </View>
    );
  }
  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.controls}>
        {metric ? (
          <View style={styles.metric}>
            <Segmented {...metric} testID="usage-metric" />
          </View>
        ) : null}
        {range ? (
          <View style={styles.range}>
            <Segmented {...range} testID="usage-range" />
          </View>
        ) : null}
      </View>
      {scope ? (
        <Pressable
          onPress={scope.onPress}
          accessibilityRole="button"
          accessibilityLabel={scope.label}
          style={styles.scope}
          testID="usage-scope"
        >
          <Text variant="footnote" semibold>
            {scope.label}
          </Text>
          <Icon name="chevronUpDown" size={12} color="textSecondary" />
        </Pressable>
      ) : null}
      {totals}
    </View>
  );
}
