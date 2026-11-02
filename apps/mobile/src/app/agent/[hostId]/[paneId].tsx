import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AgentDetailScreen } from '@/agent-detail/AgentDetailScreen';
import { parseSurface } from '@/agent-detail/surface';
import { deviceStorage } from '@/settings/deviceStorage';

export default function AgentRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ hostId: string; paneId: string; surface?: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: '' }} />
      <AgentDetailScreen
        key={`${params.hostId}/${params.paneId}`}
        hostId={params.hostId}
        paneId={params.paneId}
        storage={deviceStorage}
        surface={parseSurface(params.surface)}
        onSwitch={(row) =>
          router.replace({
            pathname: '/agent/[hostId]/[paneId]',
            params: { hostId: row.hostId, paneId: row.agent.pane_id },
          })
        }
      />
    </>
  );
}
