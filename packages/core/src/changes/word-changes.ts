import type { DiffHunk } from './types';

/** Pairs of removed and added lines highlighted per block, at most. */
export const MAXIMUM_PAIRS = 20;
/** Longer lines keep the wash alone, bounding the difference's cost. */
export const MAXIMUM_TOKENS = 400;

/** A half-open range of code points into a line's text. */
export interface TextRange {
  readonly start: number;
  readonly end: number;
}

interface Token {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly isWhitespace: boolean;
}

type TokenKind = 'identifier' | 'whitespace' | 'other';

function kindOf(char: string): TokenKind {
  if (/^\s$/u.test(char)) return 'whitespace';
  return /^[\p{L}\p{N}_]$/u.test(char) ? 'identifier' : 'other';
}

/** Identifier runs, whitespace runs, and single other characters (code point offsets). */
export function tokens(text: string): Token[] {
  const chars = Array.from(text);
  const out: Token[] = [];
  let index = 0;
  while (index < chars.length) {
    const start = index;
    const kind = kindOf(chars[index] ?? '');
    index += 1;
    if (kind !== 'other') {
      while (index < chars.length && kindOf(chars[index] ?? '') === kind) index += 1;
    }
    out.push({
      text: chars.slice(start, index).join(''),
      start,
      end: index,
      isWhitespace: kind === 'whitespace',
    });
  }
  return out;
}

/** Offsets of the tokens outside a longest common subsequence, per side. */
function differences(oldTokens: readonly Token[], newTokens: readonly Token[]) {
  const rows = oldTokens.length;
  const columns = newTokens.length;
  const table: Uint16Array[] = Array.from({ length: rows + 1 }, () => new Uint16Array(columns + 1));
  for (let row = rows - 1; row >= 0; row--) {
    for (let column = columns - 1; column >= 0; column--) {
      const cell =
        oldTokens[row]?.text === newTokens[column]?.text
          ? (table[row + 1]?.[column + 1] ?? 0) + 1
          : Math.max(table[row + 1]?.[column] ?? 0, table[row]?.[column + 1] ?? 0);
      (table[row] as Uint16Array)[column] = cell;
    }
  }
  const removed = new Set<number>();
  const inserted = new Set<number>();
  let row = 0;
  let column = 0;
  while (row < rows && column < columns) {
    if (oldTokens[row]?.text === newTokens[column]?.text) {
      row += 1;
      column += 1;
    } else if ((table[row + 1]?.[column] ?? 0) >= (table[row]?.[column + 1] ?? 0)) {
      removed.add(row++);
    } else {
      inserted.add(column++);
    }
  }
  while (row < rows) removed.add(row++);
  while (column < columns) inserted.add(column++);
  return { removed, inserted };
}

/** Changed words, adjacent ones joined. Whitespace alone never highlights. */
function merged(all: readonly Token[], changed: ReadonlySet<number>): TextRange[] {
  const ranges: TextRange[] = [];
  all.forEach((token, offset) => {
    if (!changed.has(offset) || token.isWhitespace) return;
    const last = ranges.at(-1);
    if (last && last.end === token.start)
      ranges[ranges.length - 1] = { start: last.start, end: token.end };
    else ranges.push({ start: token.start, end: token.end });
  });
  return ranges;
}

/**
 * Changed words on each side of a pair, or null when it should not highlight: a pair highlights
 * only when at least half of the longer line's tokens are unchanged.
 */
export function pairRanges(
  oldText: string,
  newText: string,
): { old: TextRange[]; new: TextRange[] } | null {
  const oldTokens = tokens(oldText);
  const newTokens = tokens(newText);
  const longer = Math.max(oldTokens.length, newTokens.length);
  if (longer === 0 || longer > MAXIMUM_TOKENS) return null;
  const { removed, inserted } = differences(oldTokens, newTokens);
  const unchanged = oldTokens.length - removed.size;
  if (unchanged * 2 < longer) return null;
  return { old: merged(oldTokens, removed), new: merged(newTokens, inserted) };
}

/**
 * The words that changed inside paired removed and added lines of one hunk, per line id. Within a
 * block, removed and added lines pair in order, as Side by Side shows them, up to `MAXIMUM_PAIRS`.
 */
export function wordChangeRanges(hunk: DiffHunk): Map<number, TextRange[]> {
  const result = new Map<number, TextRange[]>();
  let removed: DiffHunk['lines'][number][] = [];
  let added: DiffHunk['lines'][number][] = [];
  const flush = () => {
    const pairs = Math.min(removed.length, added.length, MAXIMUM_PAIRS);
    for (let index = 0; index < pairs; index++) {
      const old = removed[index];
      const next = added[index];
      if (!old || !next) continue;
      const changes = pairRanges(old.text, next.text);
      if (!changes) continue;
      if (changes.old.length > 0) result.set(old.id, changes.old);
      if (changes.new.length > 0) result.set(next.id, changes.new);
    }
    removed = [];
    added = [];
  };
  for (const line of hunk.lines) {
    if (line.kind === 'context') flush();
    else if (line.kind === 'removed') {
      if (added.length > 0) flush();
      removed.push(line);
    } else added.push(line);
  }
  flush();
  return result;
}
