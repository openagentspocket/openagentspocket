import { t } from '@openagentspocket/i18n';
import { EmptyState, Screen, Text } from '@openagentspocket/ui';
import { Stack } from 'expo-router';
import { NOTICES } from './notices.generated';

/** One component's license notice: name, license, source and the full text. */
export function LicenseNoticeScreen({ id }: { id?: string }) {
  const notice = NOTICES.find((candidate) => candidate.id === id);
  return (
    <Screen edges={['bottom', 'left', 'right']} testID="settings-license">
      <Stack.Screen options={{ title: notice?.name ?? t('Acknowledgements'), headerShown: true }} />
      {notice ? (
        <>
          <Text variant="headline">{notice.name}</Text>
          <Text tone="secondary">
            {notice.version ? `${notice.spdx} · ${notice.version}` : notice.spdx}
          </Text>
          <Text tone="secondary" selectable>
            {notice.source}
          </Text>
          <Text variant="mono" selectable>
            {notice.text}
          </Text>
        </>
      ) : (
        <EmptyState title={t('Notices Unavailable')} />
      )}
    </Screen>
  );
}
