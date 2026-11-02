import { useLocalSearchParams, useRouter } from 'expo-router';
import { HostDetailScreen } from '@/features/hosts/HostDetailScreen';

/** `/hosts/<id>`: one Host's status, routes and preflight. */
export default function HostDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  return (
    <HostDetailScreen
      hostId={id}
      onBack={() => router.back()}
      onEdit={(hostId) => router.push({ pathname: '/hosts/form', params: { edit: hostId } })}
      onRemoved={() => router.back()}
    />
  );
}
