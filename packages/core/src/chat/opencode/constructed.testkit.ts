/**
 * Test support: OpenCode rows written by hand in the record source's line format, kept under
 * packages/core/goldens/opencode/constructed/. They are constructed, not captured: each stands for
 * a case no capture holds yet, shaped after OpenCode's source. Node only.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ChatLine } from '../model/lines';
import { type ChatAgentActivity, type ChatTranscript, projectionContext } from '../model/types';
import { OpenCodeTranscriptReducer } from './reducer';

const DIRECTORY = fileURLToPath(new URL('../../../goldens/opencode/constructed/', import.meta.url));

/** Where the session and inbox lines sit: past every row, as a read hands them on. */
const READ_OFFSET = 1_000_000;

/** The lines of `files`, in order, each row at its `seq`. */
export function constructedLines(...files: string[]): ChatLine[] {
  return files.flatMap((file) =>
    readFileSync(`${DIRECTORY}${file}.jsonl`, 'utf8')
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => {
        const data = new TextEncoder().encode(line);
        const value = JSON.parse(line) as { seq?: unknown };
        const offset = typeof value.seq === 'number' ? value.seq : READ_OFFSET;
        return { offset, length: data.length, data };
      }),
  );
}

/** The transcript the reducer makes of `lines`, everything loaded, for `activity`. */
export function constructedTranscript(
  lines: readonly ChatLine[],
  activity: ChatAgentActivity,
): ChatTranscript {
  const reducer = new OpenCodeTranscriptReducer();
  reducer.append(lines);
  return reducer.transcript(projectionContext({ activity }));
}
