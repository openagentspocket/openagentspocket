// Chat's reading of the Composer's messages (Swift ChatComposerEchoes, ADR 0024): what the send
// tracker matches against the transcript, and the echoes still to show below it. Messages the
// terminal sent are not Chat's and never echo.

import type { ComposerMessage } from '../../composer/progress';
import { renderText } from '../../errors/text';
import type { ChatPendingEcho, ChatPendingEchoState } from '../timeline/row';
import type { SendRules } from './rules';

/** A message in Chat's Composer, as the tracker matches it against the prompts the transcript records. */
export interface SentMessage {
  readonly id: string;
  /** What herdr typed: the draft after Chat's rewrite. */
  readonly text: string;
  /** `agent.prompt` took it, so the program may record it. */
  readonly isDelivered: boolean;
}

/** Where a sent message stands against the transcript. */
export type SendStatus =
  | { readonly kind: 'awaiting' }
  /** The transcript recorded it; its entry replaces the echo. */
  | { readonly kind: 'recorded' }
  /** Still unrecorded once its echo clock reaches the echo timeout. */
  | { readonly kind: 'overdue' }
  /** Unrecorded, and its text sits in the idle Agent's input box: a steer Stop handed back. */
  | { readonly kind: 'returned' }
  /** Returned, then gone from the input box without the transcript recording it. */
  | { readonly kind: 'discarded' }
  /** Overdue, and the program said on screen that it would not do it. */
  | { readonly kind: 'refused'; readonly reason: string }
  /** Unrecorded, and the program's prompt log names one other session as the one that took it. */
  | { readonly kind: 'misdirected' }
  /** Unrecorded and no longer worth an echo. */
  | { readonly kind: 'abandoned' };

export const sendStatusIs = (status: SendStatus | undefined, kind: SendStatus['kind']): boolean =>
  status?.kind === kind;

/** Chat's messages as herdr typed them: `rules` rewrites each one the way Send did. */
export function sentMessages(
  messages: readonly ComposerMessage[],
  rules: Pick<SendRules, 'outgoingText'>,
): SentMessage[] {
  const sent: SentMessage[] = [];
  for (const message of messages) {
    if (message.route !== 'chat') continue;
    const isDelivered = message.state.kind === 'delivered' || message.state.kind === 'undelivered';
    sent.push({ id: message.id, text: rules.outgoingText(message.text), isDelivered });
  }
  return sent;
}

/**
 * The echoes below the transcript. A message the transcript recorded gives way to its entry, and a
 * failure shows only while it is Chat's latest message, the one the Composer offers to retry. So
 * does a send the user cleared from the Agent's input box. A send the program refused says what it
 * said instead.
 */
export function pendingEchoes(
  messages: readonly ComposerMessage[],
  statuses: ReadonlyMap<string, SendStatus>,
): ChatPendingEcho[] {
  const chatMessages = messages.filter((message) => message.route === 'chat');
  const latest = chatMessages[chatMessages.length - 1]?.id;
  const echoes: ChatPendingEcho[] = [];
  for (const message of chatMessages) {
    const status = statuses.get(message.id);
    if (status?.kind === 'recorded' || status?.kind === 'abandoned') continue;
    if (status?.kind === 'discarded' && message.id !== latest) continue;
    let state: ChatPendingEchoState;
    switch (message.state.kind) {
      case 'sending':
        state = { kind: 'sending' };
        break;
      case 'delivered': {
        // Unknown to the tracker: sent before this Chat was watching.
        if (!status) continue;
        state = deliveredState(status);
        break;
      }
      case 'undelivered': {
        // The tracker's later look at the input box, or the program's own log of what it took,
        // outranks the check after the send.
        if (!status) continue;
        state =
          status.kind === 'discarded'
            ? { kind: 'discarded' }
            : status.kind === 'misdirected'
              ? { kind: 'misdirected' }
              : { kind: 'notDelivered' };
        break;
      }
      case 'failed':
        if (message.id !== latest) continue;
        state = { kind: 'failed', reason: renderText(message.state.text) };
        break;
    }
    echoes.push({ id: message.id, text: message.text, state });
  }
  return echoes;
}

function deliveredState(status: SendStatus): ChatPendingEchoState {
  switch (status.kind) {
    case 'overdue':
      return { kind: 'unconfirmed' };
    case 'returned':
      return { kind: 'notDelivered' };
    case 'discarded':
      return { kind: 'discarded' };
    case 'refused':
      return { kind: 'refused', reason: status.reason };
    case 'misdirected':
      return { kind: 'misdirected' };
    default:
      return { kind: 'sent' };
  }
}
