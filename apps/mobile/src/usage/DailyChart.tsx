import {
  formatDay,
  RANGE_DAY_COUNT,
  scopeDates,
  scopeDay,
  type UsageRange,
  type UsageScope,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { BarChart, Card, ListRow, Section, Text } from '@openagentspocket/ui';
import { useState } from 'react';
import {
  localeTag,
  metricNumberText,
  metricText,
  metricValue,
  type UsageMetric,
} from './usageText';

/** Rows listed before "Show All N Days". */
const COLLAPSED_ROWS = 7;

interface Props {
  scope: UsageScope;
  range: UsageRange;
  metric: UsageMetric;
  onDay: (date: string) => void;
}

/** Daily totals as bars (a week at least), and the days as rows that open the day sheet. */
export function DailyChart({ scope, range, metric, onDay }: Props) {
  const [showAll, setShowAll] = useState(false);
  const dates = scopeDates(scope).slice(-Math.max(RANGE_DAY_COUNT[range], COLLAPSED_ROWS));
  if (dates.length === 0) return null;
  const locale = localeTag();
  const days = dates.map((date) => ({ date, summary: scopeDay(scope, date) }));
  const rows = (showAll ? days : days.slice(-COLLAPSED_ROWS)).slice().reverse();
  return (
    <>
      <Card testID="usage-daily">
        <Text variant="footnote" tone="secondary">
          {metric === 'cost' ? t('Estimated API cost per day') : t('Tokens per day')}
        </Text>
        <BarChart
          data={days.map(({ date, summary }) => ({
            key: date,
            label: formatDay(date, locale),
            value: metricValue(summary, metric),
          }))}
          highlightKey={dates.at(-1)}
          formatValue={(value) => metricNumberText(value, metric)}
          accessibilityLabel={metric === 'cost' ? t('Daily estimated API cost') : t('Daily tokens')}
          onPressBar={onDay}
        />
      </Card>
      <Section
        grouped
        title={t('Days')}
        action={
          days.length > COLLAPSED_ROWS && !showAll
            ? {
                title: t('Show All %@ Days', String(days.length)),
                onPress: () => setShowAll(true),
              }
            : undefined
        }
      >
        {rows.map(({ date, summary }) => (
          <ListRow
            key={date}
            title={formatDay(date, locale, { includesWeekday: true })}
            value={metricText(summary, metric)}
            chevron
            onPress={() => onDay(date)}
            testID={`day-${date}`}
          />
        ))}
      </Section>
    </>
  );
}
