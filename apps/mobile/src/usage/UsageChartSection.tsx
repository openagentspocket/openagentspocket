import { formatDay, programIdentity, type UsageScope } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { programTint, UsageChart, UsageHeatMap, useTheme } from '@openagentspocket/ui';
import { chartData, heatLabel, heatModel, weekdayLetters } from './usageModel';
import { localeTag, metricNumberText, type UsageMetric } from './usageText';

interface Props {
  scope: UsageScope;
  metric: UsageMetric;
  onDay: (date: string) => void;
}

/** The program lines (hold to read a day). */
export function UsageDailyChart({ scope, metric }: Omit<Props, 'onDay'>) {
  const theme = useTheme();
  const locale = localeTag();
  const data = chartData(scope, metric);
  if (data.dates.length === 0) return null;
  const caption = metric === 'cost' ? t('Estimated API cost per day') : t('Tokens per day');
  return (
    <UsageChart
      series={data.series.map((s) => ({
        key: s.key,
        label: s.label,
        color: programTint(programIdentity(s.program).brand, theme),
        points: s.points,
      }))}
      dayLabels={data.dates.map((date) => formatDay(date, locale))}
      formatValue={(value) => metricNumberText(value, metric)}
      hint={t('Hold to read a day')}
      accessibilityLabel={caption}
      testID="usage-daily"
    />
  );
}

/** The 30-day calendar: tap a day to open it. */
export function UsageCalendar({ scope, metric, onDay }: Props) {
  const locale = localeTag();
  const heat = heatModel(scope, metric);
  if (!heat) return null;
  const caption = metric === 'cost' ? t('Estimated API cost per day') : t('Tokens per day');
  return (
    <UsageHeatMap
      days={heat.days.map((day) => ({
        ...day,
        label: heatLabel(day.date, locale, day.date === heat.first || day.date.endsWith('-01')),
        accessibilityLabel: `${formatDay(day.date, locale, { includesWeekday: true })}, ${metricNumberText(day.value, metric)}`,
      }))}
      today={heat.today}
      weekdays={weekdayLetters(locale)}
      title={`${formatDay(heat.first, locale)} – ${formatDay(heat.today, locale)}`}
      caption={caption}
      onSelect={onDay}
      testID="usage-heat"
    />
  );
}

/** The program lines and the calendar under them (phone). */
export function UsageChartSection({ scope, metric, onDay }: Props) {
  return (
    <>
      <UsageDailyChart scope={scope} metric={metric} />
      <UsageCalendar scope={scope} metric={metric} onDay={onDay} />
    </>
  );
}
