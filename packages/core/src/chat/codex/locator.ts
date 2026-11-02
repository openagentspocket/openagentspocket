// Finds a Codex thread's rollout under `~/.codex` (Swift CodexRolloutFileName,
// CodexTranscriptLocator).
//
// Rollouts live in `sessions/YYYY/MM/DD/` by the Host's local date when the thread started, which
// the version 7 UUID's timestamp gives to within a day of time zone. A revert writes its new
// segment under the date it happened, so today's neighbourhood is searched too; archiving moves
// files unchanged into the flat `archived_sessions/`. Directory listings are filtered on the Host
// by the thread id, so a busy day costs only matches.

import { type ChatHostFiles, readFirstLine } from '../model/host-files';
import { joinPath } from '../model/paths';
import { readFirstLine as parseFirstLine } from './segment';

/**
 * A Codex rollout file name,
 * `rollout-<YYYY-MM-DDThh-mm-ss>-<thread>[_<rollout>].jsonl[.zst]`. A name without `_` is a root
 * segment whose rollout id equals its thread id; a revert writes a new `_<rollout>` segment.
 */
export interface CodexRolloutFileName {
  fileName: string;
  /** The Host's local time, opaque: it sorts but is not converted. */
  timestampKey: string;
  threadID: string;
  rolloutID: string;
  /** `.jsonl.zst`, which Chat cannot read without a decompressor. */
  isCompressed: boolean;
}

const TIMESTAMP_LENGTH = 19;

export function parseRolloutFileName(fileName: string): CodexRolloutFileName | null {
  let rest = fileName;
  const isCompressed = rest.endsWith('.zst');
  if (isCompressed) rest = rest.slice(0, -4);
  if (!rest.startsWith('rollout-') || !rest.endsWith('.jsonl')) return null;
  rest = rest.slice('rollout-'.length, rest.length - '.jsonl'.length);
  const timestampKey = rest.slice(0, TIMESTAMP_LENGTH);
  rest = rest.slice(TIMESTAMP_LENGTH);
  if (timestampKey.length !== TIMESTAMP_LENGTH || !rest.startsWith('-')) return null;
  rest = rest.slice(1);
  const separator = rest.indexOf('_');
  const threadID = separator < 0 ? rest : rest.slice(0, separator);
  const rolloutID = separator < 0 ? rest : rest.slice(separator + 1);
  if (threadID === '' || rolloutID === '') return null;
  return { fileName, timestampKey, threadID, rolloutID, isCompressed };
}

/** Codex's own order for a thread's segments: by timestamp key, then rollout id. */
export function compareRolloutNames(a: CodexRolloutFileName, b: CodexRolloutFileName): number {
  if (a.timestampKey !== b.timestampKey) return a.timestampKey < b.timestampKey ? -1 : 1;
  if (a.rolloutID !== b.rolloutID) return a.rolloutID < b.rolloutID ? -1 : 1;
  if (a.isCompressed === b.isCompressed) return 0;
  // Between two copies of one segment the plain file sorts last.
  return a.isCompressed ? -1 : 1;
}

/** The creation time (Unix ms) in a version 7 UUID's first 48 bits; null for other versions. */
export function threadCreationTime(id: string): number | null {
  const match = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-[0-9a-f]{4}-[0-9a-f]{12}$/i.exec(id);
  if (!match || (match[3] as string)[0] !== '7') return null;
  return Number.parseInt((match[1] as string) + (match[2] as string), 16);
}

export interface CodexRolloutSegment {
  path: string;
  name: CodexRolloutFileName;
}

export interface CodexTranscriptLocation {
  /** The thread's readable segments, oldest first; the last is the live one Codex appends to. */
  segments: CodexRolloutSegment[];
}

export function liveSegment(location: CodexTranscriptLocation): CodexRolloutSegment | null {
  return location.segments[location.segments.length - 1] ?? null;
}

export type CodexTranscriptUnavailable = 'notFound' | 'compressed' | 'mismatched';

export type CodexLocateResult =
  | { ok: true; location: CodexTranscriptLocation }
  | { ok: false; reason: CodexTranscriptUnavailable };

const DAY = 86_400_000;

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/** `YYYY/MM/DD` for the day before, of and after the thread's creation and today, in UTC. */
export function dateDirectories(threadID: string, now: number): string[] {
  const days: string[] = [];
  const created = threadCreationTime(threadID);
  for (const anchor of created === null ? [now] : [created, now]) {
    for (let offset = -1; offset <= 1; offset += 1) {
      const day = new Date(anchor + offset * DAY);
      const text = `${pad(day.getUTCFullYear(), 4)}/${pad(day.getUTCMonth() + 1, 2)}/${pad(day.getUTCDate(), 2)}`;
      if (!days.includes(text)) days.push(text);
    }
  }
  return days;
}

export class CodexTranscriptLocator {
  constructor(
    private readonly files: ChatHostFiles,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async locate(threadID: string): Promise<CodexLocateResult> {
    const home = await this.files.home();
    const root = joinPath(home, '.codex');
    let segments: CodexRolloutSegment[] = [];
    for (const date of dateDirectories(threadID, this.now())) {
      segments = segments.concat(
        await this.matches(joinPath(root, 'sessions', ...date.split('/')), threadID),
      );
    }
    if (segments.length === 0) {
      segments = await this.matches(joinPath(root, 'archived_sessions'), threadID);
    }
    const unique = new Map(segments.map((segment) => [segment.path, segment]));
    const ordered = [...unique.values()].sort((a, b) => compareRolloutNames(a.name, b.name));
    const newest = ordered[ordered.length - 1];
    if (!newest) return { ok: false, reason: 'notFound' };
    if (newest.name.isCompressed) return { ok: false, reason: 'compressed' };
    if (!(await this.sessionMetaNames(threadID, newest.path))) {
      return { ok: false, reason: 'mismatched' };
    }
    // A plain copy shadows a compressed one of the same segment.
    return { ok: true, location: { segments: ordered.filter((s) => !s.name.isCompressed) } };
  }

  private async matches(directory: string, threadID: string): Promise<CodexRolloutSegment[]> {
    const listing = await this.files.list({
      directory,
      kinds: ['regular', 'symlink'],
      namePrefix: 'rollout-',
      nameSuffixes: ['.jsonl', '.jsonl.zst'],
      nameContains: threadID,
      maximumEntries: 200,
    });
    const out: CodexRolloutSegment[] = [];
    for (const entry of listing?.entries ?? []) {
      const name = parseRolloutFileName(entry.name);
      if (name && name.threadID === threadID)
        out.push({ path: joinPath(directory, entry.name), name });
    }
    return out;
  }

  /**
   * Line 1 of a rollout is its `session_meta`, whose `payload.id` is the thread id across
   * reverts. The line carries the base instructions, so it can run to tens of kilobytes; a line
   * longer than 1 MiB is accepted on its file name. A pre-envelope line names its session in a
   * top-level `id`; it is accepted so that Chat can say the format is too old.
   */
  private async sessionMetaNames(threadID: string, path: string): Promise<boolean> {
    const first = await readFirstLine(this.files, path, 64 << 10, 1 << 20);
    if (!first) return false;
    if (first.type !== 'line') return true;
    const line = parseFirstLine(first.data);
    return line !== null && line.threadID?.toLowerCase() === threadID;
  }
}
