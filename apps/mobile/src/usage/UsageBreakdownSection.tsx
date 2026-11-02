import {
  formatDay,
  formatShare,
  formatTokens,
  programIdentity,
  type Summary,
  scopeDates,
  scopeDay,
  type UsageScope,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  Card,
  ListRow,
  makeStyles,
  programTint,
  SectionHeader,
  Segmented,
  useTheme,
} from '@openagentspocket/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { localeTag, metricText, metricValue, type UsageMetric } from './usageText';

/** Rows listed before "Show All". */
const TOP = 5;

const useStyles = makeStyles((th) => ({
  root: { gap: th.spacing.xs },
  dot: { width: 10, height: 10, borderRadius: 5 },
}));

type Kind = 'models' | 'directories' | 'days';
const ROW_PREFIX = { models: 'model', directories: 'directory', days: 'day' } as const;

interface Entry {
  key: string;
  title: string;
  subtitle?: string;
  summary: Summary;
  program?: string;
  date?: string;
}

/** Every row of one breakdown, busiest first (days newest first). */
export function breakdownEntries(scope: UsageScope, kind: Kind, metric: UsageMetric): Entry[] {
  const locale = localeTag();
  if (kind === 'days') {
    return scopeDates(scope)
      .reverse()
      .map((date) => ({
        key: date,
        date,
        title: formatDay(date, locale, { includesWeekday: true }),
        summary: scopeDay(scope, date),
      }));
  }
  const entries: Entry[] =
    kind === 'models'
      ? scope.programs.flatMap((p) =>
          p.models.map((model) => ({
            key: `${p.program}\0${model.model}`,
            title: model.model,
            subtitle: model.priced ? undefined : t('Unpriced'),
            summary: model,
            program: p.program,
          })),
        )
      : scope.programs.flatMap((p) =>
          p.directories.map(({ hostName, directory }) => ({
            key: `${p.program}\0${hostName}\0${directory.path}`,
            title: directory.path,
            subtitle: scope.included.length > 1 ? hostName : undefined,
            summary: directory,
            program: p.program,
          })),
        );
  return entries.sort((a, b) => metricValue(b.summary, metric) - metricValue(a.summary, metric));
}

interface RowsProps {
  scope: UsageScope;
  kind: Kind;
  metric: UsageMetric;
  limit?: number;
  onDay?: (date: string) => void;
}

/** The rows of one breakdown in a single card: dot, name, figure, share and tokens. */
export function BreakdownRows({ scope, kind, metric, limit, onDay }: RowsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const all = breakdownEntries(scope, kind, metric);
  const whole = all.reduce((sum, e) => sum + metricValue(e.summary, metric), 0);
  const locale = localeTag();
  const rows = limit ? all.slice(0, limit) : all;
  return (
    <Card padded={false} testID={`usage-breakdown-${kind}`}>
      {rows.map((entry) => {
        const share = formatShare(metricValue(entry.summary, metric), whole, locale);
        const tokens = t('%@ tokens', formatTokens(entry.summary.tokens.total, locale));
        const date = entry.date;
        return (
          <ListRow
            key={entry.key}
            title={entry.title}
            subtitle={[entry.subtitle, `${share} · ${tokens}`].filter(Boolean).join(' · ')}
            value={metricText(entry.summary, metric)}
            leading={
              entry.program ? (
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: programTint(programIdentity(entry.program).brand, theme) },
                  ]}
                />
              ) : undefined
            }
            chevron={date !== undefined}
            onPress={date !== undefined && onDay ? () => onDay(date) : undefined}
            testID={`${ROW_PREFIX[kind]}-${entry.date ?? entry.title}`}
          />
        );
      })}
    </Card>
  );
}

interface Props {
  scope: UsageScope;
  metric: UsageMetric;
  onDay: (date: string) => void;
}

/** "Breakdown": Models, Directories or Days in a segmented control, five rows and Show All. */
export function UsageBreakdownSection({ scope, metric, onDay }: Props) {
  const styles = useStyles();
  const [kind, setKind] = useState<Kind>('models');
  const [showAll, setShowAll] = useState(false);
  const total = breakdownEntries(scope, kind, metric).length;
  const label = { models: t('Models'), directories: t('Directories'), days: t('Days') }[kind];
  return (
    <View style={styles.root} testID="usage-breakdown">
      <SectionHeader
        title={t('Breakdown')}
        action={
          total > TOP && !showAll
            ? {
                title: t('Show All %@ %@', String(total), label),
                onPress: () => setShowAll(true),
              }
            : undefined
        }
      />
      <Segmented
        value={kind}
        onChange={(next) => {
          setKind(next);
          setShowAll(false);
        }}
        options={[
          { value: 'models', label: t('Models') },
          { value: 'directories', label: t('Directories') },
          { value: 'days', label: t('Days') },
        ]}
        testID="usage-breakdown-kind"
      />
      <BreakdownRows
        scope={scope}
        kind={kind}
        metric={metric}
        limit={showAll ? undefined : TOP}
        onDay={onDay}
      />
    </View>
  );
}
