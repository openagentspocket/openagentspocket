import { ListRow } from '@openagentspocket/ui';
import { useRouter } from 'expo-router';
import { NOTICES } from './notices.generated';

/** The third-party components the app ships, each opening its license notice. */
export function AcknowledgementsList() {
  const router = useRouter();
  return (
    <>
      {NOTICES.map((notice) => (
        <ListRow
          key={notice.id}
          title={notice.name}
          subtitle={notice.version ? `${notice.spdx} · ${notice.version}` : notice.spdx}
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
