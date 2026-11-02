import { agentKey, type ConsoleRow, type KeyValueStorage } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { EmptyState, makeStyles, Screen, TerminalView, Text } from '@openagentspocket/ui';
import { View } from 'react-native';
import { BlockedCardSlot } from '../blocked/BlockedCardSlot';
import { useAgent, useConsole } from '../console/hooks';
import { AgentHeader } from './AgentHeader';
import { AgentSwitcher } from './AgentSwitcher';
import { type Surface, useSurface } from './surface';
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
  onSwitch: (row: ConsoleRow) => void;
}

/** The detail shell: header, switcher and the Chat or Terminal slot. */
export function AgentDetailScreen({
  hostId,
  paneId,
  storage,
  surface: requested,
  onSwitch,
}: Props) {
  const styles = useStyles();
  const key = agentKey(hostId, paneId);
  const row = useAgent(key);
  const rows = useConsole();
  const [surface, setSurface] = useSurface(storage, requested);
  useFocusDone(hostId, paneId, row?.agent.agent_status === 'done');
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
      <AgentSwitcher rows={rows} currentKey={key} onSelect={onSwitch} />
      {surface === 'chat' ? <BlockedCardSlot row={row} /> : null}
      <View style={styles.slot} testID={`slot-${surface}`}>
        {surface === 'chat' ? (
          <Text variant="body" tone="secondary" testID="chat-slot">
            {t('Chat arrives with the conversation engine.')}
          </Text>
        ) : (
          <TerminalView
            renderer="plain"
            accessibilityLabel={t('Terminal')}
            testID="terminal-slot"
          />
        )}
      </View>
    </Screen>
  );
}
