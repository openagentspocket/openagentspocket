import { t } from '@openagentspocket/i18n';
import { Banner } from '@openagentspocket/ui';
import { useConsole } from '@/console/hooks';
import { useHostScope } from '@/console/useHostScope';

/**
 * Says a list is scoped to one Host, with the way back to all of them. The choice is kept across
 * launches and shared by Home, Agents and Terminals, so a list must never look short without
 * saying why.
 */
export function HostScopeNotice() {
  const scope = useHostScope();
  const rows = useConsole();
  const { hostId } = scope;
  if (hostId === undefined) return null;
  const empty = !rows.some((row) => row.hostId === hostId);
  return (
    <Banner
      look="row"
      tone="info"
      icon="filter"
      title={t('Showing only %@', scope.label)}
      message={empty ? t('This Host has no Agents right now.') : undefined}
      actionLabel={t('Show All Hosts')}
      onAction={() => scope.setHostId(undefined)}
      testID="host-scope-notice"
    />
  );
}
