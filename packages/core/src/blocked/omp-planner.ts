// Oh My Pi's keys for a card action (Swift OMPDialogPlanner). OMP binds no digits to its panels, so
// no plan sends one; a list row is reached by arrow keys, each checked.

import { message } from '../errors/text';
import {
  type ConfirmationRule,
  type DialogAction,
  type DialogActionPlan,
  type DialogStep,
  makePlan,
  refuse,
} from './plan-types';
import { StepBuilder } from './step-builder';
import { type BlockedDialog, type DialogOption, optionAt } from './types';

const UNBLOCKED: ConfirmationRule = { kind: 'fingerprintChangeOrUnblocked' };

const unsupported = (key: string): never => refuse({ kind: 'unsupported', reason: message(key) });

const deny = (): DialogActionPlan => makePlan([{ kind: 'keys', keys: ['esc'] }], UNBLOCKED);

export function planOmpAction(
  dialog: BlockedDialog,
  action: DialogAction,
  toolUseID: string | null,
): DialogActionPlan {
  switch (dialog.kind) {
    case 'ompApproval':
      return approval(dialog, action);
    case 'ompQuestion':
    case 'ompQuestionReview':
      return question(dialog, action, toolUseID);
    default:
      return unsupported('Not an Oh My Pi dialog.');
  }
}

const optionOf = (dialog: BlockedDialog, ordinal: number): DialogOption =>
  optionAt(dialog, ordinal) ?? refuse({ kind: 'noSuchOption', ordinal });

/**
 * ctrl+q approves once, whichever row has focus; ctrl+enter reads as Enter without kitty keys. Esc
 * denies, and OMP goes on with the turn, so the Composer keeps its focus. Oh My Pi 18.12's session
 * approval has no key of its own: one arrow key per row to it, each checked, then Enter. While the
 * prompt holds a draft, arrow keys and Enter go to the draft, so only Approve and Deny go. Leaving
 * Blocked confirms any of them.
 */
function approval(dialog: BlockedDialog, action: DialogAction): DialogActionPlan {
  switch (action.kind) {
    case 'choose': {
      const option = optionOf(dialog, action.ordinal);
      switch (option.role) {
        case 'approve':
          return makePlan([{ kind: 'keys', keys: ['ctrl+q'] }], UNBLOCKED);
        case 'approvePersistent': {
          if (dialog.focus.composerDraftGuard) {
            return unsupported(
              "Oh My Pi's input box holds a draft, which would take the arrow keys. Clear it in the terminal to approve for the session.",
            );
          }
          const builder = new StepBuilder(dialog);
          builder.press(option);
          return makePlan(builder.steps, UNBLOCKED);
        }
        case 'decline':
          return deny();
        default:
          return refuse({ kind: 'noSuchOption', ordinal: action.ordinal });
      }
    }
    case 'dismiss':
      return deny();
    case 'amend':
    case 'respond':
    case 'approvePlan':
      return unsupported('Oh My Pi takes no note with an approval.');
    default:
      return unsupported('The approval has no such action.');
  }
}

const TYPED_ANSWER =
  "Agentico doesn't type into Oh My Pi's questions. Write your own answer or a note in the terminal.";

/**
 * Digits do nothing on a question: one arrow key per row, each checked, then Enter, which answers
 * and turns to the next tab, or submits on the review page. Esc cancels the question and ends the
 * turn. While the prompt below holds a draft, every key but Esc goes to the draft.
 */
function question(
  dialog: BlockedDialog,
  action: DialogAction,
  toolUseID: string | null,
): DialogActionPlan {
  const confirmation: ConfirmationRule =
    toolUseID === null ? UNBLOCKED : { kind: 'toolResult', id: toolUseID };
  if (action.kind === 'dismiss') {
    return makePlan([{ kind: 'keys', keys: ['esc'] }], confirmation);
  }
  if (dialog.focus.composerDraftGuard) return refuse({ kind: 'composerDraft' });
  switch (action.kind) {
    case 'choose': {
      const option = optionOf(dialog, action.ordinal);
      switch (option.role) {
        case 'answer':
        case 'submit': {
          const builder = new StepBuilder(dialog);
          builder.press(option);
          if (option.role === 'answer') builder.append(pageTurn(dialog));
          return makePlan(builder.steps, confirmation);
        }
        case 'otherText':
          return unsupported(TYPED_ANSWER);
        default:
          return refuse({ kind: 'noSuchOption', ordinal: action.ordinal });
      }
    }
    case 'respond':
    case 'amend':
      return unsupported(TYPED_ANSWER);
    default:
      return unsupported('The question has no such action.');
  }
}

/** Answering a tab shows the next one, and after the last the review. */
function pageTurn(dialog: BlockedDialog): DialogStep[] {
  const headers = dialog.subject.questionHeaders;
  const current = dialog.progress;
  if (dialog.kind !== 'ompQuestion' || headers.length <= 1 || current === null) return [];
  const index = headers.indexOf(current);
  if (index < 0) return [];
  const next = headers[index + 1] ?? 'Review answers';
  return [{ kind: 'expect', expectation: { kind: 'page', page: next } }];
}
