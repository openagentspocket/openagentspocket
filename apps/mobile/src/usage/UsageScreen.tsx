import {
  type AccountFileStore,
  buildUsageScope,
  claudeProgram,
  scopeDates,
  scopeIsEmpty,
  type UsageRange,
  type UsageSource,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { EmptyState, ListRow, Screen, Section, Skeleton } from '@openagentspocket/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { AccountsSheet } from './AccountsSheet';
import { DaySheet } from './DaySheet';
import { QuickSheet } from './QuickSheet';
import { UsageBreakdownSection } from './UsageBreakdownSection';
import { UsageChartSection } from './UsageChartSection';
import { UsageHeader } from './UsageHeader';
import { UsageHostsSection } from './UsageHostsSection';
import { UsageLimitsStrip } from './UsageLimitsStrip';
import { UsageNotices } from './UsageNotices';
import { useAccountFiles } from './UsageSourceProvider';
import type { UsageMetric } from './usageText';
import { useUsage } from './useUsage';

interface Props {
  source?: UsageSource;
  files?: AccountFileStore;
  /** Atlas and tests: open a sheet on mount. */
  initial?: { quick?: boolean; accounts?: boolean; menu?: boolean; host?: string; day?: 'latest' };
}

/** usage.tab: scope header, hero figure, limits strip, chart, calendar, Hosts, Programs, Breakdown. */
export function UsageScreen({ source, files: explicitFiles, initial }: Props) {
  const providedFiles = useAccountFiles();
  const files = explicitFiles ?? providedFiles;
  const router = useRouter();
  const { readings, now, refreshing, refresh } = useUsage(source);
  const [host, setHost] = useState<string | null>(initial?.host ?? null);
  const [range, setRange] = useState<UsageRange>('last30Days');
  const [metric, setMetric] = useState<UsageMetric>('cost');
  const [day, setDay] = useState<string | null>(null);
  const [quick, setQuick] = useState(initial?.quick ?? false);
  const [accounts, setAccounts] = useState(initial?.accounts ?? false);

  const all = readings ?? [];
  const inScope = host ? all.filter((r) => r.id === host) : all;
  const scope = buildUsageScope(inScope);
  const latest = initial?.day === 'latest' && day === null ? scopeDates(scope).at(-1) : undefined;
  const withAccounts = scope.included.find((h) => claudeProgram(h.report)?.accounts != null);
  const openLimits = () => router.push('/usage-limits');
  return (
    <Screen refreshing={refreshing} onRefresh={refresh} testID="usage-screen">
      {readings === null ? <Skeleton /> : null}
      {readings?.length === 0 ? (
        <EmptyState title={t('No Hosts')} message={t('Add a Host to read its Usage.')} />
      ) : null}
      {readings && readings.length > 0 ? (
        <>
          <UsageHeader
            readings={all}
            scope={scope}
            host={host}
            onHost={setHost}
            range={range}
            onRange={setRange}
            metric={metric}
            onMetric={setMetric}
            now={now}
            refreshing={refreshing}
            initialMenu={initial?.menu}
          />
          {scopeIsEmpty(scope) ? (
            <EmptyState
              title={t('No Host in this scope can report Usage right now.')}
              layout="compact"
            />
          ) : (
            <>
              <UsageLimitsStrip readings={inScope} now={now} onDetails={openLimits} />
              <UsageChartSection scope={scope} metric={metric} onDay={setDay} />
              <UsageHostsSection scope={scope} range={range} metric={metric} />
              <UsageBreakdownSection scope={scope} metric={metric} onDay={setDay} />
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
                  onPress={openLimits}
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
          <UsageNotices scope={scope} range={range} metric={metric} />
        </>
      ) : null}
      <DaySheet
        date={day ?? latest ?? null}
        onDate={setDay}
        onClose={() => setDay(null)}
        scope={scope}
        metric={metric}
      />
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
