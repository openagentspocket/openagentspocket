import type {
  AccountFileStore,
  HostReading,
  IncludedHost,
  UsageScope,
} from '@openagentspocket/core';
import { AccountsSheet } from './AccountsSheet';
import type { BreakdownKind } from './BreakdownRows';
import { DaySheet } from './DaySheet';
import { QuickSheet } from './QuickSheet';
import type { UsageMetric } from './usageText';
import type { ClaudeLimits } from './useClaudeLimits';

interface Props {
  scope: UsageScope;
  metric: UsageMetric;
  /** Every Host's reading: the quick sheet lists them all. */
  readings: readonly HostReading[];
  now: Date;
  limits: ClaudeLimits;
  /** The report day the day sheet shows, or null while closed. */
  day: string | null;
  onDay: (date: string | null) => void;
  onDayDismissed: () => void;
  onBreakdown: (kind: BreakdownKind) => void;
  quick: boolean;
  onQuick: (open: boolean) => void;
  accounts: boolean;
  onAccounts: (open: boolean) => void;
  /** The Host whose Claude Code Accounts the sheet edits, when one in scope has them. */
  accountsHost?: IncludedHost;
  files: AccountFileStore;
  initialRename?: string;
  initialRemove?: string;
}

/** The sheets over the Usage dashboard: a day, the quick limits, and the Claude Code Accounts. */
export function UsageSheets(props: Props) {
  const { scope, metric, limits, accountsHost: host } = props;
  return (
    <>
      <DaySheet
        date={props.day}
        onDate={props.onDay}
        onClose={() => props.onDay(null)}
        onDismissed={props.onDayDismissed}
        scope={scope}
        metric={metric}
        onBreakdown={props.onBreakdown}
      />
      <QuickSheet
        visible={props.quick}
        onClose={() => props.onQuick(false)}
        readings={limits.apply(props.readings)}
        now={props.now}
        onOpenFull={() => props.onQuick(false)}
        onClaudeLimits={limits.set}
      />
      {host ? (
        <AccountsSheet
          visible={props.accounts}
          onClose={() => props.onAccounts(false)}
          hostId={host.id}
          hostName={host.name}
          report={host.report}
          store={props.files}
          initialRename={props.initialRename}
          initialRemove={props.initialRemove}
        />
      ) : null}
    </>
  );
}
