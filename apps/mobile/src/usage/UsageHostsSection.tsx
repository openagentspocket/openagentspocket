import {
  formatShare,
  formatTokens,
  programDisplayName,
  programIdentity,
  type Summary,
  scopeAccounts,
  type UsageRange,
  type UsageScope,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  Card,
  ListRow,
  makeStyles,
  programTint,
  SectionHeader,
  UsageBreakdownRow,
  UsageHostGroup,
  useTheme,
} from '@openagentspocket/ui';
import { View } from 'react-native';
import { programSplit } from './usageModel';
import { localeTag, metricText, metricValue, type UsageMetric } from './usageText';

const useStyles = makeStyles((th) => ({
  root: { gap: th.spacing.xs },
  programs: { gap: th.spacing.md },
}));

interface Props {
  scope: UsageScope;
  range: UsageRange;
  metric: UsageMetric;
}

const withTokens = (summary: Summary, metric: UsageMetric): [string, string] => [
  metric === 'cost' ? metricText(summary, 'cost') : formatTokens(summary.tokens.total, localeTag()),
  t('%@ tokens', formatTokens(summary.tokens.total, localeTag())),
];

/** "Hosts" (cost, share and tokens per Host) and "Programs" (split bar per program, Accounts under). */
export function UsageHostsSection({ scope, range, metric }: Props) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = localeTag();
  const whole = scope.included.reduce((sum, h) => sum + metricValue(h.last30Days, metric), 0);
  const labels = [t('Input'), t('Cache read'), t('Cache write'), t('Output')] as const;
  return (
    <>
      {scope.included.length > 1 ? (
        <View style={styles.root}>
          <SectionHeader title={t('Hosts')} />
          <UsageHostGroup>
            {scope.included.map((host) => {
              const [cost, tokens] = withTokens(host.last30Days, metric);
              return (
                <UsageBreakdownRow
                  key={host.id}
                  grouped
                  variant="host"
                  title={host.name}
                  subtitle={`${formatShare(metricValue(host.last30Days, metric), whole, locale)} · ${t('Last 30 days')}`}
                  cost={cost}
                  tokens={tokens}
                  testID={`host-${host.id}`}
                />
              );
            })}
          </UsageHostGroup>
        </View>
      ) : null}
      <View style={styles.root}>
        <SectionHeader title={t('Programs')} />
        <Card testID="usage-programs">
          <View style={styles.programs}>
            {scope.programs.map((program) => {
              const summary = program.totals[range];
              const [cost, tokens] = withTokens(summary, metric);
              return (
                <View key={program.program}>
                  <UsageBreakdownRow
                    title={programDisplayName(program.program)}
                    dotColor={programTint(programIdentity(program.program).brand, theme)}
                    cost={cost}
                    tokens={tokens}
                    split={programSplit(program)}
                    splitLabels={labels}
                    testID={`program-${program.program}`}
                  />
                  {scopeAccounts(scope, program.program, range).map((account) => (
                    <ListRow
                      key={account.id}
                      title={account.name}
                      value={account.summary ? metricText(account.summary, metric) : t('Unknown')}
                      testID={`account-usage-${account.id}`}
                    />
                  ))}
                </View>
              );
            })}
          </View>
        </Card>
      </View>
    </>
  );
}
