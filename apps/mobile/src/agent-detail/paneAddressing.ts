import {
  agentKey,
  agentPaneTarget,
  type ConsoleRow,
  type TerminalAttachTarget,
  terminalTarget,
} from '@openagentspocket/core';
import type { PaneAddressing } from '@openagentspocket/transport';
import { useAgent } from '@/console/hooks';

/**
 * Through its Agent, or through the pane when herdr detects no Agent in it (a program herdr does
 * not know, or one run as another user): `agent.*` would answer "agent not found" there.
 */
export function paneAddressing(row: ConsoleRow | undefined): PaneAddressing {
  return row && !row.agent.agent ? 'pane' : 'agent';
}

/** What the Agent detail attaches its terminal to: the Agent's pane, or the pane's terminal. */
export function attachTargetOf(row: ConsoleRow | undefined, paneId: string): TerminalAttachTarget {
  return row && paneAddressing(row) === 'pane' && row.agent.terminal_id
    ? terminalTarget(row.agent.terminal_id)
    : agentPaneTarget(paneId);
}

export function usePaneAddressing(hostId: string, paneId: string): PaneAddressing {
  return paneAddressing(useAgent(agentKey(hostId, paneId)));
}
