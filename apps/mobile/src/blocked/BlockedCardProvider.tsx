import {
  type ConsoleRow,
  type QuestionWait,
  questionWait,
  transcriptCalls,
} from '@openagentspocket/core';
import type { Status } from '@openagentspocket/ui';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { useConversation } from '@/conversations/useConversation';
import { type BlockedCardHandle, useBlockedCard } from './useBlockedCard';

export interface AgentWait {
  /** The Agent's card; null for a program without one, or away from Chat. */
  card: BlockedCardHandle | null;
  /** The conversation shows a question waiting for an answer, whatever herdr reports. */
  openQuestion: boolean;
  /** The calls that wait on the answer. */
  openCalls: ReadonlySet<string>;
  /** Where an open question gets its answer. */
  wait: QuestionWait;
  showTerminal: () => void;
}

const NOTHING: AgentWait = {
  card: null,
  openQuestion: false,
  openCalls: new Set(),
  wait: 'none',
  showTerminal: () => undefined,
};

/** Exposed so a test or an atlas page can script what an Agent waits on. */
export const AgentWaitContext = createContext<AgentWait>(NOTHING);

export const useAgentWait = (): AgentWait => useContext(AgentWaitContext);

/**
 * What the Agent detail's parts share about an Agent that waits: the card in the dock, the rows
 * that say what it asked, the status line and the Composer's refusal all read one store. It lives
 * while Chat shows; the transcript feeds it, so a question stands even when herdr reports idle.
 */
export function BlockedCardProvider({
  row,
  active,
  onShowTerminal,
  children,
}: {
  row: ConsoleRow;
  active: boolean;
  onShowTerminal: () => void;
  children: ReactNode;
}) {
  const { snapshot } = useConversation(row.hostId, row.agent.pane_id, active).state;
  const { transcript, openQuestions } = snapshot;
  const calls = useMemo(
    () => transcriptCalls(transcript, openQuestions),
    [transcript, openQuestions],
  );
  const card = useBlockedCard(row, active, calls);
  const content = card ? card.state.content : null;
  const openQuestion = active && calls.openQuestion;
  const value = useMemo<AgentWait>(
    () => ({
      card,
      openQuestion,
      openCalls: new Set(
        openQuestions.flatMap((request) => (request.callID === null ? [] : [request.callID])),
      ),
      wait: questionWait(openQuestion, content),
      showTerminal: onShowTerminal,
    }),
    [card, openQuestion, openQuestions, content, onShowTerminal],
  );
  return <AgentWaitContext.Provider value={value}>{children}</AgentWaitContext.Provider>;
}

/** herdr's status, except that an Agent with a question open reads Blocked, because it is. */
export function useShownStatus(status: Status): Status {
  const { openQuestion } = useAgentWait();
  return openQuestion && (status === 'idle' || status === 'done') ? 'blocked' : status;
}
