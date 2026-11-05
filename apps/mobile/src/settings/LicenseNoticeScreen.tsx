import { t } from '@openagentspocket/i18n';
import { EmptyState, Text } from '@openagentspocket/ui';
import { Stack } from 'expo-router';
import { AppScreen } from '@/navigation/AppScreen';
import { NOTICES } from './notices.generated';

/** One component's license notice: name, license, source and the full text. */
export function LicenseNoticeScreen({ id }: { id?: string }) {
  const notice = NOTICES.find((candidate) => candidate.id === id);
  return (
    <AppScreen header={{ variant: 'native' }} testID="settings-license">
      <Stack.Screen options={{ title: notice?.name ?? t('Acknowledgements') }} />
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
    </AppScreen>
  );
}
