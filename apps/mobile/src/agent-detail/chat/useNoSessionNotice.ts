import {
  type ChatAgentActivity,
  type ChatConversationSnapshot,
  type ChatNoSessionNotice,
  type ComposerMessage,
  noSessionNotice,
  promptTaken,
  type TerminalWait,
  terminalWaitOn,
} from '@openagentspocket/core';
import { useEffect, useMemo, useState } from 'react';
import { useAgentScreenIO } from '../useAgentScreenIO';

/**
 * While herdr reports no session: what the Agent's screen and the Composer say about why, for any
 * program (a wait only its terminal answers, or a prompt it took without reporting). Reads the screen
 * when the wait starts and whenever herdr's activity changes; never sends a key.
 */
export function useNoSessionNotice(
  hostId: string,
  paneId: string,
  phase: ChatConversationSnapshot['phase'],
  activity: ChatAgentActivity,
  messages: readonly ComposerMessage[],
): ChatNoSessionNotice | null {
  const io = useAgentScreenIO(hostId, paneId);
  const reason =
    phase.type === 'unavailable' && phase.reason.kind === 'noSession' ? phase.reason : null;
  const program = reason?.program ?? null;
  const [wait, setWait] = useState<TerminalWait | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new activity is a reason to read again.
  useEffect(() => {
    if (!program) return setWait(null);
    let live = true;
    void io
      .readScreen()
      .then((screen) => live && setWait(terminalWaitOn(program, screen.rows)))
      // A screen that cannot be read says nothing more than the wait.
      .catch(() => live && setWait(null));
    return () => {
      live = false;
    };
  }, [io, program, activity]);
  const taken = promptTaken(messages);
  return useMemo(
    () => (reason ? noSessionNotice(reason, { terminalWait: wait, promptTaken: taken }) : null),
    [reason, wait, taken],
  );
}
