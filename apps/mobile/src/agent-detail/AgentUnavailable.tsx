import { t } from '@openagentspocket/i18n';
import { EmptyState, Screen, Text } from '@openagentspocket/ui';

/**
 * An Agent the console does not list: gone once its Host's fresh snapshot lacks it, otherwise
 * nothing is known yet (the Host is still reconnecting), which must never read as gone.
 */
export function AgentUnavailable({ gone }: { gone: boolean }) {
  return (
    <Screen scroll={false} edges={['bottom']} testID={gone ? 'agent-gone' : 'agent-loading'}>
      {gone ? (
        <EmptyState icon="info" title={t('Agent Gone')} />
      ) : (
        <EmptyState icon="wifi" title={t('Reconnecting…')} />
      )}
    </Screen>
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
