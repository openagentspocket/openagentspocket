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
import { Card, Icon, makeStyles, programTint, Text, useTheme } from '@openagentspocket/ui';
import { Pressable, View } from 'react-native';
import { localeTag, metricText, metricValue, type UsageMetric } from './usageText';

export type BreakdownKind = 'models' | 'directories' | 'days';

const ROW_PREFIX = { models: 'model', directories: 'directory', days: 'day' } as const;

/** The days a Days breakdown lists. */
const DAYS = 30;

const useStyles = makeStyles((th) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.spacing.sm,
    minHeight: 56,
    paddingVertical: th.spacing.xs,
    paddingHorizontal: th.spacing.md,
  },
  pressed: { backgroundColor: th.colors.surfaceRaised },
  dot: { width: 8, height: 8, borderRadius: 4 },
  titles: { flex: 1, minWidth: 0, gap: 2 },
  amounts: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  separator: { height: th.metrics.hairlineWidth, backgroundColor: th.hairline, marginLeft: 18 },
  empty: { minHeight: 56, justifyContent: 'center', paddingHorizontal: th.spacing.md },
  showAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: th.spacing.md,
  },
}));

interface Entry {
  key: string;
  title: string;
  /** Directories: the full path, set in monospace. */
  subtitle?: string;
  /** The Host a directory is on, when the scope has several. */
  host?: string;
  summary: Summary;
  priced: boolean;
  program?: string;
  date?: string;
}

const lastComponent = (path: string): string => path.split('/').filter(Boolean).at(-1) ?? path;

/** Every row of one breakdown: models and directories by tokens, days newest first. */
export function breakdownEntries(scope: UsageScope, kind: BreakdownKind): Entry[] {
  const locale = localeTag();
  if (kind === 'days') {
    return scopeDates(scope)
      .slice(-DAYS)
      .reverse()
      .map((date) => ({
        key: date,
        date,
        title: formatDay(date, locale),
        summary: scopeDay(scope, date),
        priced: true,
      }));
  }
  const entries: Entry[] =
    kind === 'models'
      ? scope.programs.flatMap((p) =>
          p.models.map((model) => ({
            key: `${p.program}\0${model.model}`,
            title: model.model,
            summary: model,
            priced: model.priced,
            program: p.program,
          })),
        )
      : scope.programs.flatMap((p) =>
          p.directories.map(({ hostName, directory }) => ({
            key: `${p.program}\0${hostName}\0${directory.path}`,
            title: lastComponent(directory.path),
            subtitle: directory.path,
            host: scope.included.length > 1 ? hostName : undefined,
            summary: directory,
            priced: (directory.unpricedTokens ?? 0) === 0,
            program: p.program,
          })),
        );
  return entries.sort((a, b) => b.summary.tokens.total - a.summary.tokens.total);
}

/** "Show All 12 Models": the row that pushes the whole list. */
export function showAllTitle(kind: BreakdownKind, count: number): string {
  const total = String(count);
  return {
    models: t('Show All %@ Models', total),
    directories: t('Show All %@ Directories', total),
    days: t('Show All %@ Days', total),
  }[kind];
}

/** "Models · Last 30 days": the pushed list's title. */
export const breakdownTitle = (kind: BreakdownKind): string =>
  t(
    '%@ · Last 30 days',
    { models: t('Models'), directories: t('Directories'), days: t('Days') }[kind],
  );

interface RowsProps {
  scope: UsageScope;
  kind: BreakdownKind;
  metric: UsageMetric;
  /** Rows before the Show All row; every row when omitted. */
  limit?: number;
  onDay?: (date: string) => void;
  onShowAll?: () => void;
}

/**
 * The rows of one breakdown in a card: dot, name (path under it), then the figure with its share
 * and tokens right-aligned beneath it, as Swift's AgentUsageBreakdown draws them.
 */
export function BreakdownRows({ scope, kind, metric, limit, onDay, onShowAll }: RowsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = localeTag();
  const all = breakdownEntries(scope, kind);
  const whole = all.reduce((sum, e) => sum + metricValue(e.summary, metric), 0);
  const rows = limit ? all.slice(0, limit) : all;
  const more = limit !== undefined && all.length > limit && onShowAll !== undefined;
  return (
    <Card padded={false} testID={`usage-breakdown-${kind}`}>
      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="subheadline" tone="secondary">
            {t('Nothing recorded in the last 30 days.')}
          </Text>
        </View>
      ) : null}
      {rows.map((entry, index) => {
        const share = formatShare(metricValue(entry.summary, metric), whole, locale);
        const second =
          metric === 'cost'
            ? t('%@ tokens', formatTokens(entry.summary.tokens.total, locale))
            : metricText(entry.summary, 'cost');
        const date = entry.date;
        const press = date !== undefined && onDay ? () => onDay(date) : undefined;
        return (
          <View key={entry.key}>
            {index > 0 ? <View style={styles.separator} /> : null}
            <Pressable
              onPress={press}
              disabled={!press}
              accessibilityRole={press ? 'button' : undefined}
              style={({ pressed }) => [styles.row, pressed && press ? styles.pressed : null]}
              testID={`${ROW_PREFIX[kind]}-${entry.date ?? entry.title}`}
            >
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: entry.program
                      ? programTint(programIdentity(entry.program).brand, theme)
                      : 'transparent',
                  },
                ]}
              />
              <View style={styles.titles}>
                <Text variant="subheadline" semibold numberOfLines={1} ellipsizeMode="middle">
                  {entry.title}
                </Text>
                {entry.subtitle ? (
                  <Text
                    variant="caption"
                    tone="secondary"
                    monospaced
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {entry.host ? `${entry.host} · ${entry.subtitle}` : entry.subtitle}
                  </Text>
                ) : null}
              </View>
              <View style={styles.amounts} testID={`${ROW_PREFIX[kind]}-amount-${entry.key}`}>
                <Text variant="subheadline" semibold tabularNums>
                  {metricText(entry.summary, metric)}
                </Text>
                <Text variant="caption" tone="secondary" tabularNums>
                  {`${share} · ${second}`}
                </Text>
                {entry.priced ? null : (
                  <Text variant="caption" tone="secondary">
                    {t('Includes unpriced tokens')}
                  </Text>
                )}
              </View>
            </Pressable>
          </View>
        );
      })}
      {more ? (
        <View>
          <View style={styles.separator} />
          <Pressable
            onPress={onShowAll}
            accessibilityRole="button"
            style={styles.showAll}
            testID="usage-breakdown-show-all"
          >
            <Text variant="subheadline" tone="accent">
              {showAllTitle(kind, all.length)}
            </Text>
            <Icon name="chevronRight" size={12} color="textTertiary" />
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}
