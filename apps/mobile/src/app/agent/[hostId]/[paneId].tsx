import { agentKey } from '@openagentspocket/core';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AgentDetailScreen } from '@/agent-detail/AgentDetailScreen';
import { parseSurface } from '@/agent-detail/surface';
import { useAgent } from '@/console/hooks';
import { useEntryMenus } from '@/navigation/entryMenus';
import { hrefs } from '@/navigation/hrefs';
import { deviceStorage } from '@/settings/deviceStorage';

export default function AgentRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ hostId: string; paneId: string; surface?: string }>();
  const row = useAgent(agentKey(params.hostId, params.paneId));
  const entries = useEntryMenus();
  // The floating header's menu: Changes, Ports and New Agent here (Open is where the user already is).
  const items = row ? entries.agent(row).filter((item) => item.key !== 'open') : [];
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AgentDetailScreen
        key={`${params.hostId}/${params.paneId}`}
        hostId={params.hostId}
        paneId={params.paneId}
        storage={deviceStorage}
        surface={parseSurface(params.surface)}
        menu={items}
        onOpenChanges={() => router.push(hrefs.changesForAgent(params.hostId, params.paneId))}
        onSwitch={(next) =>
          router.replace({
            pathname: '/agent/[hostId]/[paneId]',
            params: { hostId: next.hostId, paneId: next.agent.pane_id },
          })
        }
      />
    </>
  );
}
