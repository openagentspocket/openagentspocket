import { t } from '@openagentspocket/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { HostDetailScreen } from '@/features/hosts/HostDetailScreen';

/** `/hosts/<id>`: one Host's status, routes and preflight. */
export default function HostDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: t('Host Details') }} />
      <HostDetailScreen
        hostId={id}
        onEdit={(hostId) => router.push({ pathname: '/hosts/form', params: { edit: hostId } })}
        onRemoved={() => router.back()}
        onOpenUsage={(hostId) => router.push({ pathname: '/usage', params: { host: hostId } })}
      />
    </>
  );
}
