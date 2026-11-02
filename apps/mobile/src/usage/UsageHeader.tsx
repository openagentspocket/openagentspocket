import {
  formatCost,
  formatTokens,
  type HostReading,
  scopeTotal,
  USAGE_RANGES,
  type UsageRange,
  type UsageScope,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { ActionMenu, type MenuAnchor, makeStyles, UsageTotals } from '@openagentspocket/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { localeTag, metricText, metricTitle, type UsageMetric, updatedText } from './usageText';

const RANGE_TITLE = {
  today: () => t('Today'),
  last7Days: () => t('7 Days'),
  last30Days: () => t('30 Days'),
} as const satisfies Record<UsageRange, () => string>;

const RANGE_CAPTION = {
  today: () => t('Today'),
  last7Days: () => t('Last 7 days'),
  last30Days: () => t('Last 30 days'),
} as const satisfies Record<UsageRange, () => string>;

const useStyles = makeStyles((th) => ({
  root: { gap: th.spacing.xs },
}));

interface Props {
  readings: readonly HostReading[];
  scope: UsageScope;
  /** null is All Hosts. */
  host: string | null;
  onHost: (host: string | null) => void;
  range: UsageRange;
  onRange: (range: UsageRange) => void;
  metric: UsageMetric;
  onMetric: (metric: UsageMetric) => void;
  now: Date;
  refreshing: boolean;
  initialMenu?: boolean;
}

/** The dashboard head: scope menu, "Updated 01:12", Est. Cost | Tokens, Today / 7 / 30 Days, the hero figure. */
export function UsageHeader({
  readings,
  scope,
  host,
  onHost,
  range,
  onRange,
  metric,
  onMetric,
  now,
  refreshing,
  initialMenu,
}: Props) {
  const styles = useStyles();
  const [menu, setMenu] = useState<{ anchor?: MenuAnchor } | null>(
    initialMenu ? { anchor: { x: 200, y: 280, width: 120, height: 32 } } : null,
  );
  const locale = localeTag();
  const total = scopeTotal(scope, range);
  const hostCount = String(scope.included.length);
  const named = readings.find((r) => r.id === host);
  const scopeLabel = named ? named.name : t('All Hosts');
  const tokens = formatTokens(total.tokens.total, locale);
  const hostsText =
    scope.included.length === 1
      ? t('%@ tokens on this Host', tokens)
      : t('%@ tokens on these %@ Hosts', tokens, hostCount);
  const updated = updatedText(refreshing, now);
  const items = [
    {
      key: 'all',
      title: t('All Hosts'),
      checked: host === null,
      onPress: () => onHost(null),
    },
    ...readings.map((reading) => {
      const included = scope.included.find((h) => h.id === reading.id);
      return {
        key: reading.id,
        title: reading.name,
        subtitle: included
          ? t('%@ est. · 30 days', formatCost(included.last30Days.estimatedCostUSD ?? 0, locale))
          : undefined,
        icon: 'server' as const,
        checked: host === reading.id,
        onPress: () => onHost(reading.id),
      };
    }),
  ];
  return (
    <View style={styles.root}>
      <UsageTotals
        metric={{
          value: metric,
          onChange: onMetric,
          options: (['cost', 'tokens'] as const).map((value) => ({
            value,
            label: metricTitle(value),
          })),
        }}
        range={{
          value: range,
          onChange: onRange,
          options: USAGE_RANGES.map((value) => ({ value, label: RANGE_TITLE[value]() })),
        }}
        scope={
          readings.length > 1
            ? { label: scopeLabel, onPress: (anchor) => setMenu({ anchor }) }
            : undefined
        }
        status={updated}
        caption={`${metric === 'cost' ? t('Estimated API cost') : t('Token Usage')} · ${RANGE_CAPTION[range]()}`}
        total={metricText(total, metric)}
        tokens={metric === 'cost' ? hostsText : t('%@ est.', metricText(total, 'cost'))}
      />
      <ActionMenu
        visible={menu !== null}
        anchor={menu?.anchor}
        items={items}
        onClose={() => setMenu(null)}
        testID="usage-scope-menu"
      />
    </View>
  );
}
