import type { ComposerMessage } from '@openagentspocket/core';
import { makeStyles } from '@openagentspocket/ui';
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
  /** The Composer's messages, echoed in Chat until the transcript records them. */
  messages: readonly ComposerMessage[];
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
  messages,
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
          messages={messages}
          topInset={headerHeight}
          bottomInset={0}
          onShowTerminal={onShowTerminal}
        />
      </>
    );
  }
  return (
    <View style={[styles.fill, { paddingTop: headerHeight }]}>
      <TerminalSurface hostId={hostId} paneId={paneId} />
    </View>
  );
}
