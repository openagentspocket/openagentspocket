import { message } from '../errors/text';
import {
  type DialogAction,
  type DialogActionPlan,
  type DialogStep,
  makePlan,
  refuse,
} from './plan-types';
import { fieldText, StepBuilder } from './step-builder';
import { type BlockedDialog, type DialogOption, optionAt } from './types';

const UNBLOCKED: { readonly kind: 'fingerprintChangeOrUnblocked' } = {
  kind: 'fingerprintChangeOrUnblocked',
};

const unsupported = (key: string) => refuse({ kind: 'unsupported', reason: message(key) });

/** Plans Codex's cards; Codex ignores the matched request, so there is no `toolUseID`. */
export function planCodexAction(dialog: BlockedDialog, action: DialogAction): DialogActionPlan {
  const option = (ordinal: number): DialogOption =>
    optionAt(dialog, ordinal) ?? refuse({ kind: 'noSuchOption', ordinal });
  switch (dialog.kind) {
    case 'codexExec':
    case 'codexPatch':
    case 'codexNetwork':
      return approval(dialog, action, option);
    case 'codexQuestion':
      return question(dialog, action, option);
    case 'codexAsyncCollapsed':
      return collapsedQuestions(action);
    case 'codexAsyncQuestion':
      return asyncQuestion(dialog, action, option);
    default:
      return unsupported('Not a Codex dialog.');
  }
}

type OptionLookup = (ordinal: number) => DialogOption;

/** A digit acts at once. Declining ends the turn and Codex waits in the composer. */
function approval(
  dialog: BlockedDialog,
  action: DialogAction,
  option: OptionLookup,
): DialogActionPlan {
  switch (action.kind) {
    case 'choose': {
      const chosen = option(action.ordinal);
      const builder = new StepBuilder(dialog);
      builder.press(chosen);
      return makePlan(builder.steps, UNBLOCKED, chosen.role === 'decline');
    }
    case 'dismiss':
      return makePlan([{ kind: 'keys', keys: ['esc'] }], UNBLOCKED, true);
    case 'amend':
    case 'respond':
    case 'approvePlan':
      return unsupported(
        'Codex ignores text on approvals; decline, then tell Codex in the composer.',
      );
    default:
      return unsupported('The approval has no such action.');
  }
}

/**
 * A digit answers and moves to the next question. Tab opens the highlighted option's notes; with
 * notes open, keys go to the notes instead, and Esc clears them.
 */
function question(
  dialog: BlockedDialog,
  action: DialogAction,
  option: OptionLookup,
): DialogActionPlan {
  const notes = dialog.focus.notesText;
  if (notes !== null && notes !== '') return refuse({ kind: 'textFieldNotEmpty' });
  switch (action.kind) {
    case 'choose': {
      const chosen = option(action.ordinal);
      if (notes !== null)
        return unsupported("Codex's notes field is open, so keys would be typed into it.");
      const builder = new StepBuilder(dialog);
      builder.press(chosen);
      builder.append(nextQuestion(dialog));
      return makePlan(builder.steps, UNBLOCKED);
    }
    case 'respond': {
      const chosen = option(action.ordinal);
      if (chosen.role !== 'otherText') {
        return unsupported('Agentico adds notes only to None of the above.');
      }
      const text = fieldText(action.text);
      const builder = new StepBuilder(dialog);
      if (notes !== null) {
        // The open notes belong to the highlighted option.
        if (dialog.focus.focusedOrdinal !== action.ordinal) {
          return unsupported("Codex's notes field is open on another option.");
        }
      } else {
        builder.move(action.ordinal);
        // Codex 0.162.1 drops a paste while the options have focus, so Tab opens the notes first.
        builder.keys('tab');
        builder.expect({ kind: 'notes', text: '' });
      }
      builder.paste(text);
      builder.expect({ kind: 'notes', text });
      builder.keys('enter');
      builder.append(nextQuestion(dialog));
      return makePlan(builder.steps, UNBLOCKED);
    }
    case 'dismiss':
      if (notes !== null)
        return unsupported("Esc would clear Codex's notes rather than interrupt.");
      return makePlan([{ kind: 'keys', keys: ['esc'] }], UNBLOCKED, true);
    default:
      return unsupported('The question has no such action.');
  }
}

/** `? N questions` above the composer: shift+left opens them; Esc interrupts the running turn. */
function collapsedQuestions(action: DialogAction): DialogActionPlan {
  switch (action.kind) {
    case 'expandQuestions':
      return makePlan([{ kind: 'keys', keys: ['shift+left'] }], { kind: 'fingerprintChange' });
    case 'dismiss':
      return makePlan([{ kind: 'keys', keys: ['esc'] }], UNBLOCKED, true);
    default:
      return unsupported('Open the questions first.');
  }
}

/** A digit queues the answer, which Codex sends after the next tool call; ctrl+] skips it. */
function asyncQuestion(
  dialog: BlockedDialog,
  action: DialogAction,
  option: OptionLookup,
): DialogActionPlan {
  switch (action.kind) {
    case 'choose': {
      const chosen = option(action.ordinal);
      if (chosen.role !== 'answer')
        return unsupported("Agentico does not answer with Codex's Other yet.");
      const builder = new StepBuilder(dialog);
      builder.press(chosen);
      return makePlan(builder.steps, { kind: 'queuedNotice', title: dialog.title });
    }
    case 'skipQuestion':
      return makePlan([{ kind: 'keys', keys: ['ctrl+]'] }], UNBLOCKED);
    default:
      return unsupported('Codex offers only an answer or a skip here.');
  }
}

/** `Question i/n` turns to `Question i+1/n` while questions remain. */
function nextQuestion(dialog: BlockedDialog): DialogStep[] {
  const progress = dialog.progress;
  if (progress === null || !progress.startsWith('Question ')) return [];
  const numbers = progress
    .slice('Question '.length)
    .split('/')
    .filter((part) => part !== '')
    .map((part) => (/^[+-]?\d+$/.test(part) ? Number(part) : null))
    .filter((value): value is number => value !== null);
  const [current, total] = numbers;
  if (numbers.length !== 2 || current === undefined || total === undefined || current >= total) {
    return [];
  }
  return [
    { kind: 'expect', expectation: { kind: 'page', page: `Question ${current + 1}/${total}` } },
  ];
}
