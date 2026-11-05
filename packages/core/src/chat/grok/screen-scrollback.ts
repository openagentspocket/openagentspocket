// The scrollback of a Grok Build screen (Swift GrokScreen): user rows, the Session line, minimal mode.

import { withoutScrollbar } from '../../blocked/grok-screen';
import {
  normalizedSpaces,
  rowIndent,
  type ScreenRow,
  trimBlanks,
  trimmedText,
} from '../../blocked/screen';
import type { GrokSessionLine, GrokUserRow } from './screen';

/** Which rows lie inside a box: rows that begin with `│` or `┃`, and everything from a `╭` or `┌` top through its `╰` or `└` bottom. */
export function boxedRows(rows: readonly ScreenRow[]): boolean[] {
  let open = false;
  return rows.map((row) => {
    const text = trimmedText(row);
    if (text.startsWith('╭') || text.startsWith('┌')) {
      open = true;
      return true;
    }
    if (text.startsWith('╰') || text.startsWith('└')) {
      open = false;
      return true;
    }
    return open || text.startsWith('│') || text.startsWith('┃');
  });
}

const USER_ROW_TIMES = [
  /\s{2,}\d{1,2}:\d{2}\s?[AP]M\s*$/u,
  /\s{2,}\d{2}:\d{2}:\d{2} \| [A-Z][a-z]{2} \d{1,2}\s*$/u,
];

/**
 * Rows outside boxes that begin `❯ ` at a three- to six-column indent, never the composer's or a
 * queued item's, without the row's time (either form) and the scrollbar.
 */
export function readUserRows(rows: readonly ScreenRow[], boxed: readonly boolean[]): GrokUserRow[] {
  const result: GrokUserRow[] = [];
  rows.forEach((row, index) => {
    const text = normalizedSpaces(row.text);
    const lead = /^ {3,6}❯ /u.exec(text);
    if (boxed[index] || !text.includes('❯') || lead === null) return;
    let rest = withoutScrollbar(text.slice(lead[0].length));
    for (const time of USER_ROW_TIMES) {
      const match = time.exec(rest);
      if (match === null) continue;
      rest = rest.slice(0, match.index);
      break;
    }
    result.push({ text: trimBlanks(rest) });
  });
  return result;
}

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const SESSION_LINE = new RegExp(
  `^Session${UUID}(\\(forkedfrom${UUID}\\))?(,use/|foundlocally)`,
  'u',
);
/** The most rows a Session line wraps onto below its first. */
const SESSION_LINE_WRAPS = 4;

/**
 * The bottom-most row outside boxes that, joined with the rows that wrap it, reads as a Session
 * line. Whitespace goes before matching, so assistant text that merely starts with an id never
 * matches.
 */
export function readSessionLine(
  rows: readonly ScreenRow[],
  boxed: readonly boolean[],
): GrokSessionLine | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index] as ScreenRow;
    if (boxed[index] || !trimmedText(row).startsWith('Session')) continue;
    const first = withoutScrollbar(trimmedText(row));
    const indent = rowIndent(row);
    if (!(first === 'Session' || first.startsWith('Session ')) || indent === null) continue;
    let joined = first;
    for (
      let next = index + 1;
      next < Math.min(rows.length, index + 1 + SESSION_LINE_WRAPS);
      next += 1
    ) {
      const nextRow = rows[next] as ScreenRow;
      const text = withoutScrollbar(trimmedText(nextRow));
      const lead = [...text][0];
      if (
        boxed[next] ||
        rowIndent(nextRow) !== indent ||
        lead === undefined ||
        !(/[\p{L}\p{N}]/u.test(lead) || '(),-/'.includes(lead)) ||
        text.startsWith('Session')
      ) {
        break;
      }
      joined += text;
    }
    const squeezed = [...joined].filter((character) => !/\s/u.test(character)).join('');
    if (!SESSION_LINE.test(squeezed)) continue;
    return { sessionID: squeezed.slice('Session'.length, 'Session'.length + 36).toLowerCase() };
  }
  return null;
}
