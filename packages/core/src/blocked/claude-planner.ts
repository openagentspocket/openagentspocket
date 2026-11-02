import { message } from '../errors/text';
import {
  type ConfirmationRule,
  type DialogAction,
  type DialogActionPlan,
  type DialogStep,
  makePlan,
  refuse,
} from './plan-types';
import { digitKey, fieldText, hasTypedText, StepBuilder } from './step-builder';
import { type BlockedDialog, type DialogOption, optionAt } from './types';

/**
 * Plans Claude's cards. A matched request (`toolUseID`) confirms by its `tool_result`; without
 * one the card confirms by the dialog leaving the screen. Nothing here ever plans a resend.
 */
export function planClaudeAction(
  dialog: BlockedDialog,
  action: DialogAction,
  toolUseID: string | null,
): DialogActionPlan {
  return new ClaudePlanner(dialog, toolUseID).plan(action);
}

class ClaudePlanner {
  constructor(
    private readonly dialog: BlockedDialog,
    private readonly toolUseID: string | null,
  ) {}

  private get confirmation(): ConfirmationRule {
    return this.toolUseID === null
      ? { kind: 'fingerprintChange' }
      : { kind: 'toolResult', id: this.toolUseID };
  }

  private get isMultiSelect(): boolean {
    return (
      this.dialog.kind === 'claudeQuestion' &&
      this.dialog.options.some((option) => option.role === 'next')
    );
  }

  plan(action: DialogAction): DialogActionPlan {
    switch (action.kind) {
      case 'dismiss':
        // Esc cancels rather than submits, so it goes through even when a field holds text.
        return makePlan([{ kind: 'keys', keys: ['esc'] }], this.confirmation);
      case 'choose':
        return this.choose(action.ordinal);
      case 'amend':
        return this.amend(action.ordinal, action.note);
      case 'respond':
        return this.respond(action.ordinal, action.text, 'enter');
      case 'approvePlan':
        return this.approvePlan(action.note);
      case 'submitSelection':
        return this.submitSelection(action.ordinals);
      default:
        return refuse({ kind: 'unsupported', reason: message('Only Codex queues questions.') });
    }
  }

  private option(ordinal: number): DialogOption {
    return optionAt(this.dialog, ordinal) ?? refuse({ kind: 'noSuchOption', ordinal });
  }

  private choose(ordinal: number): DialogActionPlan {
    const option = this.option(ordinal);
    if (hasTypedText(this.dialog)) return refuse({ kind: 'textFieldNotEmpty' });
    const builder = new StepBuilder(this.dialog);
    if (option.role === 'otherText') return refuse({ kind: 'needsText' });
    if (option.role === 'answer' && this.isMultiSelect) {
      return refuse({
        kind: 'unsupported',
        reason: message('A multi-select question takes its answers as a set.'),
      });
    }
    if (option.role === 'next') {
      builder.move(ordinal);
      builder.keys('enter');
      builder.append(this.pageTurn());
    } else if (option.role === 'answer') {
      builder.press(option);
      builder.append(this.pageTurn());
    } else {
      builder.press(option);
    }
    return makePlan(builder.steps, this.confirmation);
  }

  /** Tab on a `Yes` or `No` row opens its note field. */
  private amend(ordinal: number, note: string): DialogActionPlan {
    const { dialog } = this;
    if (
      !['claudeBash', 'claudeFileEdit', 'claudeFileCreate', 'claudeFileRead'].includes(dialog.kind)
    ) {
      return refuse({
        kind: 'unsupported',
        reason: message("Only Claude's Bash and file dialogs take a note with the answer."),
      });
    }
    const option = this.option(ordinal);
    if (option.role !== 'approve' && option.role !== 'decline') {
      return refuse({
        kind: 'unsupported',
        reason: message('Only the Yes and No rows take a note.'),
      });
    }
    const text = fieldText(note);
    if (hasTypedText(dialog)) return refuse({ kind: 'textFieldNotEmpty' });
    const builder = new StepBuilder(dialog);
    // A row already turned into an empty note field skips the Tab.
    if (dialog.focus.feedbackOrdinal !== ordinal) {
      builder.move(ordinal);
      builder.keys('tab');
      builder.expect({ kind: 'feedbackMode', ordinal });
    }
    builder.paste(text);
    builder.expect({ kind: 'inputText', text });
    builder.keys('enter');
    return makePlan(builder.steps, this.confirmation);
  }

  private respond(ordinal: number, text: string, submitKey: string): DialogActionPlan {
    const option = this.option(ordinal);
    if (option.role !== 'otherText' || option.input === null) {
      return refuse({
        kind: 'unsupported',
        reason: message('Option %lld is not a text field.', String(ordinal)),
      });
    }
    if (this.isMultiSelect) {
      return refuse({
        kind: 'unsupported',
        reason: message("Agentico does not type into a multi-select question's Other row."),
      });
    }
    const typed = fieldText(text);
    if (hasTypedText(this.dialog)) return refuse({ kind: 'textFieldNotEmpty' });
    const builder = new StepBuilder(this.dialog);
    builder.focusField(option);
    builder.paste(typed);
    builder.expect({ kind: 'inputText', text: typed });
    builder.keys(submitKey);
    if (submitKey === 'enter') builder.append(this.pageTurn());
    return makePlan(builder.steps, this.confirmation);
  }

  /** shift+tab in the plan's feedback row approves with the note, taking the first approval. */
  private approvePlan(note: string): DialogActionPlan {
    const field = [...this.dialog.options].reverse().find((option) => option.role === 'otherText');
    if (
      this.dialog.kind !== 'claudePlan' ||
      !field ||
      !field.detail?.startsWith('shift+tab to approve')
    ) {
      return refuse({
        kind: 'unsupported',
        reason: message('This dialog does not offer approving with feedback.'),
      });
    }
    return this.respond(field.ordinal, note, 'shift+tab');
  }

  /** Toggles answers by digit (focus stays put), then moves to the page's button and presses Enter. */
  private submitSelection(selection: readonly number[]): DialogActionPlan {
    const { dialog } = this;
    const button = dialog.options.find((option) => option.role === 'next');
    if (!this.isMultiSelect || !button) {
      return refuse({
        kind: 'unsupported',
        reason: message('Only a multi-select question takes a set of answers.'),
      });
    }
    const ordinals = new Set(selection);
    if (ordinals.size === 0) return refuse({ kind: 'emptySelection' });
    for (const ordinal of [...ordinals].sort((a, b) => a - b)) {
      const option = this.option(ordinal);
      if (option.role !== 'answer') {
        return refuse({
          kind: 'unsupported',
          reason: message('Option %lld is not an answer Agentico can check.', String(ordinal)),
        });
      }
    }
    if (hasTypedText(dialog)) return refuse({ kind: 'textFieldNotEmpty' });
    if (dialog.options.some((option) => option.role === 'otherText' && option.isChecked === true)) {
      return refuse({
        kind: 'unsupported',
        reason: message('The typed answer is checked; finish it in the terminal.'),
      });
    }
    const builder = new StepBuilder(dialog);
    builder.leaveField();
    const checked = new Set(dialog.focus.checked);
    for (const option of dialog.options) {
      if (
        option.role !== 'answer' ||
        ordinals.has(option.ordinal) === checked.has(option.ordinal)
      ) {
        continue;
      }
      const digit = digitKey(option.number);
      if (digit === null) {
        return refuse({
          kind: 'unsupported',
          reason: message('Option %lld has no digit key.', String(option.ordinal)),
        });
      }
      if (checked.has(option.ordinal)) checked.delete(option.ordinal);
      else checked.add(option.ordinal);
      builder.keys(digit);
      builder.expect({ kind: 'checked', ordinals: [...checked].sort((a, b) => a - b) });
    }
    builder.move(button.ordinal);
    builder.keys('enter');
    builder.append(this.pageTurn());
    return makePlan(builder.steps, this.confirmation);
  }

  /** Answering a page of several questions shows the next question, then the review page. */
  private pageTurn(): DialogStep[] {
    const { dialog } = this;
    const headers = dialog.subject.questionHeaders;
    const current = dialog.progress;
    if (dialog.kind !== 'claudeQuestion' || headers.length <= 1 || current === null) return [];
    const index = headers.indexOf(current);
    if (index < 0) return [];
    const next = headers[index + 1] ?? 'Review your answers';
    return [{ kind: 'expect', expectation: { kind: 'page', page: next } }];
  }
}
