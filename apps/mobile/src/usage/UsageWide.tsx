import {
  exclusionText,
  formatShare,
  formatTokens,
  type HostReading,
  scopeIsEmpty,
  scopeTotal,
  USAGE_RANGES,
  type UsageRange,
  type UsageScope,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  Card,
  EmptyState,
  ListRow,
  makeStyles,
  Screen,
  Section,
  SectionHeader,
  Segmented,
  Text,
} from '@openagentspocket/ui';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { UsageBreakdownSection } from './UsageBreakdownSection';
import { UsageCalendar, UsageDailyChart } from './UsageChartSection';
import { UsageProgramsSection } from './UsageHostsSection';
import { UsageLimitsStrip } from './UsageLimitsStrip';
import { UsageNotices } from './UsageNotices';
import {
  localeTag,
  metricText,
  metricTitle,
  metricValue,
  renderMessage,
  type UsageMetric,
  updatedText,
} from './usageText';

/** The detail needs this much width for two columns (Swift's `isWide`). */
export const WIDE_DETAIL = 860;
/** The Host column's width. */
export const HOST_COLUMN = 300;
/** Window width from which Usage shows the Host column beside the two-column dashboard. */
export const WIDE_WINDOW = WIDE_DETAIL + HOST_COLUMN;

const RANGE_TITLE = {
  today: () => t('Today'),
  last7Days: () => t('7 Days'),
  last30Days: () => t('30 Days'),
} as const satisfies Record<UsageRange, () => string>;

const RANGE_NAME = {
  today: () => t('Today'),
  last7Days: () => t('Last 7 days'),
  last30Days: () => t('Last 30 days'),
} as const satisfies Record<UsageRange, () => string>;

const useStyles = makeStyles((th) => ({
  root: { flex: 1, flexDirection: 'row' },
  column: {
    width: HOST_COLUMN,
    flexGrow: 0,
    flexShrink: 0,
    borderRightWidth: th.metrics.hairlineWidth,
    borderRightColor: th.hairline,
  },
  columnBody: { padding: th.metrics.screenInset, gap: th.spacing.sm },
  detail: { flex: 1 },
  notices: { padding: th.metrics.screenInset, gap: th.spacing.lg },
  detailBody: {
    padding: th.metrics.screenInset,
    gap: th.spacing.lg,
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
  },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: th.spacing.sm },
  toolbarGrow: { flex: 1 },
  status: { flex: 1 },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: th.spacing.xl },
  half: { flex: 1, gap: th.spacing.sm },
  hero: { gap: th.spacing.xxs, paddingTop: th.spacing.sm },
  figure: { fontSize: 56, lineHeight: 64, fontWeight: '700' },
  heading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
}));

interface ColumnProps {
  /** The All Hosts scope: the column keeps listing every Host while one is selected. */
  scope: UsageScope;
  /** null is All Hosts. */
  host: string | null;
  onHost: (host: string | null) => void;
  metric: UsageMetric;
}

/** usage.ipad-split sidebar: All Hosts, then each Host with its share of the last 30 days. */
export function UsageHostColumn({ scope, host, onHost, metric }: ColumnProps) {
  const styles = useStyles();
  const locale = localeTag();
  const total = scopeTotal(scope, 'last30Days');
  const whole = metricValue(total, metric);
  const tokens = (tokenCount: number) => t('%@ tokens', formatTokens(tokenCount, locale));
  const second = (summary: typeof total) =>
    metric === 'cost' ? tokens(summary.tokens.total) : metricText(summary, 'cost');
  return (
    <ScrollView
      style={styles.column}
      contentContainerStyle={styles.columnBody}
      testID="usage-hosts-column"
    >
      <SectionHeader
        title={
          metric === 'cost'
            ? t('Estimated API cost · Last 30 days')
            : t('Token Usage · Last 30 days')
        }
      />
      <Card padded={false}>
        <ListRow
          icon="server"
          title={t('All Hosts')}
          subtitle={`${t('%@ Hosts', String(scope.included.length))} · ${second(total)}`}
          value={metricText(total, metric)}
          selected={host === null}
          onPress={() => onHost(null)}
          testID="usage-host-all"
        />
        {scope.included.map((entry) => (
          <ListRow
            key={entry.id}
            icon="server"
            title={entry.name}
            subtitle={`${formatShare(metricValue(entry.last30Days, metric), whole, locale)} · ${second(entry.last30Days)}`}
            value={metricText(entry.last30Days, metric)}
            selected={host === entry.id}
            onPress={() => onHost(entry.id)}
            testID={`usage-host-${entry.id}`}
          />
        ))}
        {scope.loading.map((entry) => (
          <ListRow
            key={entry.id}
            icon="server"
            title={entry.name}
            subtitle={t('Loading…')}
            testID={`usage-host-${entry.id}`}
          />
        ))}
      </Card>
      {scope.excluded.length > 0 ? (
        <Section grouped title={t('Not included')}>
          {scope.excluded.map((entry) => (
            <ListRow
              key={entry.id}
              icon="server"
              title={entry.name}
              subtitle={renderMessage(exclusionText(entry.exclusion))}
              disabled
              testID={`usage-host-${entry.id}`}
            />
          ))}
        </Section>
      ) : null}
    </ScrollView>
  );
}

interface DetailProps {
  scope: UsageScope;
  inScope: readonly HostReading[];
  range: UsageRange;
  onRange: (range: UsageRange) => void;
  metric: UsageMetric;
  onMetric: (metric: UsageMetric) => void;
  status: string;
  now: Date;
  onDay: (date: string) => void;
  onShowAll: Parameters<typeof UsageBreakdownSection>[0]['onShowAll'];
  onDetails: () => void;
  /** Under the limits strip: the Accounts notice and the limits rows. */
  footer?: ReactNode;
}

/** usage.wide-layout: toolbar, then hero + programs beside the chart, calendar beside Breakdown, limits. */
export function UsageWideDetail({
  scope,
  inScope,
  range,
  onRange,
  metric,
  onMetric,
  status,
  now,
  onDay,
  onShowAll,
  onDetails,
  footer,
}: DetailProps) {
  const styles = useStyles();
  const locale = localeTag();
  const total = scopeTotal(scope, range);
  const hosts = String(scope.included.length);
  const name = RANGE_NAME[range]();
  const caption =
    metric === 'cost'
      ? scope.included.length === 1
        ? t('Estimated API cost on this Host · %@', name)
        : t('Estimated API cost on these %@ Hosts · %@', hosts, name)
      : scope.included.length === 1
        ? t('Token Usage on this Host · %@', name)
        : t('Token Usage on these %@ Hosts · %@', hosts, name);
  return (
    <View style={styles.detailBody} testID="usage-wide">
      <View style={styles.toolbar}>
        <Text variant="footnote" tone="tertiary" style={styles.status} testID="usage-status">
          {status}
        </Text>
        <View style={styles.toolbarGrow}>
          <Segmented
            value={metric}
            onChange={onMetric}
            options={(['cost', 'tokens'] as const).map((value) => ({
              value,
              label: metricTitle(value),
            }))}
            testID="usage-metric"
          />
        </View>
        <View style={styles.toolbarGrow}>
          <Segmented
            value={range}
            onChange={onRange}
            options={USAGE_RANGES.map((value) => ({ value, label: RANGE_TITLE[value]() }))}
            testID="usage-range"
          />
        </View>
      </View>
      <View style={styles.columns}>
        <View style={styles.half}>
          <View style={styles.hero}>
            <Text style={styles.figure} tabularNums numberOfLines={1} testID="usage-total">
              {metricText(total, metric)}
            </Text>
            <Text variant="subheadline" tone="secondary">
              {caption}
            </Text>
            <Text variant="subheadline" tone="secondary" tabularNums>
              {metric === 'cost'
                ? t('%@ tokens', formatTokens(total.tokens.total, locale))
                : t('%@ est.', metricText(total, 'cost'))}
            </Text>
          </View>
          <UsageProgramsSection scope={scope} range={range} metric={metric} />
        </View>
        <View style={styles.half}>
          <View style={styles.heading}>
            <Text variant="title2" accessibilityRole="header">
              {metric === 'cost' ? t('Daily estimated API cost') : t('Daily tokens')}
            </Text>
            <Text variant="footnote" tone="secondary">
              {range === 'today' ? t('Last 7 days') : name}
            </Text>
          </View>
          <UsageDailyChart scope={scope} metric={metric} />
        </View>
      </View>
      <View style={styles.columns}>
        <View style={styles.half}>
          <UsageCalendar scope={scope} metric={metric} onDay={onDay} />
        </View>
        <View style={styles.half}>
          <UsageBreakdownSection
            scope={scope}
            metric={metric}
            onDay={onDay}
            onShowAll={onShowAll}
          />
        </View>
      </View>
      <UsageLimitsStrip readings={inScope} now={now} onDetails={onDetails} />
      {footer}
    </View>
  );
}

interface WideScreenProps extends Omit<DetailProps, 'footer' | 'status'> {
  /** Every Host, for the column. */
  all: UsageScope;
  host: string | null;
  onHost: (host: string | null) => void;
  refreshing: boolean;
  footer: ReactNode;
  sheets: ReactNode;
}

/** The wide Usage screen: the Host column, then the scrolling two-column detail. */
export function UsageWideScreen({
  all,
  host,
  onHost,
  refreshing,
  footer,
  sheets,
  ...detail
}: WideScreenProps) {
  const styles = useStyles();
  return (
    <Screen scroll={false} bare testID="usage-screen">
      <View style={styles.root}>
        <UsageHostColumn scope={all} host={host} onHost={onHost} metric={detail.metric} />
        <ScrollView style={styles.detail} testID="usage-screen-scroll">
          {scopeIsEmpty(detail.scope) ? (
            <EmptyState
              title={t('No Host in this scope can report Usage right now.')}
              layout="compact"
            />
          ) : (
            <UsageWideDetail
              {...detail}
              status={updatedText(refreshing, detail.now)}
              footer={footer}
            />
          )}
          <View style={styles.notices}>
            <UsageNotices scope={detail.scope} range={detail.range} metric={detail.metric} />
          </View>
        </ScrollView>
      </View>
      {sheets}
    </Screen>
  );
}
