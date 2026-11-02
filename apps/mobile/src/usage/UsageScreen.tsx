import {
  type AccountFileStore,
  buildUsageScope,
  claudeProgram,
  scopeIsEmpty,
  type UsageRange,
  type UsageSource,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { EmptyState, ListRow, Screen, Section, Skeleton, Text } from '@openagentspocket/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { AccountsSheet } from './AccountsSheet';
import { BreakdownList } from './BreakdownList';
import { DailyChart } from './DailyChart';
import { DaySheet } from './DaySheet';
import { QuickSheet } from './QuickSheet';
import { UsageControls } from './UsageControls';
import { UsageNotices } from './UsageNotices';
import { useAccountFiles } from './UsageSourceProvider';
import { UsageTotals } from './UsageTotals';
import type { UsageMetric } from './usageText';
import { useUsage } from './useUsage';

interface Props {
  source?: UsageSource;
  files?: AccountFileStore;
}

/** usage.tab: totals, daily chart, breakdown and notices for All Hosts or one Host. */
export function UsageScreen({ source, files: explicitFiles }: Props) {
  const providedFiles = useAccountFiles();
  const files = explicitFiles ?? providedFiles;
  const router = useRouter();
  const { readings, now, refreshing, refresh } = useUsage(source);
  const [host, setHost] = useState<string | null>(null);
  const [range, setRange] = useState<UsageRange>('last7Days');
  const [metric, setMetric] = useState<UsageMetric>('cost');
  const [day, setDay] = useState<string | null>(null);
  const [quick, setQuick] = useState(false);
  const [accounts, setAccounts] = useState(false);

  const all = readings ?? [];
  const scope = buildUsageScope(host ? all.filter((r) => r.id === host) : all);
  const withAccounts = scope.included.find((h) => claudeProgram(h.report)?.accounts != null);
  return (
    <Screen refreshing={refreshing} onRefresh={refresh} testID="usage-screen">
      <Text variant="title">{t('Usage')}</Text>
      {readings === null ? <Skeleton /> : null}
      {readings?.length === 0 ? (
        <EmptyState title={t('No Hosts')} message={t('Add a Host to read its Usage.')} />
      ) : null}
      {readings && readings.length > 0 ? (
        <>
          <UsageControls
            readings={all}
            host={host}
            onHost={setHost}
            range={range}
            onRange={setRange}
            metric={metric}
            onMetric={setMetric}
          />
          {scopeIsEmpty(scope) ? (
            <EmptyState
              title={t('No Host in this scope can report Usage right now.')}
              layout="compact"
            />
          ) : (
            <>
              <UsageTotals scope={scope} range={range} metric={metric} />
              <DailyChart scope={scope} range={range} metric={metric} onDay={setDay} />
              <BreakdownList scope={scope} metric={metric} />
              <Section grouped>
                <ListRow
                  title={t('Usage Limits')}
                  chevron
                  onPress={() => setQuick(true)}
                  testID="open-limits-sheet"
                />
                <ListRow
                  title={t('Limits')}
                  subtitle={t('Account windows as each service reports them')}
                  chevron
                  onPress={() => router.push('/usage-limits')}
                  testID="open-limits-page"
                />
                {withAccounts ? (
                  <ListRow
                    title={t('Claude Code Accounts')}
                    chevron
                    onPress={() => setAccounts(true)}
                    testID="open-accounts"
                  />
                ) : null}
              </Section>
            </>
          )}
          <UsageNotices scope={scope} />
        </>
      ) : null}
      <DaySheet date={day} onClose={() => setDay(null)} scope={scope} metric={metric} />
      <QuickSheet
        visible={quick}
        onClose={() => setQuick(false)}
        readings={all}
        now={now}
        onOpenFull={() => setQuick(false)}
      />
      {withAccounts ? (
        <AccountsSheet
          visible={accounts}
          onClose={() => setAccounts(false)}
          hostId={withAccounts.id}
          hostName={withAccounts.name}
          report={withAccounts.report}
          store={files}
        />
      ) : null}
    </Screen>
  );
}
