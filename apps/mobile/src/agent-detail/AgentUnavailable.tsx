import { t } from '@openagentspocket/i18n';
import { EmptyState, Text } from '@openagentspocket/ui';
import { AppScreen } from '@/navigation/AppScreen';

/**
 * An Agent the console does not list: gone once its Host's fresh snapshot lacks it, otherwise
 * nothing is known yet (the Host is still reconnecting), which must never read as gone.
 */
export function AgentUnavailable({ gone }: { gone: boolean }) {
  return (
    <AppScreen scroll={false} testID={gone ? 'agent-gone' : 'agent-loading'}>
      {gone ? (
        <EmptyState icon="info" title={t('Agent Gone')} />
      ) : (
        <EmptyState icon="wifi" title={t('Reconnecting…')} />
      )}
    </AppScreen>
  );
}

/** The listed Agent is from an earlier snapshot: its Host is reconnecting. */
export function ReconnectingHint() {
  return (
    <Text
      variant="footnote"
      tone="warning"
      style={{ textAlign: 'center' }}
      testID="agent-reconnecting"
    >
      {t('Reconnecting…')}
    </Text>
  );
}
