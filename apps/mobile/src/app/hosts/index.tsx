import { useRouter } from 'expo-router';
import { HostListScreen } from '@/features/hosts/HostListScreen';
import { hrefs } from '@/navigation/hrefs';

/** `/hosts`: the saved Hosts. */
export default function HostsRoute() {
  const router = useRouter();
  return (
    <HostListScreen
      onDone={() => router.dismiss()}
      onSetupGuide={() => router.push('/hosts/guide')}
      onOpen={(host) => router.push({ pathname: '/hosts/[id]', params: { id: host.id } })}
      onAdd={() => router.push(hrefs.hostForm())}
      onScan={() => router.push(hrefs.addHost())}
      onEdit={(host) => router.push(hrefs.hostForm({ edit: host.id }))}
      onDuplicate={(host) => router.push(hrefs.hostForm({ duplicate: host.id }))}
    />
  );
}
