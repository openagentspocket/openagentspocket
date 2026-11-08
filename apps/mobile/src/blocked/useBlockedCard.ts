import {
  type BlockedCardState,
  BlockedCardStore,
  blockedSupportFor,
  CHAT_PROGRAMS,
  type ChatProgram,
  type ConsoleRow,
  type ObservedActivity,
  programIdentity,
  type TranscriptCalls,
} from '@openagentspocket/core';
import { systemClock } from '@openagentspocket/transport';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAgentScreenIO } from '../agent-detail/useAgentScreenIO';

/** The Agent's program as Chat knows it; undefined for programs without a Blocked card. */
export function chatProgramOf(row: ConsoleRow): ChatProgram | undefined {
  const { kind } = programIdentity(row.agent.agent ?? '');
  const program = CHAT_PROGRAMS.find((candidate) => candidate === kind);
  return program && blockedSupportFor(program) ? program : undefined;
}

/** herdr's Agent Status as the card's confirmation rules see it. */
export function activityOf(row: ConsoleRow): ObservedActivity {
  switch (row.agent.agent_status) {
    case 'blocked':
      return 'blocked';
    case 'working':
      return 'working';
    case 'idle':
    case 'done':
      return 'idle';
    default:
      return 'unknown';
  }
}

export interface BlockedCardHandle {
  readonly store: BlockedCardStore;
  readonly state: BlockedCardState;
}

/**
 * The Blocked card store for one Agent while its Chat shows: watches the pane while the Agent is
 * Blocked or the conversation shows a question open, and ends with the view. Null for a program
 * without a card.
 */
export function useBlockedCard(
  row: ConsoleRow,
  active: boolean,
  calls: TranscriptCalls,
): BlockedCardHandle | null {
  const { hostId } = row;
  const paneId = row.agent.pane_id;
  const program = chatProgramOf(row);
  const io = useAgentScreenIO(hostId, paneId);
  const store = useMemo(
    () => (program && active ? new BlockedCardStore({ program, io, clock: systemClock }) : null),
    [io, program, active],
  );
  const activity = activityOf(row);
  useEffect(() => {
    store?.setActivity(activity);
  }, [store, activity]);
  useEffect(() => {
    store?.setCalls(calls);
  }, [store, calls]);
  useEffect(() => {
    store?.show();
    return () => store?.end();
  }, [store]);
  const state = useSyncExternalStore(store?.subscribe ?? NO_SUBSCRIBE, store?.getState ?? NO_STATE);
  return store ? { store, state } : null;
}

const NO_SUBSCRIBE = () => () => {};
const NO_STATE = (): BlockedCardState => EMPTY;
const EMPTY: BlockedCardState = {
  content: { kind: 'none' },
  progress: 'ready',
  notice: null,
  composerFocusRequest: 0,
  dialogGeneration: 0,
  isCollapsed: false,
};
