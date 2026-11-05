import {
  type ChatAgentActivity,
  type ChatPendingEcho,
  type ChatRow,
  ChatRowBuilder,
  type ChatRowID,
  type ConversationState,
  projectTimeline,
  turnSignals,
} from '@openagentspocket/core';
import { useCallback, useMemo, useRef, useState } from 'react';

const NO_PENDING: readonly ChatPendingEcho[] = [];

/** The timeline rows of a conversation, folded as Swift folds them; headers open on their own. */
export function useChatRows(
  state: ConversationState,
  activity: ChatAgentActivity,
  pending: readonly ChatPendingEcho[] = NO_PENDING,
): { rows: ChatRow[]; toggle: (id: ChatRowID) => void } {
  const builder = useRef(new ChatRowBuilder());
  const [open, setOpen] = useState<ReadonlySet<ChatRowID>>(new Set());
  const toggle = useCallback((id: ChatRowID) => {
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const { snapshot } = state;
  const { transcript } = snapshot;
  const rows = useMemo(() => {
    const built = builder.current.rows({
      entries: transcript.entries,
      pending,
      older: snapshot.older.type === 'failed' ? { failed: 'failed' } : snapshot.older.type,
    });
    const background = transcript.backgroundWork.some((item) => item.state === 'running');
    return projectTimeline(built, {
      turns: transcript.turns,
      precedingTurnEnd: transcript.precedingTurnEnd,
      signals: turnSignals({
        activity,
        isBackgroundWorkRunning: background,
        isLive: !snapshot.isFromCache,
        olderAwaitsUser: snapshot.olderAwaitsUser,
      }),
      open,
    }).rows;
    // The revision changes whenever the snapshot does.
  }, [
    transcript,
    pending,
    snapshot.older,
    snapshot.isFromCache,
    snapshot.olderAwaitsUser,
    activity,
    open,
  ]);
  return { rows, toggle };
}
