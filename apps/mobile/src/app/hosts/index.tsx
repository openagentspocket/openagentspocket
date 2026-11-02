import { useRouter } from 'expo-router';
import { HostListScreen } from '@/features/hosts/HostListScreen';

/** `/hosts`: the saved Hosts. */
export default function HostsRoute() {
  const router = useRouter();
  return (
    <HostListScreen
      onOpen={(host) => router.push({ pathname: '/hosts/[id]', params: { id: host.id } })}
      onAdd={() => router.push('/hosts/form')}
      onScan={() => router.push('/hosts/pair')}
      onEdit={(host) => router.push({ pathname: '/hosts/form', params: { edit: host.id } })}
      onDuplicate={(host) =>
        router.push({ pathname: '/hosts/form', params: { duplicate: host.id } })
      }
    />
  );
}
