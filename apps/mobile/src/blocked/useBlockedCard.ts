import {
  type BlockedCardState,
  BlockedCardStore,
  blockedSupportFor,
  type ChatProgram,
  type ConsoleRow,
  type ObservedActivity,
  programIdentity,
} from '@openagentspocket/core';
import { herdrScreenIO, isBlockedPaneApi } from '@openagentspocket/transport';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useConsoleStore } from '../console/hooks';
import { systemClock } from '../console/systemClock';

/** The Agent's program as Chat knows it; undefined for programs without a Blocked card. */
export function chatProgramOf(row: ConsoleRow): ChatProgram | undefined {
  const kind = programIdentity(row.agent.agent ?? '').kind as ChatProgram | undefined;
  return kind && blockedSupportFor(kind) ? kind : undefined;
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
 * The Blocked card store for one Agent while its detail shows: watches the pane while the Agent
 * is Blocked, and ends with the view. Null for a program without a card.
 */
export function useBlockedCard(row: ConsoleRow): BlockedCardHandle | null {
  const consoleStore = useConsoleStore();
  const { hostId } = row;
  const paneId = row.agent.pane_id;
  const program = chatProgramOf(row);
  const store = useMemo(() => {
    if (!program) return null;
    const io = herdrScreenIO(paneId, (operation) =>
      consoleStore.withTransport(hostId, async (transport) => {
        if (!isBlockedPaneApi(transport)) throw new Error('This Host cannot read panes.');
        return operation(transport);
      }),
    );
    return new BlockedCardStore({ program, io, clock: systemClock });
  }, [consoleStore, hostId, paneId, program]);
  const activity = activityOf(row);
  useEffect(() => {
    store?.setActivity(activity);
  }, [store, activity]);
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
