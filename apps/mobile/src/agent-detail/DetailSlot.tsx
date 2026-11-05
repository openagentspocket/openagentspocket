import { EdgeFade, makeStyles } from '@openagentspocket/ui';
import { View } from 'react-native';
import { ChatTimeline } from './chat/ChatTimeline';
import type { Surface } from './surface';
import { TerminalSurface } from './terminal/TerminalSurface';

const useStyles = makeStyles(() => ({ fill: { flex: 1 } }));

interface Props {
  hostId: string;
  paneId: string;
  surface: Surface;
  activity: Parameters<typeof ChatTimeline>[0]['activity'];
  /** The floating header's height: content starts under it. */
  headerHeight: number;
  onShowTerminal: () => void;
}

/** The content surface that fills the detail: the conversation or the live terminal, under the header's fade. */
export function DetailSlot({
  hostId,
  paneId,
  surface,
  activity,
  headerHeight,
  onShowTerminal,
}: Props) {
  const styles = useStyles();
  if (surface === 'chat') {
    return (
      <>
        <ChatTimeline
          hostId={hostId}
          paneId={paneId}
          activity={activity}
          topInset={headerHeight}
          bottomInset={0}
          onShowTerminal={onShowTerminal}
        />
        {headerHeight > 0 ? <EdgeFade height={headerHeight + 24} /> : null}
      </>
    );
  }
  return (
    <View style={[styles.fill, { paddingTop: headerHeight }]}>
      <TerminalSurface hostId={hostId} paneId={paneId} />
    </View>
  );
}
