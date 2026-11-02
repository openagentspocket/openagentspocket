import { ListRow } from '@openagentspocket/ui';
import { useRouter } from 'expo-router';
import { NOTICES } from './notices.generated';

const SHORT_LICENSE = 16;

/** The third-party components the app ships, each opening its license notice. */
export function AcknowledgementsList() {
  const router = useRouter();
  return (
    <>
      {NOTICES.map((notice) => (
        <ListRow
          key={notice.id}
          title={notice.name}
          // A short license reads as the trailing value; a long expression wraps under the name.
          value={notice.spdx.length <= SHORT_LICENSE ? notice.spdx : undefined}
          subtitle={notice.spdx.length > SHORT_LICENSE ? notice.spdx : undefined}
          subtitleLines={4}
          chevron
          onPress={() =>
            router.push({ pathname: '/settings/license/[id]', params: { id: notice.id } })
          }
          testID={`settings.notice.${notice.id}`}
        />
      ))}
    </>
  );
}
