import { hostDisplayName } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Banner, Button, confirm, NavRow, Screen, Section, Text } from '@openagentspocket/ui';
import { useRouter } from 'expo-router';
import { useHosts } from '@/features/hosts/useHosts';
import { setAgentRows } from './useAgentFields';

interface Props {
  /** The saved fields could not be read: editing pauses until the owner resets them. */
  unreadable?: boolean;
}

/** settings.agent-list-fields: one row per Host; each opens that Host's field editor. */
export function AgentFieldsListScreen({ unreadable = false }: Props) {
  const { hosts } = useHosts();
  const router = useRouter();
  const reset = async () => {
    const ok = await confirm({
      title: t('Reset saved Agent List Fields?'),
      message: t(
        'The unreadable saved fields are deleted. Every Host returns to its herdr fields and can be edited again.',
      ),
      confirmLabel: t('Reset Saved Fields'),
      destructive: true,
      presentation: 'dialog',
    });
    if (ok) for (const host of hosts) setAgentRows(host.id, null);
  };
  return (
    <Screen edges={['left', 'right']} testID="settings-agent-fields">
      <Text tone="secondary" variant="footnote">
        {t(
          'Each Host decides which fields appear on its Agent rows in Console. Open a Host to change them.',
        )}
      </Text>
      <Section>
        {hosts.map((host) => (
          <NavRow
            key={host.id}
            title={hostDisplayName(host)}
            onPress={() =>
              router.push({ pathname: '/settings/agent-fields/[host]', params: { host: host.id } })
            }
            testID={`agent-fields-host-${host.id}`}
          />
        ))}
      </Section>
      {unreadable ? (
        <>
          <Banner
            tone="warning"
            title={t('Saved fields can’t be read')}
            message={t(
              'Agentico kept the saved data untouched. Every Host follows its herdr fields, and editing is paused until you reset.',
            )}
          />
          <Button
            kind="text"
            title={t('Reset Saved Fields')}
            onPress={() => void reset()}
            testID="agent-fields-reset"
          />
        </>
      ) : null}
    </Screen>
  );
}
