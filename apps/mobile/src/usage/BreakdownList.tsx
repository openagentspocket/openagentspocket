import type { UsageScope } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { ListRow, Section } from '@openagentspocket/ui';
import { metricText, type UsageMetric } from './usageText';

/** Rows listed per breakdown. */
const TOP = 5;

interface Props {
  scope: UsageScope;
  metric: UsageMetric;
}

/** usage.breakdown-list: the busiest models and directories over the last 30 days. */
export function BreakdownList({ scope, metric }: Props) {
  const models = scope.programs.flatMap((p) => p.models).slice(0, TOP);
  const directories = scope.programs.flatMap((p) => p.directories).slice(0, TOP);
  return (
    <>
      {models.length > 0 ? (
        <Section grouped title={t('Models')} footer={t('Last 30 days')}>
          {models.map((model) => (
            <ListRow
              key={model.model}
              title={model.model}
              subtitle={model.priced ? undefined : t('Unpriced')}
              value={metricText(model, metric)}
              testID={`model-${model.model}`}
            />
          ))}
        </Section>
      ) : null}
      {directories.length > 0 ? (
        <Section grouped title={t('Directories')} footer={t('Last 30 days')}>
          {directories.map(({ hostName, directory }) => (
            <ListRow
              key={`${hostName}\0${directory.path}`}
              title={directory.path}
              subtitle={scope.included.length > 1 ? hostName : undefined}
              value={metricText(directory, metric)}
              testID={`directory-${directory.path}`}
            />
          ))}
        </Section>
      ) : null}
    </>
  );
}
