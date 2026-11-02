import {
  agentKey,
  type ConsoleRow,
  type KeyValueStorage,
  terminalStopAvailable,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type ActionMenuItem, EmptyState, makeStyles, Screen, Text } from '@openagentspocket/ui';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlockedCardSlot } from '../blocked/BlockedCardSlot';
import { useAgent, useConsole } from '../console/hooks';
import {
  ChatBanners,
  type ChatStatusInput,
  ChatWait,
  useChatRetry,
  useChatStatus,
} from '../notifications/ChatBanners';
import { AgentHeader } from './AgentHeader';
import { AgentStatusLine } from './AgentStatusLine';
import { AgentSwitcher } from './AgentSwitcher';
import { AgentComposerBar } from './composer/AgentComposer';
import { useAgentComposer } from './composer/composerContext';
import { type Surface, useSurface } from './surface';
import { TerminalSurface } from './terminal/TerminalSurface';
import { useFocusDone } from './useFocusDone';

const useStyles = makeStyles((th) => ({
  root: { flex: 1, backgroundColor: th.colors.canvas },
  // Under the floating header circles: 44 pt plus its margins.
  top: { height: 52 },
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
  /** The Sessions circle (leading). */
  onSessions?: () => void;
  /** The "..." menu (trailing). */
  moreItems?: readonly ActionMenuItem[];
}

/** The detail shell: header, switcher and the Chat or Terminal slot. */
export function AgentDetailScreen({
  hostId,
  paneId,
  storage,
  surface: requested,
  chatStatus: pinnedStatus,
  onSwitch,
  onSessions,
  moreItems,
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
  const locating = surface === 'chat' && chatStatus.locating;
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="agent-detail">
      <View style={styles.top} />
      {surface === 'chat' ? (
        <ChatBanners
          {...chatStatus}
          onRetry={retry}
          onShowTerminal={() => setSurface('terminal')}
        />
      ) : null}
      {surface === 'chat' ? <BlockedCardSlot row={row} /> : null}
      <View style={styles.slot} testID={`slot-${surface}`}>
        {surface === 'chat' ? (
          locating ? (
            <ChatWait />
          ) : (
            <Text variant="body" tone="secondary" testID="chat-slot" style={{ padding: 21 }}>
              {t('Chat arrives with the conversation engine.')}
            </Text>
          )
        ) : (
          <TerminalSurface hostId={hostId} paneId={paneId} />
        )}
      </View>
      <AgentStatusLine row={row} />
      <AgentComposerBar
        composer={composer}
        surface={surface}
        program={row.agent.agent ?? 'unknown'}
        onToggleSurface={() => setSurface(surface === 'chat' ? 'terminal' : 'chat')}
        footer={<AgentSwitcher rows={rows} currentKey={key} onSelect={onSwitch} />}
        canStop={terminalStopAvailable(row.agent.agent ?? '')}
        moreItems={moreItems}
      />
      <AgentHeader onSessions={onSessions ?? (() => {})} items={moreItems} />
    </SafeAreaView>
  );
}
