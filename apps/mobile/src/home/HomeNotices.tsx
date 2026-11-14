import { DemoModeNotice } from '@/connections/DemoModeNotice';
import type { CrashStorage } from '@/diagnostics/crashRecorder';
import { LastCrashBanner } from '@/diagnostics/LastCrashBanner';
import { HostIssues } from '@/features/hosts/HostIssues';
import { HostScopeNotice } from '@/features/hosts/HostScopeNotice';
import { NotificationPrimer } from '@/notifications/NotificationPrimer';

/** The notices over Home's list: demo mode, Host issues, the scope, the last crash, notifications. */
export function HomeNotices({
  crashStorage,
  focused,
}: {
  crashStorage?: CrashStorage;
  focused: boolean;
}) {
  return (
    <>
      <DemoModeNotice />
      <HostIssues />
      <HostScopeNotice />
      {crashStorage ? <LastCrashBanner storage={crashStorage} /> : null}
      <NotificationPrimer focused={focused} />
    </>
  );
}
