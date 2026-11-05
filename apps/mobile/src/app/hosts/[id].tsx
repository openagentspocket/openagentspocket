import { useLocalSearchParams, useRouter } from 'expo-router';
import { HostDetailScreen } from '@/features/hosts/HostDetailScreen';
import { hrefs } from '@/navigation/hrefs';

/** `/hosts/<id>`: one Host's status, routes and preflight. */
export default function HostDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  return (
    <HostDetailScreen
      hostId={id}
      onBack={() => router.back()}
      onEdit={(hostId) => router.push(hrefs.hostForm({ edit: hostId }))}
      onRemoved={() => router.back()}
      onOpenUsage={(hostId) => router.push({ pathname: '/usage', params: { host: hostId } })}
    />
  );
}
