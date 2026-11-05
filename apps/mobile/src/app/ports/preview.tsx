import { useStoreState } from '@openagentspocket/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PortPreviewScreen } from '@/ports/PortPreviewScreen';
import { portsStoreFor } from '@/ports/registry';

/** `/ports/preview?host=<id>`: the server opened from the list, titled `Host:port`. */
export default function PortPreviewRoute() {
  const { host } = useLocalSearchParams<{ host?: string }>();
  const router = useRouter();
  const hostId = host ?? 'demo';
  // The list route made the store; this one only reads it.
  const store = portsStoreFor({ hostId, hostName: hostId });
  const { preview } = useStoreState(store);
  const title = preview ? `${store.hostName}:${preview.target.port}` : store.hostName;
  return (
    <>
      <PortPreviewScreen store={store} title={title} onClose={() => router.back()} />
    </>
  );
}
