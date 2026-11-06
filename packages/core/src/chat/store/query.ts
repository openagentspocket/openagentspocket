// One read of one conversation from its program's own SQLite store on the Host (Swift StoreQuery,
// ADR 0025). A `ChatStore` turns it into a fixed, read-only script; `output.ts` parses what that
// script prints. OpenCode and Hermes Agent answer it the same way, each with its own statements.

import type { ChatProgram } from '../model/types';

export type StoreQueryKind =
  /** The newest rows that fit `budget` bytes of slimmed JSON, with the session, its inbox and the names of other stores. */
  | { kind: 'tail'; budget: number }
  /** What changed since the cursor's read, or only the event counter when nothing did. */
  | { kind: 'poll'; cursor: StorePollCursor }
  /** The rows below `before`, newest first within `budget`, printed oldest first. */
  | { kind: 'older'; before: number; budget: number }
  /** One row again, its tool output cut at `outputLimit` characters rather than the usual 16 Ki. */
  | { kind: 'row'; seq: number; outputLimit: number };

export interface StoreQuery {
  /** A session id its program's naming accepted: it reaches the statements as a SQL literal. */
  session: string;
  query: StoreQueryKind;
}

/** What a poll already holds, so the query reads only what changed. */
export interface StorePollCursor {
  /** The session's event counter at the last read; null always reads as changed. */
  eventSeq: number | null;
  /** What the store said besides the counter (`StoreRecords.generation`) at the last read. */
  generation: string | null;
  /** The window the source holds: the oldest and newest row it read. */
  lowSeq: number;
  highSeq: number;
  /** Rows the source holds in `lowSeq...highSeq`; a store that counts another number has deleted rows. */
  knownInWindow: number;
  /** Rows still running, read again on every changed poll. At most 64. */
  openRows: number[];
  /** Milliseconds: the newest `time_updated` seen, minus 2 s, so a row updated in the same millisecond is read again. */
  updatedSince: number;
  budget: number;
}

/** Why a Host's OpenCode store cannot answer, before any session is read. */
export type StoreProblem =
  /** No database at the default path, shown with `~` for the home directory. */
  | { kind: 'noStore'; path: string }
  /** The Host has neither `sqlite3` nor a usable `python3`. */
  | { kind: 'noReader' }
  /** The reader's SQLite is older than 3.25, lacks JSON1, or cannot parse the statements on its parser stack. */
  | { kind: 'readerTooOld'; version: string }
  /** A WAL database's `-wal` or `-shm` file is missing: its program is not running. */
  | { kind: 'storeClosed' }
  /** Only OpenCode 1.x tables exist. */
  | { kind: 'olderOpenCode' }
  /** Tables or columns Chat reads are missing (`table.column`). */
  | { kind: 'layout'; missing: string[] };

export interface StoreRowLine {
  id: string;
  seq: number;
  timeUpdated: number;
  /** The row cannot change any more. */
  isFinal: boolean;
  line: Uint8Array;
}

/** Everything one query printed between its markers, as lines for the reducer. */
export interface StoreRecords {
  sqliteVersion: string | null;
  eventSeq: number | null;
  /**
   * Digits and dots naming what the counter cannot show, for a store that rewrites rows without
   * marking which: another generation means the rows held are stale. Null for a store with none.
   */
  generation: string | null;
  sessionLine: Uint8Array | null;
  inboxLine: Uint8Array | null;
  /** Ascending `seq`. */
  rows: StoreRowLine[];
  /** The session's oldest row, on tail, poll and older reads. */
  firstSeq: number | null;
  /** Rows the store holds in the poll cursor's window, on polls only. */
  windowCount: number | null;
  /** The poll found more than its budget, or the output was cut before the reader's exit line: read the tail instead. */
  overflow: boolean;
  /** Blank or untagged lines between the markers. */
  ignoredLines: number;
}

export type StoreQueryResponse =
  /** The event counter has not moved since the cursor's read. */
  | { type: 'unchanged'; eventSeq: number | null }
  | { type: 'records'; records: StoreRecords }
  /** The store has no such session. `otherStores` names the store files beside the default one, on tail reads only. */
  | { type: 'sessionMissing'; otherStores: string[] }
  | { type: 'unavailable'; problem: StoreProblem };

/** Rows a poll reads again because they can still change. */
export const OPEN_ROW_LIMIT = 64;

export interface StoreScriptOptions {
  /** `automatic`: `sqlite3`, else a `python3` that is not Darwin's install shim. `pythonOnly`: Python only, for a test on a Host that has both. */
  reader?: 'automatic' | 'pythonOnly';
  /** The shell line that extends `PATH` for herdr and its tools; the Host path export by default. */
  pathExport?: string;
}

/** One program's SQLite store on the Host: all a generic source needs to read it. */
export interface ChatStore {
  program: ChatProgram;
  /** The program's name in a failure's detail. */
  name: string;
  /** The read-only script of one query. */
  script(query: StoreQuery, nonce: string, options?: StoreScriptOptions): Uint8Array;
  /** Whether a file beside the store is one to name in a hint. */
  isStoreName(name: string): boolean;
  /** Whether the session a line describes is one Chat shows only inside its parent's. */
  isSubagentSession?(sessionLine: Uint8Array): boolean;
}
