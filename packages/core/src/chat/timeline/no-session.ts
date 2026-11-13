// What Chat says while herdr reports no session, when it can tell more than "waiting": the Agent's
// screen shows a wait only its terminal answers (Codex's hook review), or the Agent took a prompt and
// still nothing was reported, so its herdr integration is not reporting. Both send the user to the
// terminal; neither asks for another prompt, which would change nothing.

import type { ComposerMessage } from '../../composer/progress';
import { type Message, message } from '../../errors/text';
import { programDefinition } from '../programs/registry';
import type { TerminalWait } from '../programs/terminal-waits';
import { type ChatUnavailableReason, chatName } from './reasons';

export interface ChatNoSessionFacts {
  /** The wait the Agent's screen shows, read while herdr reports no session. */
  terminalWait: TerminalWait | null;
  /** The Agent took a prompt sent from this device: it worked on it, or finished. */
  promptTaken: boolean;
}

export interface ChatNoSessionNotice {
  kind: 'terminalWait' | 'notReporting';
  title: Message;
  explanation: Message;
}

/** Whether the Agent took one of these messages: herdr saw it work on it, or finish it. */
export function promptTaken(messages: readonly ComposerMessage[]): boolean {
  return messages.some(
    (sent) =>
      sent.state.kind === 'delivered' &&
      (sent.state.progress === 'working' || sent.state.progress === 'done'),
  );
}

/** The notice that replaces "Waiting for Conversation" for a reason without a session; null to keep it. */
export function noSessionNotice(
  reason: ChatUnavailableReason,
  facts: ChatNoSessionFacts,
): ChatNoSessionNotice | null {
  if (reason.kind !== 'noSession') return null;
  if (facts.terminalWait) {
    return {
      kind: 'terminalWait',
      title: facts.terminalWait.title(),
      explanation: facts.terminalWait.explanation(),
    };
  }
  if (!facts.promptTaken) return null;
  const name = chatName(reason.program);
  return {
    kind: 'notReporting',
    title: message("%@ Isn't Reporting Its Conversation", name),
    explanation:
      programDefinition(reason.program).notReportingMessage?.() ??
      message(
        "%@ took your prompt, but its herdr integration hasn't reported the conversation. Check the terminal for anything %@ is waiting on, or restart %@ in this pane.",
        name,
        name,
        name,
      ),
  };
}
