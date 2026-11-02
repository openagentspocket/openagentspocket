import { type HostReading, USAGE_RANGES, type UsageRange } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Chip, ChipRow } from '@openagentspocket/ui';
import { metricTitle, type UsageMetric } from './usageText';

const RANGE_TITLE = {
  today: () => t('Today'),
  last7Days: () => t('7 Days'),
  last30Days: () => t('30 Days'),
} as const satisfies Record<UsageRange, () => string>;

const METRICS: readonly UsageMetric[] = ['cost', 'tokens'];

interface Props {
  readings: readonly HostReading[];
  /** null is All Hosts. */
  host: string | null;
  onHost: (host: string | null) => void;
  range: UsageRange;
  onRange: (range: UsageRange) => void;
  metric: UsageMetric;
  onMetric: (metric: UsageMetric) => void;
}

/** usage.scope-menu plus the range and metric pickers, as filter chips. */
export function UsageControls({ readings, host, onHost, range, onRange, metric, onMetric }: Props) {
  return (
    <>
      {readings.length > 1 ? (
        <ChipRow>
          <Chip
            label={t('All Hosts')}
            mono={false}
            selected={host === null}
            onPress={() => onHost(null)}
            testID="scope-all"
          />
          {readings.map((reading) => (
            <Chip
              key={reading.id}
              label={reading.name}
              mono={false}
              selected={host === reading.id}
              onPress={() => onHost(reading.id)}
              testID={`scope-${reading.id}`}
            />
          ))}
        </ChipRow>
      ) : null}
      <ChipRow>
        {USAGE_RANGES.map((value) => (
          <Chip
            key={value}
            label={RANGE_TITLE[value]()}
            mono={false}
            selected={range === value}
            onPress={() => onRange(value)}
            testID={`range-${value}`}
          />
        ))}
        {METRICS.map((value) => (
          <Chip
            key={value}
            label={metricTitle(value)}
            mono={false}
            selected={metric === value}
            onPress={() => onMetric(value)}
            testID={`metric-${value}`}
          />
        ))}
      </ChipRow>
    </>
  );
}
