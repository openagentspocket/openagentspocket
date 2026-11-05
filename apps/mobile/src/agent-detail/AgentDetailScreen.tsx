import {
  agentKey,
  type ConsoleRow,
  type KeyValueStorage,
  terminalStopAvailable,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type ActionMenuItem, EmptyState, makeStyles } from '@openagentspocket/ui';
import { useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import { statusDot } from '@/console/agentStatus';
import { AppScreen } from '@/navigation/AppScreen';
import { activityOf } from '../blocked/useBlockedCard';
import { useAgent, useConsole, useConsoleState } from '../console/hooks';
import { AgentHeader } from './AgentHeader';
import { AgentSessionDrawer } from './AgentSessionDrawer';
import { AgentSwitcher } from './AgentSwitcher';
import { AgentComposerBar } from './composer/AgentComposer';
import { useAgentComposer } from './composer/composerContext';
import { DetailDock } from './DetailDock';
import { DetailSlot } from './DetailSlot';
import { DetailUiProvider } from './detailUi';
import { type Surface, useSurface } from './surface';
import { useFocusDone } from './useFocusDone';

const useStyles = makeStyles((th) => ({
  fill: { flex: 1 },
  header: { position: 'absolute', top: 0, left: 0, right: 0 },
  dock: { gap: th.spacing.xxs, paddingBottom: th.spacing.xxs },
}));

interface Props {
  hostId: string;
  paneId: string;
  storage: KeyValueStorage;
  /** A deep link's surface for this visit. */
  surface?: Surface;
  onSwitch: (row: ConsoleRow) => void;
  /** Changes, Files and Ports, from the route; the header menu adds Chat/Terminal. */
  menu?: readonly ActionMenuItem[];
  onOpenChanges?: () => void;
}

/** The detail: chat or terminal fills the screen; the header floats, the composer dock sits below. */
export function AgentDetailScreen({
  hostId,
  paneId,
  storage,
  surface: requested,
  onSwitch,
  menu,
  onOpenChanges,
}: Props) {
  const styles = useStyles();
  const key = agentKey(hostId, paneId);
  const row = useAgent(key);
  const rows = useConsole();
  const latency = useConsoleState().hosts.find((host) => host.id === hostId)?.latencyMs;
  const [surface, setSurface] = useSurface(storage, requested);
  const [drawer, setDrawer] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  useFocusDone(hostId, paneId, row?.agent.agent_status === 'done');
  const composer = useAgentComposer(hostId, paneId, row?.agent.agent_status ?? 'unknown', storage);
  if (!row) {
    return (
      <AppScreen scroll={false} testID="agent-gone">
        <EmptyState icon="info" title={t('Agent Gone')} />
      </AppScreen>
    );
  }
  const status = statusDot(row.agent.agent_status);
  const toggle = () => setSurface(surface === 'chat' ? 'terminal' : 'chat');
  return (
    <DetailUiProvider hostId={hostId} paneId={paneId}>
      <AppScreen scroll={false} bare keyboardAvoiding testID="agent-detail">
        <View style={styles.fill} testID={`slot-${surface}`}>
          <DetailSlot
            hostId={hostId}
            paneId={paneId}
            surface={surface}
            activity={activityOf(row)}
            headerHeight={headerHeight}
            onShowTerminal={() => setSurface('terminal')}
          />
          <View
            style={styles.header}
            pointerEvents="box-none"
            onLayout={(event: LayoutChangeEvent) =>
              setHeaderHeight(event.nativeEvent.layout.height)
            }
          >
            <AgentHeader
              row={row}
              surface={surface}
              onSurface={setSurface}
              onSidebar={() => setDrawer(true)}
              menu={menu}
              showTitle={surface === 'terminal'}
            />
          </View>
        </View>
        <View style={styles.dock}>
          <DetailDock
            row={row}
            surface={surface}
            status={status}
            latencyMs={latency}
            onOpenChanges={onOpenChanges}
          />
          <AgentComposerBar
            composer={composer}
            surface={surface}
            program={row.agent.agent ?? 'unknown'}
            status={status}
            onToggleSurface={toggle}
            canStop={terminalStopAvailable(row.agent.agent ?? '')}
          />
          <AgentSwitcher
            rows={rows}
            currentKey={key}
            onSelect={onSwitch}
            surface={surface}
            onSurface={setSurface}
          />
        </View>
        <AgentSessionDrawer
          visible={drawer}
          onClose={() => setDrawer(false)}
          rows={rows}
          current={row}
          onSelect={onSwitch}
        />
      </AppScreen>
    </DetailUiProvider>
  );
}
