import type { ClaudeSubagentRoute } from '@openagentspocket/core';
import type { SubagentPhase, SubagentRow } from '@openagentspocket/ui';
import { useCallback, useEffect, useState } from 'react';
import { subagentRows } from './subagentRows';
import { useConversationRegistry } from './useConversation';

export interface SubagentTranscriptState {
  phase: SubagentPhase;
  route: ClaudeSubagentRoute | null;
  rows: SubagentRow[];
  /** Only the tail of a long transcript was read. */
  partial: boolean;
  failure?: string;
  retry: () => void;
}

/**
 * One Subagent's transcript of an Agent, read once while `agentId` is set (and again on `retry`).
 * Any surface can open it with the Agent and the id the reporting call carried.
 */
export function useSubagentTranscript(
  hostId: string,
  paneId: string,
  agentId: string | null,
): SubagentTranscriptState {
  const registry = useConversationRegistry();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<SubagentTranscriptState, 'retry'>>({
    phase: 'loading',
    route: null,
    rows: [],
    partial: false,
  });
  useEffect(() => {
    if (agentId === null || !registry) return;
    let live = true;
    void attempt;
    setState({ phase: 'loading', route: null, rows: [], partial: false });
    void registry.readSubagent(hostId, paneId, agentId).then(({ route, outcome }) => {
      if (!live) return;
      switch (outcome.type) {
        case 'loaded':
          setState({
            phase: 'loaded',
            route,
            rows: subagentRows(outcome.transcript),
            partial: outcome.isPartial,
          });
          break;
        case 'unreadable':
          setState({ phase: 'failed', route, rows: [], partial: false, failure: outcome.reason });
          break;
        default:
          setState({ phase: outcome.type, route, rows: [], partial: false });
      }
    });
    return () => {
      live = false;
    };
  }, [registry, hostId, paneId, agentId, attempt]);
  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  return { ...state, retry };
}
