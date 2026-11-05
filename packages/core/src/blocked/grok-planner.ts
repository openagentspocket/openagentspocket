// Grok Build's keys for a card action (1.0.62; Swift GrokDialogPlanner). Every card binds a key to
// each row, which selects the row and submits it at once, so each plan is that one key. Nothing
// plans Esc, which only parks the keyboard in the scrollback or keeps a cancelled turn running;
// Ctrl+C, which cancels a permission or skips a question; Ctrl+Y, which hides a question
// unanswered; Ctrl+O, `e`, ← and →, which change the rule or the mode; or a letter on a permission,
// which opens the reject row's feedback field. Grok records no approval and herdr stays Blocked a
// moment after a key, so the card leaving the screen confirms it. A key selects its row wherever
// the cursor is, so only a question and the fork question, where the cursor may sit on the answer
// field, need to see it.

import { message } from '../errors/text';
import { type DialogAction, type DialogActionPlan, makePlan, refuse } from './plan-types';
import { digitKey } from './step-builder';
import { type BlockedDialog, type DialogOption, optionAt } from './types';

const unsupported = (key: string, ...args: string[]) =>
  refuse({ kind: 'unsupported', reason: message(key, ...args) });

/** The answer keys Grok binds (`question_view.rs`). */
const ANSWER_KEYS = new Set([...'123456789abcdef']);

const TYPED_ANSWER =
  "Agentico doesn't type into Grok Build's questions. Write your own answer in the terminal.";
const CURSOR_ON_FIELD =
  "Grok Build's cursor is on its answer field, where a key would be typed. Answer in the terminal.";

const plan = (key: string): DialogActionPlan =>
  makePlan([{ kind: 'keys', keys: [key] }], { kind: 'fingerprintChangeOrUnblocked' });

function press(option: DialogOption): DialogActionPlan {
  const key = digitKey(option.number);
  if (key === null) return unsupported('Option %lld has no digit key.', String(option.ordinal));
  return plan(key);
}

/** Ignored `toolUseID`: no Grok Build record answers a card. */
export function planGrokAction(dialog: BlockedDialog, action: DialogAction): DialogActionPlan {
  if (dialog.program !== 'grok') return unsupported('Not a Grok Build dialog.');
  // Esc left the keyboard in the scrollback, or a field of the card has it, where keys miss the options.
  if (dialog.focus.keysMissOptions) {
    return unsupported("Grok Build's card doesn't have focus. Answer it in the terminal.");
  }
  const option = (ordinal: number): DialogOption =>
    optionAt(dialog, ordinal) ?? refuse({ kind: 'noSuchOption', ordinal });
  switch (dialog.kind) {
    case 'grokPermission':
      return permission(dialog, action, option);
    case 'grokQuestion':
      return question(dialog, action, option);
    case 'grokCancelTurn':
      return action.kind === 'choose'
        ? press(option(action.ordinal))
        : unsupported('The panel has no such action.');
    case 'grokFork':
      return fork(dialog, action, option);
    default:
      return unsupported('Not a Grok Build dialog.');
  }
}

type OptionLookup = (ordinal: number) => DialogOption;

/** A row's digit. Stop and the folded card's Deny press the reject row, which ends the turn. */
function permission(
  dialog: BlockedDialog,
  action: DialogAction,
  option: OptionLookup,
): DialogActionPlan {
  switch (action.kind) {
    case 'choose':
      return press(option(action.ordinal));
    case 'dismiss': {
      const reject = dialog.options.find((candidate) => candidate.role === 'decline');
      if (!reject) return unsupported('The permission has no reject row.');
      return press(reject);
    }
    case 'amend':
    case 'respond':
      return unsupported(
        "Agentico doesn't type feedback into Grok Build's permissions. Add it in the terminal.",
      );
    default:
      return unsupported('The permission has no such action.');
  }
}

/**
 * An answer's key: `1` to `9`, then `a` to `f`. With the cursor on the answer field, a key would
 * be typed into it, and Agentico types nothing into a question.
 */
function question(
  dialog: BlockedDialog,
  action: DialogAction,
  option: OptionLookup,
): DialogActionPlan {
  switch (action.kind) {
    case 'choose': {
      const chosen = option(action.ordinal);
      if (chosen.role !== 'answer') return unsupported(TYPED_ANSWER);
      const focused = dialog.focus.focusedOrdinal;
      if (focused === null) {
        return unsupported(
          "Agentico can't see Grok Build's cursor, which may be on the answer field, where a key would be typed. Answer in the terminal.",
        );
      }
      if (optionAt(dialog, focused)?.role === 'otherText') return unsupported(CURSOR_ON_FIELD);
      if (chosen.shortcut === null || !ANSWER_KEYS.has(chosen.shortcut)) {
        return unsupported('Grok Build binds no key to this answer. Answer it in the terminal.');
      }
      return plan(chosen.shortcut);
    }
    case 'respond':
    case 'amend':
      return unsupported(TYPED_ANSWER);
    case 'skipQuestion':
      // Shift+X skips, unconfirmed on 1.0.62.
      return unsupported("Skip Grok Build's question in the terminal.");
    default:
      return unsupported('The question has no such action.');
  }
}

/**
 * `1` forks into a new worktree, `2` in the current directory. With the cursor on the answer field
 * a key would be typed into it; on a row Chat leaves to the terminal it still selects its own row.
 * The parser reads the fork question only with its cursor in view, so no focused option means the
 * cursor is on such a row.
 */
function fork(dialog: BlockedDialog, action: DialogAction, option: OptionLookup): DialogActionPlan {
  switch (action.kind) {
    case 'choose': {
      const chosen = option(action.ordinal);
      if (chosen.role !== 'answer') return unsupported(TYPED_ANSWER);
      const focused = dialog.focus.focusedOrdinal;
      if (focused !== null && optionAt(dialog, focused)?.role === 'otherText') {
        return unsupported(CURSOR_ON_FIELD);
      }
      return press(chosen);
    }
    case 'respond':
    case 'amend':
      return unsupported(TYPED_ANSWER);
    default:
      return unsupported('The fork question has no such action.');
  }
}
