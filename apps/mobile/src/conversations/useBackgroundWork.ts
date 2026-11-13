import {
  type BackgroundWorkNotice,
  type BackgroundWorkPresentation,
  backgroundWorkOf,
  type ChatBackgroundWork,
  emptyBackgroundWork,
  holdsActivePace,
  listedNotices,
  presentBackgroundWork,
} from '@openagentspocket/core';
import { getLocaleTag } from '@openagentspocket/i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConsoleState } from '@/console/hooks';
import { useConversation } from './useConversation';

export interface BackgroundWorkView {
  work: ChatBackgroundWork;
  presentation: BackgroundWorkPresentation;
  /** The harness's notices since the latest message, which the timeline leaves out. */
  notices: BackgroundWorkNotice[];
  /** The time the presentation is as of (epoch milliseconds). */
  now: number;
  /** A live read shows work running: the conversation keeps its active pace. */
  holdsPace: boolean;
  /** The id a Subagent's transcript opens by, from its launch; null when unknown or unsafe as a path. */
  subagentIdOf: (workId: string) => string | null;
}

/**
 * The Background Work (Subagents and Workflows) of one Agent's conversation, presented as of now.
 * Any surface can use it: the chat strip and sheet today, the Home inbox later. Built afresh from
 * the conversation after every read, and empty until a live read has shown the transcript (what the
 * device kept can't claim to run). Ticks once a second while a row's time moves, or while the caller
 * shows another moving time (`ticking`: the running turn's).
 */
export function useBackgroundWork(
  hostId: string,
  paneId: string,
  ticking = false,
): BackgroundWorkView {
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
  const ticks = presentation.ticks || ticking;
  useEffect(() => {
    if (!ticks) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticks]);
  const notices = useMemo(
    () => (hasReadLive.current ? listedNotices(snapshot.transcript) : []),
    [snapshot.transcript],
  );
  const items = snapshot.transcript.backgroundWork;
  const subagentIdOf = useCallback(
    (workId: string) => items.find((item) => item.id === workId)?.agentID ?? null,
    [items],
  );
  return { work, presentation, notices, now, holdsPace: holdsActivePace(work), subagentIdOf };
}
