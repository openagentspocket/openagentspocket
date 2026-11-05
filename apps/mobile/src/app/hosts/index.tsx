import { useRouter } from 'expo-router';
import { HostListScreen } from '@/features/hosts/HostListScreen';
import { useAddHostSheet } from '@/features/hosts/useAddHostSheet';
import { hrefs } from '@/navigation/hrefs';

/** `/hosts`: the saved Hosts. */
export default function HostsRoute() {
  const router = useRouter();
  const addHost = useAddHostSheet({
    onEasyPair: () => router.push(hrefs.easyPair()),
    onAddManually: () => router.push(hrefs.hostForm()),
  });
  return (
    <>
      <HostListScreen
        onDone={() => router.dismiss()}
        onSetupGuide={() => router.push('/hosts/guide')}
        onOpen={(host) => router.push({ pathname: '/hosts/[id]', params: { id: host.id } })}
        onAdd={() => router.push(hrefs.hostForm())}
        onScan={addHost.open}
        onEdit={(host) => router.push(hrefs.hostForm({ edit: host.id }))}
        onDuplicate={(host) => router.push(hrefs.hostForm({ duplicate: host.id }))}
      />
      {addHost.sheet}
    </>
  );
}
