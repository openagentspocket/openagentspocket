// How Chat explains a conversation it cannot show (Swift ChatConversationStatus, ADR 0024). Each
// reason leaves the terminal one tap away; none is something Agentico fixes on the Host by itself.
// Wording is returned as catalog messages (keys verbatim from the Swift catalog), so the UI translates.

import { type Message, message } from '../../errors/text';
import { programDefinition } from '../programs/registry';
import {
  type ChatLaunchNotice,
  type ChatUnavailableReason,
  chatName,
  problemIsRetryable,
  UNBROKEN_NO_DAEMON,
  writesNewConversationWithFirstReply,
} from './reasons';

/** What the UI draws as the leading symbol; the UI maps each to its icon. */
export type ChatStatusIcon =
  | 'conversation'
  | 'notFound'
  | 'alertBubble'
  | 'wifi'
  | 'wifiOff'
  | 'warning';

const m = (key: string, ...args: string[]): Message => message(key, ...args);

/** The notice that replaces this reason's wait: Codex on its shared server, which a prompt won't end. */
export function launchNoticeFor(
  reason: ChatUnavailableReason,
  notice: ChatLaunchNotice | null | undefined,
): ChatLaunchNotice | null {
  return notice === 'codexSharedServer' && reason.kind === 'noSession' && reason.program === 'codex'
    ? notice
    : null;
}

export function reasonTitle(
  reason: ChatUnavailableReason,
  launchNotice?: ChatLaunchNotice | null,
): Message {
  if (launchNoticeFor(reason, launchNotice) !== null) {
    return m('Codex Started Without %@', UNBROKEN_NO_DAEMON);
  }
  switch (reason.kind) {
    case 'noSession':
      return m('Waiting for Conversation');
    case 'unidentifiedSession':
      return m('Conversation Not Identified');
    case 'notFound':
    case 'mismatched':
      return m('Conversation Not Found');
    case 'sessionStore':
      return reason.problem.kind === 'sessionMissing'
        ? m('Conversation Not Found')
        : m('Conversation Not Readable');
    case 'awaitingFirstMessage':
      return m('No Messages Yet');
    case 'compressed':
      return m('Conversation Compressed');
    case 'unreadableProgram':
    case 'unsupportedSession':
    case 'unsupportedFormat':
      return m('Conversation Not Readable');
    case 'startScreen':
      return m('Not in This Conversation');
  }
}

export function reasonIcon(
  reason: ChatUnavailableReason,
  launchNotice?: ChatLaunchNotice | null,
): ChatStatusIcon {
  if (launchNoticeFor(reason, launchNotice) !== null) return 'alertBubble';
  switch (reason.kind) {
    case 'noSession':
    case 'awaitingFirstMessage':
      return 'conversation';
    case 'notFound':
    case 'mismatched':
      return 'notFound';
    case 'sessionStore':
      return reason.problem.kind === 'sessionMissing' ? 'notFound' : 'alertBubble';
    default:
      return 'alertBubble';
  }
}

export function reasonExplanation(
  reason: ChatUnavailableReason,
  launchNotice?: ChatLaunchNotice | null,
): Message {
  if (launchNoticeFor(reason, launchNotice) !== null) {
    return m('Exit Codex, then run codex %@ resume.', UNBROKEN_NO_DAEMON);
  }
  switch (reason.kind) {
    case 'noSession':
      return programDefinition(reason.program).noSessionMessage();
    case 'unidentifiedSession':
      return reason.program === 'opencode'
        ? m(
            "herdr reports a session name that isn't an OpenCode session id, so Chat can't tell which conversation is this Agent's.",
          )
        : m(
            "herdr names this Agent's session without an id, which happens after resuming a conversation by name. Chat can't tell which transcript is its own.",
          );
    case 'unsupportedSession':
      return m("herdr reports a session Chat doesn't read.");
    case 'unreadableProgram':
      return m("Chat doesn't read this program yet. Its terminal works as usual.");
    case 'notFound':
      return reason.searchedAll
        ? m(
            "Agentico couldn't find this conversation's transcript on the Host. It keeps looking while Chat is open.",
          )
        : m(
            "Agentico hasn't found this conversation's transcript yet. It keeps looking while Chat is open.",
          );
    case 'awaitingFirstMessage':
      return writesNewConversationWithFirstReply(reason.program)
        ? m(
            '%@ saves this conversation after its first reply. Send a message to start it.',
            chatName(reason.program),
          )
        : m(
            '%@ saves this conversation once it has a first message. Send a message to start it.',
            chatName(reason.program),
          );
    case 'compressed':
      return m("Codex compressed this conversation's rollout, which Chat can't read.");
    case 'mismatched':
      return m("The transcript under this session's name holds another conversation.");
    case 'unsupportedFormat':
      return m("Chat can't read %@.", reason.format);
    case 'sessionStore':
      return (
        programDefinition(reason.program).storeProblem?.(reason.problem) ??
        m("herdr reports a session Chat doesn't read.")
      );
    case 'startScreen':
      return m(
        '%@ is on its home screen, so the conversation herdr reported is no longer open there. Open a conversation in the terminal, or send a first message there to start one. Chat follows it once herdr reports it.',
        chatName(reason.program),
      );
  }
}

/**
 * One line for a banner over the timeline. `showingSavedMessages` is false when the timeline holds
 * only messages sent from this device, as with a new conversation whose transcript isn't written yet.
 */
export function reasonBannerText(
  reason: ChatUnavailableReason,
  showingSavedMessages: boolean,
): Message {
  const saved = (withSaved: string, without: string, ...args: string[]) =>
    showingSavedMessages ? m(withSaved, ...args) : m(without, ...args);
  switch (reason.kind) {
    case 'noSession':
      return m('Waiting for the Agent to report its conversation.');
    case 'awaitingFirstMessage':
      return writesNewConversationWithFirstReply(reason.program)
        ? m('%@ saves this conversation after its first reply.', chatName(reason.program))
        : m('%@ saves this conversation once it has a first message.', chatName(reason.program));
    case 'unidentifiedSession':
    case 'unreadableProgram':
    case 'unsupportedSession':
      return saved(
        "Chat can't follow this conversation now. Showing saved messages.",
        "Chat can't follow this conversation now.",
      );
    case 'notFound':
      return saved(
        "The transcript isn't on the Host any more. Showing saved messages.",
        "Agentico hasn't found this conversation's transcript yet.",
      );
    case 'mismatched':
      return saved(
        "The transcript under this session's name holds another conversation. Showing saved messages.",
        "The transcript under this session's name holds another conversation.",
      );
    case 'compressed':
    case 'unsupportedFormat':
      return saved(
        "Chat can't read this transcript now. Showing saved messages.",
        "Chat can't read this transcript now.",
      );
    case 'sessionStore':
      return saved(
        "Chat can't read this conversation from %@'s database now. Showing saved messages.",
        "Chat can't read this conversation from %@'s database now.",
        chatName(reason.program),
      );
    // Never over the timeline, which this reason hides.
    case 'startScreen':
      return m('%@ is on its home screen.', chatName(reason.program));
  }
}

/** Whether looking again could find something the user may have fixed. */
export function reasonOffersRetry(reason: ChatUnavailableReason): boolean {
  switch (reason.kind) {
    case 'noSession':
    case 'notFound':
    case 'mismatched':
    case 'startScreen':
      return true;
    case 'sessionStore':
      return problemIsRetryable(reason.problem);
    default:
      return false;
  }
}

export const isAwaitingFirstMessage = (reason: ChatUnavailableReason): boolean =>
  reason.kind === 'awaitingFirstMessage';

/** Whether Chat waits for the program rather than the user: its banner shows progress and offers nothing. */
export const reasonIsWaiting = (reason: ChatUnavailableReason): boolean =>
  reason.kind === 'noSession' || reason.kind === 'awaitingFirstMessage';
