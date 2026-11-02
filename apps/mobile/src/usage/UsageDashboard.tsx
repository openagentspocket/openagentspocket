import type { HostReading, UsageRange, UsageScope } from '@openagentspocket/core';
import type { ReactNode } from 'react';
import type { BreakdownKind } from './BreakdownRows';
import { UsageBreakdownSection } from './UsageBreakdownSection';
import { UsageChartSection } from './UsageChartSection';
import { UsageHostsSection, UsageProgramsSection } from './UsageHostsSection';
import { UsageLimitsStrip } from './UsageLimitsStrip';
import type { UsageMetric } from './usageText';

interface Props {
  scope: UsageScope;
  inScope: readonly HostReading[];
  range: UsageRange;
  metric: UsageMetric;
  now: Date;
  onDay: (date: string) => void;
  onShowAll: (kind: BreakdownKind) => void;
  onDetails: () => void;
  /** The Accounts notice, above the limits strip. */
  notice: ReactNode;
  /** The rows to the limits sheet, the Limits page and the Accounts, last. */
  footer: ReactNode;
}

/** The phone dashboard under its header: limits strip, chart, calendar, Hosts, Programs, Breakdown. */
export function UsageDashboard({
  scope,
  inScope,
  range,
  metric,
  now,
  onDay,
  onShowAll,
  onDetails,
  notice,
  footer,
}: Props) {
  return (
    <>
      {notice}
      <UsageLimitsStrip readings={inScope} now={now} onDetails={onDetails} />
      <UsageChartSection scope={scope} metric={metric} onDay={onDay} />
      <UsageHostsSection scope={scope} metric={metric} />
      <UsageProgramsSection scope={scope} range={range} metric={metric} />
      <UsageBreakdownSection scope={scope} metric={metric} onDay={onDay} onShowAll={onShowAll} />
      {footer}
    </>
  );
}
