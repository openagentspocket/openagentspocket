import { presentation } from '../errors/presentation';
import { message, type Text } from '../errors/text';
import { TransportFailure } from '../errors/transport-error';
import type { DialogPlanError, PlanResult } from './plan-types';
import type { AnsiScreen } from './screen';
import type { BlockedDialog, GenericDialogExcerpt } from './types';

/**
 * The Agent's pane as a Blocked card reads and answers it: the screen through `agent.read`, keys
 * through `agent.send_keys` and typed text through `pane.send_input`. Never the Attach PTY. Core
 * only knows this port; packages/transport adapts the herdr API to it.
 */
export interface BlockedScreenIO {
  readScreen(): Promise<AnsiScreen>;
  sendKeys(keys: readonly string[]): Promise<void>;
  paste(text: string): Promise<void>;
}

/** The card's waits, in milliseconds (Swift `BlockedCardStore.Timing`). */
export interface CardTiming {
  readonly watchMs: number;
  /** Between reads while an action checks its steps and effect. */
  readonly pollMs: number;
  readonly expectationWindowMs: number;
  readonly confirmationWindowMs: number;
  /** How long a dialog must have shown before the first key: a key sent as it draws can land before it. */
  readonly graceMs: number;
  /** Oh My Pi ignores its approve key for 500 ms after drawing; counted from before the first read. */
  readonly approvalArmMs: number;
  /** How long the Agent may be Blocked with no dialog on screen before the card says it can't read one. */
  readonly unreadableAfterMs: number;
}

export const DEFAULT_TIMING: CardTiming = {
  watchMs: 1_000,
  pollMs: 150,
  expectationWindowMs: 1_500,
  confirmationWindowMs: 3_000,
  graceMs: 150,
  approvalArmMs: 650,
  unreadableAfterMs: 2_000,
};

export type CardContent =
  | { readonly kind: 'none' }
  | { readonly kind: 'card'; readonly dialog: BlockedDialog }
  /** Something dialog-like the parsers could not name or trust: rows verbatim, a button per number. */
  | { readonly kind: 'generic'; readonly excerpt: GenericDialogExcerpt }
  /** The Agent is Blocked but its screen shows no dialog the app recognizes. */
  | { readonly kind: 'unreadable' }
  /** The conversation shows a question while herdr reports idle, and no read shows it: no keys go. */
  | { readonly kind: 'questionUnread' };

export type CardProgress =
  /** Controls answer. */
  | 'ready'
  /** Keys are going out; every control waits. */
  | 'acting'
  /** The keys went out and nothing showed their effect; only Stop acts until the screen changes. */
  | 'unconfirmed';

export interface BlockedCardState {
  readonly content: CardContent;
  readonly progress: CardProgress;
  /** Why the last action sent nothing or stopped part way. */
  readonly notice: Text | null;
  /** Bumped when an answer hands the turn back to the user (a Codex decline), so Chat focuses its Composer. */
  readonly composerFocusRequest: number;
  /** Bumped when another dialog shows: the card's identity, so a note made on one never reaches the next. */
  readonly dialogGeneration: number;
  /** Folded to a bar; a new dialog unfolds it. */
  readonly isCollapsed: boolean;
}

/** Where an open question gets its answer: nowhere yet, the card, or only the terminal. */
export type QuestionWait = 'none' | 'card' | 'terminal';

/** `content` is the card's, or null for a program without a card. */
export function questionWait(openQuestion: boolean, content: CardContent | null): QuestionWait {
  if (!openQuestion) return 'none';
  switch (content?.kind) {
    case 'none':
      return 'none';
    case 'card':
      return 'card';
    case 'generic':
      return content.excerpt.numbered.size > 0 ? 'card' : 'terminal';
    default:
      return 'terminal';
  }
}

export const INITIAL_CARD_STATE: BlockedCardState = {
  content: { kind: 'none' },
  progress: 'ready',
  notice: null,
  composerFocusRequest: 0,
  dialogGeneration: 0,
  isCollapsed: false,
};

const joined = (...parts: Text[]): Text => ({ join: parts, separator: ' ' });

export const CARD_WORDS = {
  changed: message('This prompt changed. Check it before answering.'),
  unread: message("Agentico couldn't read the Agent's screen, so nothing was sent."),
  stopped: joined(
    message("The dialog didn't respond the way Agentico expected, so it stopped."),
    message('Finish here or in the terminal.'),
  ),
  unconfirmed: message("The Agent hasn't responded yet. Answer in the terminal if it stays."),
} as const;

/** Why a card sent nothing, for the card. */
export function planErrorText(error: DialogPlanError): Text {
  switch (error.kind) {
    case 'unsupported':
      return error.reason;
    case 'noSuchOption':
      return message("That option isn't on the screen any more.");
    case 'noFocus':
      return message("Agentico can't tell which option is selected. Answer in the terminal.");
    case 'textFieldNotEmpty':
      return message(
        'The dialog holds text typed in the terminal. Finish it there; Agentico never clears it.',
      );
    case 'needsText':
      return message('Type an answer for this option first.');
    case 'emptyText':
      return message('Type something first.');
    case 'multilineText':
      return message('Use one line. A line break would answer early.');
    case 'unsafeText':
      return message('Remove tabs and control characters. The program would read them as keys.');
    case 'emptySelection':
      return message('Pick at least one answer.');
    case 'composerDraft':
      return message(
        "Oh My Pi's input box holds a draft, so keys would go into it. Press Enter in the terminal to queue it, or clear it, then answer.",
      );
  }
}

/** A key send that failed: the keys may have landed, so the card says only that. */
export function sendFailureText(error: unknown): Text {
  const prefix = message("Agentico couldn't reach the Agent, so the answer may not have gone.");
  if (!(error instanceof TransportFailure)) return prefix;
  const shown = presentation(error.error);
  const why: Text =
    shown.detail === undefined
      ? shown.summary
      : { join: [shown.summary, shown.detail], separator: ': ' };
  return { join: [prefix, { join: [why, '.'], separator: '' }], separator: ' ' };
}

/** A recognized dialog as the generic card shows it. */
export function genericExcerptOf(
  dialog: BlockedDialog,
  screen: AnsiScreen,
  reason: Text,
): GenericDialogExcerpt {
  const numbered = new Map<number, string>();
  for (const option of dialog.options) {
    if (option.number !== null) numbered.set(option.number, option.label);
  }
  return {
    rows: screen.rows.slice(dialog.rows.lowerBound, dialog.rows.upperBound),
    numbered,
    reason,
    fingerprint: dialog.fingerprint,
    displayLines: null,
  };
}

/** Nothing to plan from: the dialog the card was built for is not on screen any more. */
export const refusedAsChanged: PlanResult = {
  ok: false,
  error: { kind: 'unsupported', reason: CARD_WORDS.changed },
};
