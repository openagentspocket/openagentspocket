import { buildUsageScope } from '@openagentspocket/core';
import { Skeleton } from '@openagentspocket/ui';
import { useLocalSearchParams } from 'expo-router';
import { AppScreen } from '@/navigation/AppScreen';
import { type BreakdownKind, BreakdownRows, breakdownTitle } from './BreakdownRows';
import type { UsageMetric } from './usageText';
import { useUsage } from './useUsage';

const KINDS: readonly BreakdownKind[] = ['models', 'directories', 'days'];
const parseKind = (value: string | undefined): BreakdownKind =>
  KINDS.find((kind) => kind === value) ?? 'models';

interface Props {
  /** Atlas and tests: the kind and Host scope without a route. */
  initial?: { kind?: BreakdownKind; host?: string; metric?: UsageMetric };
}

/**
 * usage.breakdown-list: every row of one breakdown over the last 30 days, pushed by Show All and
 * by the day sheet's links. `?kind=models|directories|days&host=<id>` picks what it lists.
 */
export function UsageBreakdownListScreen({ initial }: Props) {
  const params = useLocalSearchParams<{ kind?: string; host?: string; metric?: string }>();
  const kind = initial?.kind ?? parseKind(params.kind);
  const host = initial?.host ?? params.host;
  const metric: UsageMetric = (initial?.metric ?? params.metric) === 'tokens' ? 'tokens' : 'cost';
  const { readings } = useUsage();
  const scoped = host ? (readings ?? []).filter((reading) => reading.id === host) : readings;
  return (
    <AppScreen
      header={{ variant: 'native', title: breakdownTitle(kind) }}
      testID="usage-breakdown-list"
    >
      {scoped === null ? (
        <Skeleton />
      ) : (
        <BreakdownRows scope={buildUsageScope(scoped)} kind={kind} metric={metric} />
      )}
    </AppScreen>
  );
}
