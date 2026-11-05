// A declined `/compact` in Pi and Oh My Pi shows only on screen (Swift AgentChatStore
// `showsRunningCompaction` and `latestCompactionFailure`): "Error: Compaction failed: Nothing to
// compact (session too small)" with nothing recorded, so the screen is read for it.

import { isOmpStatusBand } from '../../blocked/omp-panel';
import {
  type AnsiScreen,
  type ScreenRow,
  type ScreenStyle,
  trimmedText,
} from '../../blocked/screen';
import type { CompactionScreenReader } from '../send/policy';

const COMPACTING = 'Compacting context...';
const MARKER = 'Compaction failed:';

/** Pi's countdown before it retries a failed summarization call ("Retrying (1/3) in 2s..."). */
const RETRYING = /Retrying \(\d+\/\d+\) in \d+s\.\.\./u;

/** Whether every visible run of the row is drawn in a style `matches` accepts. */
function drawn(row: ScreenRow, matches: (style: ScreenStyle) => boolean): boolean {
  const runs = row.runs.filter((run) => ![...run.text].every((c) => /\s/u.test(c)));
  return runs.length > 0 && runs.every((run) => matches(run.style));
}

/**
 * The last "Compaction failed:" row, when nothing but blank rows, the message's own wrapped rows
 * (drawn in its color: at the phone's 62 columns `small)` wraps) and Oh My Pi's dim italic session
 * title separate it from the input box (Pi's rule, Oh My Pi's box or status band). One with
 * conversation below it is an earlier attempt's.
 */
function latestFailure(screen: AnsiScreen, program: 'pi' | 'omp'): ScreenRow | null {
  const rows = screen.rows;
  let index = -1;
  for (let at = rows.length - 1; at >= 0; at -= 1) {
    if ((rows[at] as ScreenRow).text.includes(MARKER)) {
      index = at;
      break;
    }
  }
  if (index < 0) return null;
  const failure = rows[index] as ScreenRow;
  const color = failure.runs.find((run) => run.text.includes(MARKER))?.style.foreground ?? null;
  const next = rows.slice(index + 1).find((row) => {
    if (trimmedText(row) === '') return false;
    if (color !== null && drawn(row, (style) => style.foreground === color)) return false;
    return !(program === 'omp' && drawn(row, (style) => style.isDim && style.isItalic));
  });
  if (!next) return failure;
  const text = trimmedText(next);
  const isInputBox =
    [...text].every((c) => c === '─') ||
    text.startsWith('╭') ||
    (program === 'omp' && isOmpStatusBand(next));
  return isInputBox ? failure : null;
}

export function piCompaction(program: 'pi' | 'omp'): CompactionScreenReader {
  const chatName = program === 'omp' ? 'Oh My Pi' : 'Pi';
  return {
    runningRow: (text) => text.includes(COMPACTING) || RETRYING.test(text),
    latestFailure: (screen) => latestFailure(screen, program),
    refusalText: (failureRowText) =>
      failureRowText.includes('Nothing to compact')
        ? `${chatName} had nothing to compact.`
        : `${chatName} couldn't compact.`,
  };
}
