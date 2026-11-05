import { agentKey } from '@openagentspocket/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AgentDetailScreen } from '@/agent-detail/AgentDetailScreen';
import { COMPOSER_MORE_ANCHOR } from '@/agent-detail/composer/AgentComposer';
import { parseSurface } from '@/agent-detail/surface';
import { useAgent, useConsoleStore } from '@/console/hooks';
import { agentActions } from '@/features/agents/agentActions';
import { closeAgentItem } from '@/features/agents/closeAgent';
import { useEntryMenus } from '@/navigation/entryMenus';
import { hrefs } from '@/navigation/hrefs';
import { deviceStorage } from '@/settings/deviceStorage';

export default function AgentRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ hostId: string; paneId: string; surface?: string }>();
  const row = useAgent(agentKey(params.hostId, params.paneId));
  const entries = useEntryMenus();
  const store = useConsoleStore();
  // The floating header's menu: Changes, Ports and New Agent here (Open is where the user already is).
  const items = row
    ? [
        ...entries.agent(row).filter((item) => item.key !== 'open'),
        closeAgentItem(row, agentActions(store), () => router.back(), {
          anchorKey: COMPOSER_MORE_ANCHOR,
        }),
      ]
    : [];
  return (
    <>
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
