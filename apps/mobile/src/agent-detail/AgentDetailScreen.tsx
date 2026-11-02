import {
  agentKey,
  type ConsoleRow,
  type KeyValueStorage,
  terminalStopAvailable,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { EmptyState, makeStyles, Screen, Text } from '@openagentspocket/ui';
import { View } from 'react-native';
import { BlockedCardSlot } from '../blocked/BlockedCardSlot';
import { useAgent, useConsole } from '../console/hooks';
import {
  ChatBanners,
  type ChatStatusInput,
  useChatRetry,
  useChatStatus,
} from '../notifications/ChatBanners';
import { AgentHeader } from './AgentHeader';
import { AgentSwitcher } from './AgentSwitcher';
import { AgentComposerBar } from './composer/AgentComposer';
import { useAgentComposer } from './composer/composerContext';
import { type Surface, useSurface } from './surface';
import { TerminalSurface } from './terminal/TerminalSurface';
import { useFocusDone } from './useFocusDone';

const useStyles = makeStyles(() => ({
  slot: { flex: 1 },
}));

interface Props {
  hostId: string;
  paneId: string;
  storage: KeyValueStorage;
  /** A deep link's surface for this visit. */
  surface?: Surface;
  /** Overrides the lines derived from the Host's status (atlas and tests pin a state). */
  chatStatus?: ChatStatusInput;
  onSwitch: (row: ConsoleRow) => void;
}

/** The detail shell: header, switcher and the Chat or Terminal slot. */
export function AgentDetailScreen({
  hostId,
  paneId,
  storage,
  surface: requested,
  chatStatus: pinnedStatus,
  onSwitch,
}: Props) {
  const styles = useStyles();
  const key = agentKey(hostId, paneId);
  const row = useAgent(key);
  const rows = useConsole();
  const derivedStatus = useChatStatus(hostId);
  const chatStatus = pinnedStatus ?? derivedStatus;
  const retry = useChatRetry(hostId);
  const [surface, setSurface] = useSurface(storage, requested);
  useFocusDone(hostId, paneId, row?.agent.agent_status === 'done');
  const composer = useAgentComposer(hostId, paneId, row?.agent.agent_status ?? 'unknown', storage);
  if (!row) {
    return (
      <Screen scroll={false} edges={['bottom']} testID="agent-gone">
        <EmptyState icon="info" title={t('Agent Gone')} />
      </Screen>
    );
  }
  return (
    <Screen scroll={false} edges={['bottom']} testID="agent-detail">
      <AgentHeader row={row} surface={surface} onSurface={setSurface} />
      {surface === 'chat' ? (
        <ChatBanners
          {...chatStatus}
          onRetry={retry}
          onShowTerminal={() => setSurface('terminal')}
        />
      ) : null}
      <AgentSwitcher rows={rows} currentKey={key} onSelect={onSwitch} />
      {surface === 'chat' ? <BlockedCardSlot row={row} /> : null}
      <View style={styles.slot} testID={`slot-${surface}`}>
        {surface === 'chat' && !chatStatus.locating ? (
          <Text variant="body" tone="secondary" testID="chat-slot">
            {t('Chat arrives with the conversation engine.')}
          </Text>
        ) : (
          <TerminalSurface hostId={hostId} paneId={paneId} />
        )}
      </View>
      <AgentComposerBar
        composer={composer}
        surface={surface}
        canStop={terminalStopAvailable(row.agent.agent ?? '')}
      />
    </Screen>
  );
}
