import {
  formatDay,
  formatTokens,
  programDisplayName,
  sumTokens,
  type UsageScope,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Card, ListRow, Sheet } from '@openagentspocket/ui';
import { localeTag, metricText, type UsageMetric } from './usageText';

interface Props {
  /** The report day (`YYYY-MM-DD`) to open, or null while closed. */
  date: string | null;
  onClose: () => void;
  scope: UsageScope;
  metric: UsageMetric;
}

/** usage.day-sheet: one day's figure per program and the token kinds that add up to it. */
export function DaySheet({ date, onClose, scope, metric }: Props) {
  const locale = localeTag();
  const days = scope.programs.flatMap((program) => {
    const day = program.daily.find((d) => d.date === date);
    return day ? [{ program: program.program, day }] : [];
  });
  const tokens = sumTokens(days.map(({ day }) => day.tokens));
  return (
    <Sheet
      visible={date !== null}
      onClose={onClose}
      title={
        date === null
          ? undefined
          : formatDay(date, locale, { includesYear: true, includesWeekday: true })
      }
      detent="medium"
      closeLabel={t('Close')}
      testID="usage-day-sheet"
    >
      <Card padded={false} level="overlay">
        {days.map(({ program, day }) => (
          <ListRow
            key={program}
            title={programDisplayName(program)}
            subtitle={t('%@ tokens', formatTokens(day.tokens.total, locale))}
            value={metricText(day, metric)}
            testID={`day-program-${program}`}
          />
        ))}
      </Card>
      <Card padded={false} level="overlay">
        <ListRow title={t('Input')} value={formatTokens(tokens.input, locale)} />
        <ListRow title={t('Output')} value={formatTokens(tokens.output, locale)} />
        <ListRow title={t('Cache read')} value={formatTokens(tokens.cacheRead, locale)} />
        <ListRow title={t('Cache write')} value={formatTokens(tokens.cacheWrite, locale)} />
      </Card>
    </Sheet>
  );
}
