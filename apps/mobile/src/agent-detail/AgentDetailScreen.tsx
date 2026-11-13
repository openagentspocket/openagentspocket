import type { ConsoleRow, KeyValueStorage } from '@openagentspocket/core';
import { type ActionMenuItem, EdgeFade, makeStyles } from '@openagentspocket/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { statusDot } from '@/console/agentStatus';
import { AppScreen } from '@/navigation/AppScreen';
import { BlockedCardProvider } from '../blocked/BlockedCardProvider';
import { activityOf } from '../blocked/useBlockedCard';
import { useAgentPhase, useConsole, useConsoleState } from '../console/hooks';
import { AgentHeader } from './AgentHeader';
import { AgentSessionDrawer } from './AgentSessionDrawer';
import { AgentUnavailable } from './AgentUnavailable';
import { AgentComposerBar } from './composer/AgentComposer';
import { useAgentComposer } from './composer/composerContext';
import { DetailDock } from './DetailDock';
import { DetailSlot } from './DetailSlot';
import { DetailUiProvider } from './detailUi';
import { type Surface, useSurface } from './surface';
import { useFocusDone } from './useFocusDone';

/** How far past the header the fade runs; the header's own height behind it is solid. */
const HEADER_FADE = 24;

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
  /** A fresh token re-applies `surface` while the detail is open (text handed to the Composer). */
  surfaceRequest?: string;
  onSwitch: (row: ConsoleRow) => void;
  /** Changes, Files and Ports, from the route; the header menu adds Chat/Terminal. */
  menu?: readonly ActionMenuItem[];
  onOpenChanges?: () => void;
  /** Back to the Home screen; draws Home buttons in the header and the drawer. */
  onHome?: () => void;
  /** Counts the route's visits: coming back lands Chat on its newest row. */
  visit?: number;
}

/** The detail: chat or terminal fills the screen; the header floats, the composer dock sits below. */
export function AgentDetailScreen({
  hostId,
  paneId,
  storage,
  surface: requested,
  surfaceRequest,
  onSwitch,
  menu,
  onOpenChanges,
  onHome,
  visit,
}: Props) {
  const styles = useStyles();
  const { row, phase } = useAgentPhase(hostId, paneId);
  const rows = useConsole();
  const latency = useConsoleState().hosts.find((host) => host.id === hostId)?.latencyMs;
  const [surface, setSurface] = useSurface(storage, requested, surfaceRequest);
  const [drawer, setDrawer] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  useFocusDone(hostId, paneId, row?.agent.agent_status === 'done');
  const composer = useAgentComposer(hostId, paneId, row?.agent.agent_status ?? 'unknown', storage);
  if (!row) return <AgentUnavailable gone={phase === 'gone'} hostId={hostId} />;
  const status = statusDot(row.agent.agent_status);
  const toggle = () => setSurface(surface === 'chat' ? 'terminal' : 'chat');
  return (
    <DetailUiProvider hostId={hostId} paneId={paneId}>
      <BlockedCardProvider
        row={row}
        active={surface === 'chat'}
        onShowTerminal={() => setSurface('terminal')}
      >
        <AgentSessionDrawer
          open={drawer}
          onOpen={() => setDrawer(true)}
          onClose={() => setDrawer(false)}
          rows={rows}
          current={row}
          onSelect={onSwitch}
          onHome={onHome}
        >
          <AppScreen scroll={false} bare keyboardAvoiding testID="agent-detail">
            <View style={styles.fill} testID={`slot-${surface}`}>
              <DetailSlot
                hostId={hostId}
                paneId={paneId}
                program={row.agent.agent}
                surface={surface}
                activity={activityOf(row)}
                messages={composer.snapshot.messages}
                composer={composer.store}
                headerHeight={headerHeight}
                onShowTerminal={() => setSurface('terminal')}
                visit={visit}
              />
              {surface === 'chat' ? (
                <EdgeFade height={headerHeight + HEADER_FADE} solidHeight={headerHeight} />
              ) : null}
              <View
                style={styles.header}
                pointerEvents="box-none"
                onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
              >
                <AgentHeader
                  row={row}
                  rows={rows}
                  onSwitch={onSwitch}
                  surface={surface}
                  onSurface={setSurface}
                  onSidebar={() => setDrawer(true)}
                  onHome={onHome}
                  menu={menu}
                  onOpenChanges={onOpenChanges}
                  stale={phase === 'stale'}
                  latencyMs={latency}
                  showTitle={surface === 'terminal'}
                />
              </View>
            </View>
            <View style={styles.dock}>
              <DetailDock row={row} surface={surface} />
              <AgentComposerBar
                composer={composer}
                surface={surface}
                program={row.agent.agent ?? 'unknown'}
                projectRoot={row.agent.cwd ?? undefined}
                status={status}
                onToggleSurface={toggle}
              />
            </View>
          </AppScreen>
        </AgentSessionDrawer>
      </BlockedCardProvider>
    </DetailUiProvider>
  );
}
