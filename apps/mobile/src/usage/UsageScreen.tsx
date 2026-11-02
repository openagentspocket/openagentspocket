import {
  buildUsageScope,
  claudeProgram,
  scopeDates,
  type UsageRange,
} from '@openagentspocket/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import type { BreakdownKind } from './BreakdownRows';
import { accountsNoticeTitle, UsageAccountsNotice } from './UsageAccountsNotice';
import { UsageLimitsRows } from './UsageLimitsRows';
import { UsagePhoneScreen } from './UsagePhoneScreen';
import type { UsageScreenProps } from './UsageScreenProps';
import { UsageSheets } from './UsageSheets';
import { useAccountFiles } from './UsageSourceProvider';
import { UsageWideScreen, WIDE_WINDOW } from './UsageWide';
import type { UsageMetric } from './usageText';
import { useClaudeLimits } from './useClaudeLimits';
import { useUsage } from './useUsage';

/**
 * usage.tab: scope header, hero figure, limits strip, chart, calendar, Hosts, Programs, Breakdown.
 * On a wide window (usage.ipad-split) a Host column sits beside the two-column dashboard.
 */
export function UsageScreen({
  source,
  files: explicitFiles,
  initial,
  wide: forceWide,
}: UsageScreenProps) {
  const { width } = useWindowDimensions();
  const wide = forceWide ?? width >= WIDE_WINDOW;
  const providedFiles = useAccountFiles();
  const files = explicitFiles ?? providedFiles;
  const router = useRouter();
  const { readings, now, refreshing, refresh, source: used } = useUsage(source);
  const limits = useClaudeLimits(used, !initial?.limitsOff);
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
  const showAll = (kind: BreakdownKind) =>
    router.push({
      pathname: '/usage-breakdown',
      params: { kind, metric, ...(host ? { host } : {}) },
    });
  const noticeTitle = accountsNoticeTitle(inScope);
  const notice = noticeTitle ? (
    <UsageAccountsNotice title={noticeTitle} onPress={() => setAccounts(true)} />
  ) : null;
  const limitsRows = (
    <UsageLimitsRows
      onQuick={() => setQuick(true)}
      onLimits={openLimits}
      onAccounts={withAccounts ? () => setAccounts(true) : undefined}
    />
  );
  const sheets = (
    <UsageSheets
      scope={scope}
      metric={metric}
      readings={all}
      now={now}
      limits={limits}
      day={day ?? latest ?? null}
      onDay={setDay}
      // The day sheet's links close it, then push the list.
      onBreakdown={(kind) => {
        setDay(null);
        showAll(kind);
      }}
      quick={quick}
      onQuick={setQuick}
      accounts={accounts}
      onAccounts={setAccounts}
      accountsHost={withAccounts}
      files={files}
      initialRename={initial?.rename}
      initialRemove={initial?.remove}
    />
  );
  if (wide && readings && readings.length > 0) {
    return (
      <UsageWideScreen
        all={buildUsageScope(all)}
        host={host}
        onHost={setHost}
        refreshing={refreshing}
        scope={scope}
        inScope={inScope}
        range={range}
        onRange={setRange}
        metric={metric}
        onMetric={setMetric}
        now={now}
        onDay={setDay}
        onShowAll={showAll}
        onDetails={openLimits}
        footer={
          <>
            {notice}
            {limitsRows}
          </>
        }
        sheets={sheets}
      />
    );
  }
  return (
    <UsagePhoneScreen
      readings={readings}
      scope={scope}
      inScope={inScope}
      host={host}
      onHost={setHost}
      range={range}
      onRange={setRange}
      metric={metric}
      onMetric={setMetric}
      now={now}
      refreshing={refreshing}
      onRefresh={refresh}
      initialMenu={initial?.menu}
      onDay={setDay}
      onShowAll={showAll}
      onDetails={openLimits}
      notice={notice}
      footer={limitsRows}
      sheets={sheets}
    />
  );
}
