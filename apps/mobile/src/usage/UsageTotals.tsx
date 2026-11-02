import {
  formatShare,
  formatTokens,
  programDisplayName,
  scopeAccounts,
  scopeTotal,
  type UsageRange,
  type UsageScope,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Card, ListRow, ProgramMark, Section, Text } from '@openagentspocket/ui';
import { localeTag, metricText, metricValue, type UsageMetric } from './usageText';

interface Props {
  scope: UsageScope;
  range: UsageRange;
  metric: UsageMetric;
}

/** The headline figure for the range, then each program's part, with a Claude Code Account split. */
export function UsageTotals({ scope, range, metric }: Props) {
  const total = scopeTotal(scope, range);
  const whole = metricValue(total, metric);
  return (
    <>
      <Card testID="usage-total">
        <Text variant="footnote" tone="secondary">
          {metric === 'cost' ? t('Estimated API cost') : t('Token Usage')}
        </Text>
        <Text variant="title" testID="usage-total-figure">
          {metricText(total, metric)}
        </Text>
        {metric === 'cost' && total.unpricedTokens > 0 ? (
          <Text variant="footnote" tone="warning" testID="usage-unpriced">
            {t('Includes unpriced tokens (%@)', formatTokens(total.unpricedTokens, localeTag()))}
          </Text>
        ) : null}
        {metric === 'cost' ? (
          <Text variant="footnote" tone="tertiary">
            {t('Estimated API cost is based on recorded Token Usage, not your subscription bill.')}
          </Text>
        ) : null}
      </Card>
      <Section grouped title={t('Token Usage')}>
        {scope.programs.flatMap((program) => {
          const summary = program.totals[range];
          const rows = [
            <ListRow
              key={program.program}
              title={programDisplayName(program.program)}
              subtitle={formatShare(metricValue(summary, metric), whole, localeTag())}
              leading={<ProgramMark program={programDisplayName(program.program)} />}
              value={metricText(summary, metric)}
              testID={`program-${program.program}`}
            />,
          ];
          for (const account of scopeAccounts(scope, program.program, range)) {
            rows.push(
              <ListRow
                key={`${program.program}.${account.id}`}
                title={account.name}
                value={account.summary ? metricText(account.summary, metric) : t('Unknown')}
                testID={`account-usage-${account.id}`}
              />,
            );
          }
          return rows;
        })}
      </Section>
    </>
  );
}
