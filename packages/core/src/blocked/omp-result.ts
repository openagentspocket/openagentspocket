// What the Oh My Pi parser builds its results from (Swift OMPDialogParser's helpers): the row without
// its focus pointer, a dialog result, and the excerpt of a panel the card does not know.

import type { message } from '../errors/text';
import { dialogFingerprint, excerptFingerprint } from './fingerprint';
import { displayLinesOf } from './omp-display';
import type { OmpPanel } from './omp-panel';
import { type AnsiScreen, isBlankChar, trimBlanks } from './screen';
import {
  type BlockedDialog,
  type BlockedDialogKind,
  type DialogOption,
  type DialogParseResult,
  type DialogSubject,
  makeFocus,
} from './types';

const POINTERS: ReadonlySet<string> = new Set(['\u{F054}', '❯', '>']);

export const chars = (text: string): string[] => [...text];

/** The row without its focus pointer, and whether it had one. */
export function pointed(text: string): { rest: string; isFocused: boolean } | null {
  const [first] = chars(text);
  if (first === undefined) return null;
  if (!POINTERS.has(first)) return { rest: text, isFocused: false };
  const rest = chars(text).slice(1);
  const space = rest[0];
  if (space === undefined || !isBlankChar(space)) return null;
  return { rest: trimBlanks(rest.join('')), isFocused: true };
}

export function dialogResult(
  panel: OmpPanel,
  kind: BlockedDialogKind,
  title: string,
  body: string[],
  progress: string | null,
  options: DialogOption[],
  focusedOrdinal: number | null,
  isGuarded: boolean,
  subject: DialogSubject,
): DialogParseResult {
  const dialog: BlockedDialog = {
    kind,
    program: 'omp',
    title,
    sourceSuffix: null,
    positionLabel: null,
    body,
    progress,
    options,
    rows: panel.rows,
    fingerprint: dialogFingerprint({
      program: 'omp',
      kind,
      title,
      sourceSuffix: null,
      body,
      progress,
      options,
    }),
    focus: makeFocus({ focusedOrdinal, composerDraftGuard: isGuarded }),
    subject,
    note: null,
  };
  return { kind: 'dialog', dialog };
}

/**
 * The panel's rows verbatim. The fingerprint leaves out the key hints, which change with the
 * prompt's draft, and the focus pointer.
 */
export function unrecognized(
  panel: OmpPanel,
  screen: AnsiScreen,
  reason: ReturnType<typeof message>,
): DialogParseResult {
  const sections = panel.sections.length > 1 ? panel.sections.slice(0, -1) : panel.sections;
  const content = sections.flat().map((line) => line.text);
  const unpointed = content.map((row) => {
    const characters = chars(row);
    let start = 0;
    while (
      start < characters.length &&
      (characters[start] === '\u{F054}' ||
        characters[start] === '❯' ||
        isBlankChar(characters[start] as string))
    ) {
      start += 1;
    }
    return characters.slice(start).join('');
  });
  return {
    kind: 'unrecognized',
    excerpt: {
      rows: screen.rows.slice(panel.rows.lowerBound, panel.rows.upperBound),
      numbered: new Map(),
      reason,
      fingerprint: excerptFingerprint('omp', [panel.title ?? '', ...unpointed]),
      displayLines: displayLinesOf(panel),
    },
  };
}
