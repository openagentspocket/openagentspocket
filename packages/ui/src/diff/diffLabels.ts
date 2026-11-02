import type { DiffLine, SideBySideRow } from './parseUnifiedDiff';

/** The spoken head of a changed or unchanged line, from its number when it has one ("Added, line 12"). */
export type DiffLineHead = (line?: number) => string;

export interface DiffLabels {
  added: DiffLineHead;
  removed: DiffLineHead;
  unchanged: DiffLineHead;
}

/** English defaults; the i18n layer passes translations through DiffView's label props. */
export const defaultDiffLabels: DiffLabels = {
  added: (line) => (line === undefined ? 'Added' : `Added, line ${line}`),
  removed: (line) => (line === undefined ? 'Removed' : `Removed, line ${line}`),
  unchanged: (line) => (line === undefined ? 'Unchanged' : `Unchanged, line ${line}`),
};

/**
 * What a screen reader says for one line: "Added, line 12: text". The new
 * number for added and unchanged lines, the old one for removed lines. A hunk
 * header or file header reads as its own text.
 */
export function diffLineLabel(line: DiffLine, labels: DiffLabels = defaultDiffLabels): string {
  switch (line.kind) {
    case 'add':
      return `${labels.added(line.newNumber)}: ${line.text}`;
    case 'del':
      return `${labels.removed(line.oldNumber)}: ${line.text}`;
    case 'context':
      return `${labels.unchanged(line.newNumber)}: ${line.text}`;
    default:
      return line.text;
  }
}

/** A side-by-side row as one phrase: the removed line, then the added one; a context line once. */
export function diffRowLabel(row: SideBySideRow, labels: DiffLabels = defaultDiffLabels): string {
  const left = row.left ? diffLineLabel(row.left, labels) : undefined;
  const right = row.right ? diffLineLabel(row.right, labels) : undefined;
  if (left === undefined || right === undefined || row.left === row.right)
    return left ?? right ?? '';
  return `${left}${left.endsWith('.') ? ' ' : '. '}${right}`;
}
