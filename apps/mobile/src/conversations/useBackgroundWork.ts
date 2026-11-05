import {
  type BackgroundWorkPresentation,
  backgroundWorkOf,
  type ChatBackgroundWork,
  emptyBackgroundWork,
  holdsActivePace,
  presentBackgroundWork,
} from '@openagentspocket/core';
import { getLocaleTag } from '@openagentspocket/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useConsoleState } from '@/console/hooks';
import { useConversation } from './useConversation';

export interface BackgroundWorkView {
  work: ChatBackgroundWork;
  presentation: BackgroundWorkPresentation;
  /** A live read shows work running: the conversation keeps its active pace. */
  holdsPace: boolean;
}

/**
 * The Background Work (Subagents and Workflows) of one Agent's conversation, presented as of now.
 * Any surface can use it: the chat strip and sheet today, the Home inbox later. Built afresh from
 * the conversation after every read, and empty until a live read has shown the transcript (what the
 * device kept can't claim to run). Ticks once a second while a row's time moves.
 */
export function useBackgroundWork(hostId: string, paneId: string): BackgroundWorkView {
  const { state } = useConversation(hostId, paneId);
  const hostStatus = useConsoleState().hosts.find((host) => host.id === hostId)?.status;
  const isHostConnected = hostStatus?.kind === 'connected';
  const { snapshot, workflowProgress } = state;
  const hasReadLive = useRef(false);
  const isLive =
    snapshot.phase.type === 'following' && snapshot.readFailure === null && !snapshot.isFromCache;
  if (isLive) hasReadLive.current = true;
  const [now, setNow] = useState(Date.now);
  const work = useMemo(
    () =>
      hasReadLive.current
        ? backgroundWorkOf(snapshot.transcript, workflowProgress, isLive, now)
        : emptyBackgroundWork(),
    [snapshot.transcript, workflowProgress, isLive, now],
  );
  const presentation = useMemo(
    () => presentBackgroundWork(work, { isHostConnected, now, locale: getLocaleTag() }),
    [work, isHostConnected, now],
  );
  const ticks = presentation.ticks;
  useEffect(() => {
    if (!ticks) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticks]);
  return { work, presentation, holdsPace: holdsActivePace(work) };
}
