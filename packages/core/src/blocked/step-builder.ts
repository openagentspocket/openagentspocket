import { message } from '../errors/text';
import { type DialogExpectation, type DialogStep, refuse } from './plan-types';
import { trimBlanks } from './screen';
import { type BlockedDialog, type DialogOption, optionAt } from './types';

/** The key for an option number; programs bind digits 1 to 9 only. */
export function digitKey(number: number | null): string | null {
  return number !== null && number >= 1 && number <= 9 ? String(number) : null;
}

/** Collapses CRLF and lone CR to LF (a carriage return pasted in is a submit in disguise). */
const normalizeNewlines = (text: string): string =>
  text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');

const isControl = (value: number): boolean => value < 0x20 || (value >= 0x7f && value < 0xa0);

/**
 * `text` as a dialog field takes it: one line, trimmed, with no character the program would read
 * as a key. Without bracketed paste a Tab or line break would act on the dialog.
 */
export function fieldText(text: string): string {
  const normalized = normalizeNewlines(text);
  const scalars = [...normalized].map((character) => character.codePointAt(0) ?? 0);
  if (
    scalars.some(
      (value) => value === 0x0a || value === 0x0d || value === 0x2028 || value === 0x2029,
    )
  ) {
    return refuse({ kind: 'multilineText' });
  }
  if (scalars.some((value) => isControl(value))) return refuse({ kind: 'unsafeText' });
  const trimmed = trimBlanks(normalized);
  if (trimmed === '') return refuse({ kind: 'emptyText' });
  return trimmed;
}

/** Whether one of the dialog's fields holds typed text. */
export function hasTypedText(dialog: BlockedDialog): boolean {
  if (dialog.focus.notesText !== null && dialog.focus.notesText !== '') return true;
  return (
    dialog.focus.inputText !== null ||
    dialog.options.some((option) => option.input?.kind === 'text')
  );
}

export type Axis = 'vertical' | 'horizontal';

/** Collects steps while tracking where focus will be once they have run. */
export class StepBuilder {
  readonly steps: DialogStep[] = [];
  private focus: number | null;

  constructor(readonly dialog: BlockedDialog) {
    this.focus = dialog.focus.focusedOrdinal;
  }

  keys(key: string): void {
    this.steps.push({ kind: 'keys', keys: [key] });
  }

  paste(text: string): void {
    this.steps.push({ kind: 'paste', text });
  }

  expect(expectation: DialogExpectation): void {
    this.steps.push({ kind: 'expect', expectation });
  }

  append(more: readonly DialogStep[]): void {
    this.steps.push(...more);
  }

  /** One arrow key per option from the focus to `target`, each checked. */
  move(target: number, axis: Axis = 'vertical'): void {
    if (this.focus === null) refuse({ kind: 'noFocus' });
    let current = this.focus;
    while (current !== target) {
      const isForward = target > current;
      current += isForward ? 1 : -1;
      if (axis === 'vertical') this.keys(isForward ? 'down' : 'up');
      else this.keys(isForward ? 'right' : 'left');
      this.expect({ kind: 'focus', ordinal: current });
    }
    this.focus = target;
  }

  /** Steps off a focused text field, where digits would be typed rather than pressed. */
  leaveField(): void {
    const current = this.focus;
    if (current === null || !optionAt(this.dialog, current)?.input) return;
    const neighbor = current > 1 ? current - 1 : current + 1;
    if (!optionAt(this.dialog, neighbor)) {
      refuse({
        kind: 'unsupported',
        reason: message('The focused text field has no option next to it to step to.'),
      });
    }
    this.move(neighbor);
  }

  /** Presses an option: its digit, or arrow keys and Enter. */
  press(option: DialogOption): void {
    const digit = digitKey(option.number);
    if (digit !== null) {
      this.leaveField();
      this.keys(digit);
    } else {
      this.move(option.ordinal);
      this.keys('enter');
    }
  }

  /** Focuses an empty text field. Its digit only focuses it. */
  focusField(option: DialogOption): void {
    if (this.focus === option.ordinal) return;
    const digit = digitKey(option.number);
    if (digit !== null) {
      this.keys(digit);
      this.expect({ kind: 'focus', ordinal: option.ordinal });
      this.focus = option.ordinal;
    } else {
      this.move(option.ordinal);
    }
  }
}
