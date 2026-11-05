import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { PortsScreen } from '@/ports/PortsScreen';
import { portsStoreFor, releasePortsStore } from '@/ports/registry';

/** `/ports?host=<id>&name=<display name>`: the web servers listening on a Host. */
export default function PortsRoute() {
  const { host, name } = useLocalSearchParams<{ host?: string; name?: string }>();
  const router = useRouter();
  const hostId = host ?? 'demo';
  const store = portsStoreFor({ hostId, hostName: name ?? hostId });
  // Leaving the list closes the store: it stops the tunnel and ends the preview's connection.
  useEffect(() => () => releasePortsStore(hostId), [hostId]);
  return (
    <>
      <PortsScreen
        onDone={() => router.back()}
        store={store}
        onOpenPreview={() => router.push({ pathname: '/ports/preview', params: { host: hostId } })}
      />
    </>
  );
}
