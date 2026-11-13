import type { ChatAgentActivity } from '../chat/model/types';

/** Which surface a Composer message was sent from; each shows only its own failures. */
export type ComposerRoute = 'terminal' | 'chat';

/** Why a draft was not sent. The text stays the user's to edit. */
export type ComposerRefusal =
  /** The Agent is waiting on a dialog; Chat answers dialogs with its own cards. */
  | { readonly kind: 'agentBlocked' }
  /** The text would make the Agent do something other than read a message. */
  | { readonly kind: 'unsafeText'; readonly reason: string }
  /**
   * A leading `/command` the menu does not offer. `terminalText` is what the Agent's terminal
   * accepts for it, with the arguments typed; `known` says the program's own command list has it.
   */
  | {
      readonly kind: 'unknownCommand';
      readonly name: string;
      readonly known: boolean;
      readonly terminalText: string;
    }
  /** A command the menu offers only while the Agent is idle. */
  | { readonly kind: 'commandAwaitsIdle'; readonly name: string }
  /** A command the menu offers, but not in the form typed. */
  | { readonly kind: 'commandUnavailable'; readonly reason: string }
  /** The Agent's input box is not in a state to take a message. */
  | { readonly kind: 'inputNotReady'; readonly reason: string };

/** The one refusal sentence the String Catalog localizes. */
export const AGENT_BLOCKED_KEY = 'The Agent is waiting for an answer. Answer it first.';

export const KNOWN_COMMAND_KEY = "%@ runs in the Agent's terminal.";
export const KNOWN_COMMAND_OPEN_KEY =
  "%@ runs in the Agent's terminal. Open the terminal to run it.";
export const UNKNOWN_COMMAND_KEY =
  "The app can't tell what %@ does. Run it in the Agent's terminal.";
export const UNKNOWN_COMMAND_OPEN_KEY =
  "The app can't tell what %@ does. Open the terminal to run it.";

/** The words a refusal shows: a catalog key with its arguments, or plain text. */
export type RefusalText = { key: string; args?: string[] } | { plain: string };

/**
 * The words a refusal shows. `terminalReachable` says whether the Composer can take the user to the
 * Agent's terminal: a command's text then offers the way, and otherwise only says to open it.
 */
export function refusalText(
  refusal: ComposerRefusal,
  options: { terminalReachable: boolean } = { terminalReachable: true },
): RefusalText {
  switch (refusal.kind) {
    case 'agentBlocked':
      return { key: AGENT_BLOCKED_KEY };
    case 'unknownCommand': {
      const args = [`/${refusal.name}`];
      const reachable = options.terminalReachable;
      if (refusal.known)
        return { key: reachable ? KNOWN_COMMAND_KEY : KNOWN_COMMAND_OPEN_KEY, args };
      return { key: reachable ? UNKNOWN_COMMAND_KEY : UNKNOWN_COMMAND_OPEN_KEY, args };
    }
    case 'commandAwaitsIdle':
      return { plain: `/${refusal.name} is available once the Agent is idle.` };
    default:
      return { plain: refusal.reason };
  }
}

/** What a notice's action does once the user takes it. */
export type RefusalAction =
  /** Show the Agent's terminal. */
  | { readonly kind: 'showTerminal' }
  /** Show the Agent's terminal with `text` typed in its draft; the user presses Send there. */
  | { readonly kind: 'runInTerminal'; readonly text: string };

/**
 * The way out a refusal offers, when the terminal can do what Chat declined and the Composer can
 * take the user there (`terminalReachable`).
 */
export function refusalAction(
  refusal: ComposerRefusal,
  terminalReachable: boolean,
): RefusalAction | undefined {
  if (!terminalReachable) return undefined;
  switch (refusal.kind) {
    case 'unknownCommand':
      return { kind: 'runInTerminal', text: refusal.terminalText };
    case 'commandAwaitsIdle':
    case 'commandUnavailable':
      return undefined;
    default:
      return { kind: 'showTerminal' };
  }
}

/** What herdr's Agent Status says about the Agent's turn (done reads as idle). */
export function chatActivityOf(status: string): ChatAgentActivity {
  switch (status) {
    case 'idle':
    case 'done':
      return 'idle';
    case 'working':
    case 'blocked':
      return status;
    default:
      return 'unknown';
  }
}

/**
 * Whether the same draft may go once Agent Status becomes `status`, so the notice ends then. A
 * refusal about the Agent's state ends with the state it named; one about the input box with any
 * change, since what the box shows follows the Agent; a refusal of the text itself holds until the
 * text changes.
 */
export function refusalEndsWhenStatusBecomes(refusal: ComposerRefusal, status: string): boolean {
  switch (refusal.kind) {
    case 'agentBlocked':
      return chatActivityOf(status) !== 'blocked';
    case 'commandAwaitsIdle':
      return chatActivityOf(status) === 'idle';
    case 'inputNotReady':
      return true;
    default:
      return false;
  }
}

/**
 * How a Composer delivers a draft. The terminal's policy is the original behavior; Chat's
 * validates the text, rewrites commands for the program, checks the Agent's input box first, and
 * never touches the PTY.
 */
export interface ComposerDeliveryPolicy {
  readonly route: ComposerRoute;
  /** Terminal types a Blocked draft into the Attach PTY without Enter. */
  readonly insertsIntoAttachWhenBlocked: boolean;
  /** What `agent.prompt` sends for the typed text. */
  readonly outgoingText: (text: string) => string;
  /** Runs before the draft is cleared; a refusal keeps it as typed. */
  readonly validate: (text: string) => ComposerRefusal | undefined;
  /** Runs once the echo shows and before anything is sent; a refusal returns the text to the draft. */
  readonly preflight?: (text: string) => Promise<ComposerRefusal | undefined>;
  /** Runs after `agent.prompt` succeeds with the text it sent; false means it never left the input box. */
  readonly verify?: (text: string) => Promise<boolean>;
}

export const terminalPolicy: ComposerDeliveryPolicy = {
  route: 'terminal',
  insertsIntoAttachWhenBlocked: true,
  outgoingText: (text) => text,
  validate: () => undefined,
};

/** A refusal the Composer shows until the draft changes, a later Send goes, or the status ends it. */
export interface ComposerNotice {
  readonly refusal: ComposerRefusal;
  /** The surface that was refused; only it shows the notice. */
  readonly route: ComposerRoute;
}
