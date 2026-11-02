import { useState } from 'react';
import { View } from 'react-native';
import { UsageBreakdownRow } from '../../components/UsageBreakdownRow';
import { UsageChart } from '../../components/UsageChart';
import type { HeatDay } from '../../components/UsageHeatMap';
import { UsageHeatMap } from '../../components/UsageHeatMap';
import { UsageLimitChip } from '../../components/UsageLimitChip';
import { UsageTotals } from '../../components/UsageTotals';
import { makeStyles, useTheme } from '../../theme/theme';
import type { CatalogEntry } from './types';

const useStyles = makeStyles((t) => ({
  strip: { flexDirection: 'row', gap: t.spacing.sm, paddingHorizontal: t.metrics.screenInset },
  chip: { flexShrink: 0 },
  pad: { paddingHorizontal: t.metrics.screenInset, gap: t.spacing.md },
}));

const noop = () => {};

function LimitChips() {
  const styles = useStyles();
  return (
    <View style={styles.strip}>
      <View style={styles.chip}>
        <UsageLimitChip
          percent={48}
          host="Build Server"
          hostStatus="done"
          program="Codex"
          window="Weekly"
          onPress={noop}
        />
      </View>
      <View style={styles.chip}>
        <UsageLimitChip
          percent={96}
          host="Studio Mac"
          hostStatus="done"
          program="Codex"
          window="Weekly"
          onPress={noop}
        />
      </View>
    </View>
  );
}

function Totals({ day }: { day?: boolean }) {
  const [metric, setMetric] = useState('cost');
  const [range, setRange] = useState('30d');
  if (day)
    return (
      <UsageTotals
        mode="day"
        title="Sun, 1 Nov"
        subtitle="Token Usage on these 2 Hosts"
        total="US$ 1,44"
        tokens="Estimated API cost · 1,38M tokens"
        day={{
          previousLabel: 'Previous Day',
          nextLabel: 'Next Day',
          closeLabel: 'Close',
          onPrevious: noop,
          onClose: noop,
        }}
      />
    );
  return (
    <UsageTotals
      metric={{
        value: metric,
        onChange: setMetric,
        options: [
          { value: 'cost', label: 'Est. Cost' },
          { value: 'tokens', label: 'Tokens' },
        ],
      }}
      range={{
        value: range,
        onChange: setRange,
        options: [
          { value: 'today', label: 'Today' },
          { value: '7d', label: '7 Days' },
          { value: '30d', label: '30 Days' },
        ],
      }}
      caption="Estimated API cost · Last 30 days"
      total="US$ 47,10"
      tokens="44,9M tokens on these 2 Hosts"
    />
  );
}

const WAVE = [
  1.1, 0.5, 0.4, 1.4, 1.7, 1.1, 2.2, 2.5, 1.9, 1.1, 0.9, 0.7, 1.4, 2.0, 2.2, 2.1, 1.3, 0.6, 1.0,
  1.5, 2.3, 2.5, 1.6, 2.3, 1.9, 1.4, 1.2, 2.4, 2.1, 1.5,
];

function Chart() {
  const theme = useTheme();
  const labels = WAVE.map((_, index) => dayName(dayAt(5 + index)));
  return (
    <View style={useStyles().pad}>
      <UsageChart
        series={[
          { key: 'claude', label: 'Claude Code', color: theme.colors.warning, points: WAVE },
          {
            key: 'codex',
            label: 'Codex',
            color: theme.colors.textPrimary,
            points: WAVE.map((v) => v / 5),
          },
        ]}
        dayLabels={labels}
        formatValue={(value) => `US$ ${value}`}
        hint="Hold to read a day"
        accessibilityLabel="Estimated API cost per day"
      />
    </View>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
const START = Date.UTC(2026, 8, 28); // Monday, 28 Sep 2026
const dayAt = (offset: number) => new Date(START + offset * 86_400_000);
const dayName = (date: Date) => `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
/** 35 days from Monday 28 Sep to Sunday 1 Nov; days before 3 Oct are not recorded. */
const HEAT_DAYS: HeatDay[] = Array.from({ length: 35 }, (_, offset) => {
  const date = dayAt(offset);
  const recorded = offset >= 5;
  return {
    date: date.toISOString().slice(0, 10),
    label: offset === 34 ? dayName(date) : String(date.getUTCDate()),
    accessibilityLabel: dayName(date),
    value: recorded ? ((offset * 7) % 11) / 2 : 0,
    recorded,
  };
});
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function Heat({ full }: { full?: boolean }) {
  return (
    <View style={useStyles().pad}>
      <UsageHeatMap
        days={full ? HEAT_DAYS.slice(7) : HEAT_DAYS.slice(0, 21)}
        today="2026-11-01"
        weekdays={WEEKDAYS}
        title={full ? undefined : '3 Oct – 1 Nov'}
        caption={full ? undefined : 'Estimated API cost per day'}
        legend={
          full
            ? { less: 'Less', more: 'More', today: 'Today', notRecorded: 'Not recorded' }
            : undefined
        }
        onSelect={noop}
      />
    </View>
  );
}

function Breakdown({ host }: { host?: boolean }) {
  const theme = useTheme();
  const labels = ['Input', 'Cache read', 'Cache write', 'Output'] as const;
  return (
    <View style={useStyles().pad}>
      {host ? (
        <>
          <UsageBreakdownRow
            variant="host"
            title="Studio Mac"
            subtitle="1 Nov · America/Argentina/Tucuman"
            cost="US$ 0,94"
            tokens="879K tokens"
          />
          <UsageBreakdownRow
            variant="host"
            title="Build Server"
            subtitle="1 Nov · America/Argentina/Tucuman"
            cost="US$ 0,50"
            tokens="499K tokens"
          />
        </>
      ) : (
        <>
          <UsageBreakdownRow
            title="Claude Code"
            dotColor={theme.colors.warning}
            cost="US$ 1,11"
            tokens="1,01M tokens"
            split={{ input: 3, cacheRead: 80, cacheWrite: 10, output: 4 }}
            splitLabels={labels}
          />
          <UsageBreakdownRow
            title="Codex"
            dotColor={theme.colors.textPrimary}
            cost="US$ 0,33"
            tokens="371K tokens"
            split={{ input: 4, cacheRead: 78, cacheWrite: 12, output: 4 }}
            splitLabels={labels}
          />
        </>
      )}
    </View>
  );
}

/** Demos of the UX3 group 'usage': one entry per component, one variant per catalog variant id. */
export const usageEntries: readonly CatalogEntry[] = [
  { name: 'UsageLimitChip', variants: [{ id: 'default', render: () => <LimitChips /> }] },
  {
    name: 'UsageTotals',
    variants: [
      { id: 'default', render: () => <Totals /> },
      { id: 'day', render: () => <Totals day /> },
    ],
  },
  { name: 'UsageChart', variants: [{ id: 'default', render: () => <Chart /> }] },
  {
    name: 'UsageHeatMap',
    variants: [
      { id: 'default', render: () => <Heat /> },
      { id: 'full', render: () => <Heat full /> },
    ],
  },
  {
    name: 'UsageBreakdownRow',
    variants: [
      { id: 'default', render: () => <Breakdown /> },
      { id: 'host', render: () => <Breakdown host /> },
    ],
  },
];
