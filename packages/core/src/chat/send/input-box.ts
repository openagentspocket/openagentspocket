// What the Agent's input box shows and what Chat may do about it (Swift InputBoxState, PreSendGate,
// DeliveryCheck). Chat delivers a message by having herdr type it and press Enter, so the box must
// be read as empty first; the check after the send tells whether Enter took it. Reading a box is a
// program's own business (`ProgramSendPolicy.readInputBox`); everything here is program-neutral.

import type { ChatAgentActivity } from '../model/types';

export type InputBoxState =
  /** Empty, showing `placeholder` when the program draws one. */
  | { readonly kind: 'empty'; readonly placeholder: string | null }
  /** A draft the user typed in the terminal. */
  | { readonly kind: 'text'; readonly text: string }
  /** Shell mode (`!`), with the command typed so far. */
  | { readonly kind: 'shellMode'; readonly command: string }
  /** Input is disabled; the program's explanation. */
  | { readonly kind: 'disabled'; readonly reason: string }
  /** A popup, picker, help view or transient hint over the box: the row that shows it. */
  | { readonly kind: 'overlay'; readonly row: string }
  /** A dialog took the box's place: its title when Chat names it in the hold. */
  | { readonly kind: 'dialog'; readonly title: string | null }
  /** No input box for this conversation is on screen: the program's reason, shown as the hold. */
  | { readonly kind: 'noComposer'; readonly reason: string }
  /** The screen does not show a box Agentico recognizes; why. */
  | { readonly kind: 'unknown'; readonly reason: string };

export const emptyBox = (placeholder: string | null = null): InputBoxState => ({
  kind: 'empty',
  placeholder,
});

/** Only an empty box is sendable, and only after positive identification. */
export const isSendable = (state: InputBoxState): boolean => state.kind === 'empty';

/** Whether Chat may type a message into the Agent's input box now. */
export type PreSendDecision =
  | { readonly kind: 'send' }
  /** herdr reports the Agent Blocked: a prompt waits for an answer. */
  | { readonly kind: 'holdBlocked' }
  /** The box is not empty, no box shows, or Agentico cannot tell. */
  | { readonly kind: 'hold'; readonly state: InputBoxState };

/** The check before Chat sends: Blocked wins over the screen, and Agentico never clears a box. */
export function preSendCheck(state: InputBoxState, activity: ChatAgentActivity): PreSendDecision {
  if (activity === 'blocked') return { kind: 'holdBlocked' };
  return isSendable(state) ? { kind: 'send' } : { kind: 'hold', state };
}

/** What a re-read after sending says about the message. */
export type DeliveryVerdict =
  /** The box emptied, or a dialog or Blocked took over: the program took the message. */
  | { readonly kind: 'delivered' }
  /** Text still sits in the box, so Enter did not submit it. Chat never resends. */
  | { readonly kind: 'notDelivered'; readonly text: string }
  /** The screen does not say; the message stays marked as sent. */
  | { readonly kind: 'unconfirmed' };

/** How long after the `agent.prompt` acknowledgement to re-read (ms). */
export const DELIVERY_CHECK_DELAY_MS = 3000;

function plainVerdict(state: InputBoxState, activity: ChatAgentActivity): DeliveryVerdict {
  if (activity === 'blocked') return { kind: 'delivered' };
  switch (state.kind) {
    case 'empty':
    case 'dialog':
      return { kind: 'delivered' };
    case 'text':
      return { kind: 'notDelivered', text: state.text };
    case 'shellMode':
      return state.command === ''
        ? { kind: 'unconfirmed' }
        : { kind: 'notDelivered', text: state.command };
    default:
      return { kind: 'unconfirmed' };
  }
}

/** The text without whitespace: the box wraps a long message across rows and trims each. */
export const squeezed = (text: string): string => text.replace(/\s/gu, '');

/**
 * The verdict for a program that may put other text in its box after taking the message
 * (`mayRefillInputBoxAfterSend`): then only text the sent message contains is the message left
 * behind, and other text says nothing. Without the sent text the verdict is the plain one.
 */
export function deliveryVerdict(
  state: InputBoxState,
  activity: ChatAgentActivity,
  options: { mayRefillAfterSend?: boolean; sent?: string | null } = {},
): DeliveryVerdict {
  const plain = plainVerdict(state, activity);
  const { sent } = options;
  if (!options.mayRefillAfterSend || sent == null || plain.kind !== 'notDelivered') return plain;
  const left = squeezed(plain.text);
  return left !== '' && squeezed(sent).includes(left) ? plain : { kind: 'unconfirmed' };
}
