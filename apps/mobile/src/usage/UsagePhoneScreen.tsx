import type { HostReading, UsageRange, UsageScope } from '@openagentspocket/core';
import { scopeIsEmpty } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { EmptyState, Skeleton } from '@openagentspocket/ui';
import type { ReactNode } from 'react';
import { AppScreen } from '@/navigation/AppScreen';
import type { BreakdownKind } from './BreakdownRows';
import { UsageDashboard } from './UsageDashboard';
import { UsageHeader } from './UsageHeader';
import { UsageNotices } from './UsageNotices';
import type { UsageMetric } from './usageText';

interface Props {
  /** null while the first reading is on its way. */
  readings: HostReading[] | null;
  scope: UsageScope;
  inScope: readonly HostReading[];
  host: string | null;
  onHost: (host: string | null) => void;
  range: UsageRange;
  onRange: (range: UsageRange) => void;
  metric: UsageMetric;
  onMetric: (metric: UsageMetric) => void;
  now: Date;
  refreshing: boolean;
  onRefresh: () => void;
  initialMenu?: boolean;
  onDay: (date: string) => void;
  onShowAll: (kind: BreakdownKind) => void;
  onDetails: () => void;
  notice: ReactNode;
  footer: ReactNode;
  sheets: ReactNode;
}

/** The phone Usage screen: scope header and hero, then the dashboard, notices and the sheets. */
export function UsagePhoneScreen(props: Props) {
  const { readings, scope, inScope, host, range, metric, now, refreshing } = props;
  return (
    <AppScreen
      header={{ variant: 'native', title: t('Usage') }}
      refreshing={refreshing}
      onRefresh={props.onRefresh}
      testID="usage-screen"
    >
      {readings === null ? <Skeleton /> : null}
      {readings?.length === 0 ? (
        <EmptyState title={t('No Hosts')} message={t('Add a Host to read its Usage.')} />
      ) : null}
      {readings && readings.length > 0 ? (
        <>
          <UsageHeader
            readings={readings}
            scope={scope}
            host={host}
            onHost={props.onHost}
            range={range}
            onRange={props.onRange}
            metric={metric}
            onMetric={props.onMetric}
            now={now}
            refreshing={refreshing}
            initialMenu={props.initialMenu}
          />
          {scopeIsEmpty(scope) ? (
            <EmptyState
              title={t('No Host in this scope can report Usage right now.')}
              layout="compact"
            />
          ) : (
            <UsageDashboard
              scope={scope}
              inScope={inScope}
              range={range}
              metric={metric}
              now={now}
              onDay={props.onDay}
              onShowAll={props.onShowAll}
              onDetails={props.onDetails}
              notice={props.notice}
              footer={props.footer}
            />
          )}
          <UsageNotices scope={scope} range={range} metric={metric} />
        </>
      ) : null}
      {props.sheets}
    </AppScreen>
  );
}
