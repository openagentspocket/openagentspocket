// A log beside the transcript where the program writes every prompt it submits, naming the session
// that took it (Swift ChatSendWitness). Chat reads only what was appended after a send's mark,
// compares it in memory, and keeps nothing.

import type { ChatHostFiles } from '../model/host-files';
import { readBytes } from '../model/host-files';

/** Where a send's witness starts reading: the log's size when the send first showed. */
export interface SendWitnessMark {
  readonly path: string;
  readonly size: number;
}

export type SendWitnessVerdict =
  /** The log names the session Chat follows for the send's text. */
  | 'here'
  /** The log names one other session for it, and nothing else does. */
  | 'elsewhere'
  | 'unknown';

export interface SendWitness {
  /** The log's path for a followed transcript. */
  logPath(transcriptPath: string): string;
  /** The prompt and session one complete line records; null skips the line. */
  entry(line: Uint8Array): { prompt: string; sessionID: string } | null;
  /** The most one read takes past the mark. */
  readonly readLimit?: number;
}

const DEFAULT_READ_LIMIT = 64 << 10;
const NEWLINE = 0x0a;

/**
 * The log's size now, the mark for a send about to be pasted: 0 for a log the program has not
 * written yet, null when the Host gives no size.
 */
export async function witnessMark(
  witness: SendWitness,
  transcriptPath: string,
  files: ChatHostFiles,
): Promise<SendWitnessMark | null> {
  const path = witness.logPath(transcriptPath);
  const status = await files.status(path);
  if (!status) return { path, size: 0 };
  return status.size === null ? null : { path, size: status.size };
}

/**
 * The complete lines in `data`, read from one byte before a mark (or from 0). That byte is a newline
 * when the mark fell between lines; otherwise the mark split a line written before it, which is
 * dropped. A line still being written at the end is dropped too.
 */
export function completeLines(data: Uint8Array, startsBeforeMark: boolean): Uint8Array[] {
  let bytes = data;
  if (startsBeforeMark) {
    const newline = bytes.indexOf(NEWLINE);
    if (newline < 0) return [];
    bytes = bytes.subarray(newline + 1);
  }
  const last = bytes.lastIndexOf(NEWLINE);
  if (last < 0) return [];
  const lines: Uint8Array[] = [];
  let start = 0;
  for (let at = 0; at < last; at += 1) {
    if (bytes[at] !== NEWLINE) continue;
    if (at > start) lines.push(bytes.subarray(start, at));
    start = at + 1;
  }
  if (last > start) lines.push(bytes.subarray(start, last));
  return lines;
}

/**
 * The complete lines appended since `mark`, and whether they are all of them. Null when the log is
 * gone or shorter than the mark: the program rewrote it, and offsets say nothing any more.
 */
export async function witnessAppended(
  witness: SendWitness,
  mark: SendWitnessMark,
  files: ChatHostFiles,
): Promise<{ lines: Uint8Array[]; isWholeAppend: boolean } | null> {
  const size = (await files.status(mark.path))?.size;
  if (size === undefined || size === null || size < mark.size) return null;
  const limit = witness.readLimit ?? DEFAULT_READ_LIMIT;
  // One byte before the mark tells whether it fell between lines.
  const start = Math.max(mark.size, 1) - 1;
  const end = Math.min(size, mark.size + limit);
  if (end <= start) return { lines: [], isWholeAppend: true };
  const data = await readBytes(files, mark.path, start, end, limit + 1);
  if (data === null) return null;
  return {
    lines: completeLines(data, mark.size > 0),
    isWholeAppend: size <= mark.size + limit,
  };
}

/**
 * Which session took the send whose echo key is `key`. One line naming the followed session settles
 * it here. Only a read that holds every line appended since the mark, with exactly one line for the
 * text, says elsewhere: the same text may go to two sessions.
 */
export function witnessVerdict(
  witness: SendWitness,
  input: {
    lines: readonly Uint8Array[];
    key: string;
    sessionID: string;
    isWholeAppend: boolean;
    echoKey: (text: string) => string;
  },
): SendWitnessVerdict {
  const sessions: string[] = [];
  for (const line of input.lines) {
    const entry = witness.entry(line);
    if (entry && input.echoKey(entry.prompt) === input.key) {
      sessions.push(entry.sessionID.toLowerCase());
    }
  }
  if (sessions.includes(input.sessionID.toLowerCase())) return 'here';
  return input.isWholeAppend && sessions.length === 1 ? 'elsewhere' : 'unknown';
}
