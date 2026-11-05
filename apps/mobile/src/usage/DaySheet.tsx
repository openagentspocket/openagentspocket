import {
  formatDay,
  formatTokens,
  programDisplayName,
  programIdentity,
  scopeDates,
  scopeDay,
  sumSummaries,
  type UsageScope,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  Card,
  Icon,
  makeStyles,
  programTint,
  Sheet,
  Text,
  UsageBreakdownRow,
  UsageHostGroup,
  UsageTotals,
  useTheme,
} from '@openagentspocket/ui';
import { Pressable, View } from 'react-native';
import { type BreakdownKind, breakdownTitle } from './BreakdownRows';
import { programSplit } from './usageModel';
import { localeTag, metricText, type UsageMetric } from './usageText';

const useStyles = makeStyles((th) => ({
  section: { gap: th.spacing.xs },
  heading: { paddingHorizontal: th.spacing.xs },
  programs: { gap: th.spacing.md, paddingHorizontal: th.spacing.xs },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: th.spacing.md,
  },
  separator: { height: th.metrics.hairlineWidth, backgroundColor: th.hairline },
}));

const LINKS = ['models', 'directories'] as const satisfies readonly BreakdownKind[];

interface Props {
  /** The report day (`YYYY-MM-DD`) to open, or null while closed. */
  date: string | null;
  onClose: () => void;
  onDismissed?: () => void;
  /** Steps to another day of the scope. */
  onDate: (date: string) => void;
  scope: UsageScope;
  metric: UsageMetric;
  /** Opens usage.breakdown-list for Models or Directories (the sheet closes behind it). */
  onBreakdown: (kind: (typeof LINKS)[number]) => void;
}

/** usage.day-sheet: the day's figure, then By Host and By program with the token split. */
export function DaySheet({
  date,
  onClose,
  onDismissed,
  onDate,
  scope,
  metric,
  onBreakdown,
}: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = localeTag();
  const dates = scopeDates(scope);
  const index = date === null ? -1 : dates.indexOf(date);
  const previous = index > 0 ? dates[index - 1] : undefined;
  const next = index >= 0 ? dates[index + 1] : undefined;
  const total = date === null ? null : scopeDay(scope, date);
  const hostCount = scope.included.length;
  const labels = [t('Input'), t('Cache read'), t('Cache write'), t('Output')] as const;
  return (
    <Sheet
      visible={date !== null}
      onClose={onClose}
      onDismissed={onDismissed}
      headerless
      detent={{ fraction: 0.65 }}
      closeLabel={t('Close')}
      testID="usage-day-sheet"
    >
      {date !== null && total ? (
        <>
          <UsageTotals
            mode="day"
            title={formatDay(date, locale, { includesWeekday: true })}
            subtitle={
              hostCount === 1
                ? t('Token Usage on this Host')
                : t('Token Usage on these %@ Hosts', String(hostCount))
            }
            total={metricText(total, metric)}
            tokens={t('Estimated API cost · %@ tokens', formatTokens(total.tokens.total, locale))}
            day={{
              previousLabel: t('Previous Day'),
              nextLabel: t('Next Day'),
              closeLabel: t('Close'),
              onPrevious: () => previous && onDate(previous),
              onNext: next ? () => onDate(next) : undefined,
              onClose,
            }}
          />
          <View style={styles.section}>
            <Text variant="footnote" semibold tone="secondary" style={styles.heading}>
              {t('By Host')}
            </Text>
            <UsageHostGroup>
              {scope.included.map((host) => {
                const day = sumSummaries(
                  host.report.programs.flatMap((p) =>
                    p.tokenUsage.daily.filter((d) => d.date === date),
                  ),
                );
                return (
                  <UsageBreakdownRow
                    key={host.id}
                    grouped
                    variant="host"
                    title={host.name}
                    subtitle={[formatDay(date, locale), host.report.timeZone]
                      .filter(Boolean)
                      .join(' · ')}
                    cost={metricText(day, metric)}
                    tokens={t('%@ tokens', formatTokens(day.tokens.total, locale))}
                    testID={`day-host-${host.id}`}
                  />
                );
              })}
            </UsageHostGroup>
          </View>
          <View style={styles.section}>
            <Text variant="footnote" semibold tone="secondary" style={styles.heading}>
              {t('By program')}
            </Text>
            <View style={styles.programs}>
              {scope.programs.flatMap((program) => {
                const day = program.daily.find((d) => d.date === date);
                if (!day) return [];
                return [
                  <UsageBreakdownRow
                    key={program.program}
                    title={programDisplayName(program.program)}
                    dotColor={programTint(programIdentity(program.program).brand, theme)}
                    cost={metricText(day, metric)}
                    tokens={t('%@ tokens', formatTokens(day.tokens.total, locale))}
                    split={programSplit({
                      ...program,
                      totals: { ...program.totals, last30Days: day },
                    })}
                    splitLabels={labels}
                    testID={`day-program-${program.program}`}
                  />,
                ];
              })}
            </View>
          </View>
          <Card padded={false} testID="usage-day-links">
            {LINKS.map((kind, index) => (
              <View key={kind}>
                {index > 0 ? <View style={styles.separator} /> : null}
                <Pressable
                  onPress={() => onBreakdown(kind)}
                  accessibilityRole="button"
                  style={styles.link}
                  testID={`usage-day-link-${kind}`}
                >
                  <Text variant="subheadline" tone="accent">
                    {breakdownTitle(kind)}
                  </Text>
                  <Icon name="chevronRight" size={12} color="textTertiary" />
                </Pressable>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Sheet>
  );
}
