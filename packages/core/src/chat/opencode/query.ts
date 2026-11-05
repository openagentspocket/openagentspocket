// One read of one OpenCode session from OpenCode's own database on the Host (Swift OpenCodeQuery,
// ADR 0025). `probe.ts` turns it into a fixed, read-only script and parses what that script prints.

export type OpenCodeQueryKind =
  /** The newest rows that fit `budget` bytes of slimmed JSON, with the session, its inbox and the names of other stores. */
  | { kind: 'tail'; budget: number }
  /** What changed since the cursor's read, or only the event counter when nothing did. */
  | { kind: 'poll'; cursor: OpenCodePollCursor }
  /** The rows below `before`, newest first within `budget`, printed oldest first. */
  | { kind: 'older'; before: number; budget: number }
  /** One row again, its tool output cut at `outputLimit` characters rather than the usual 16 Ki. */
  | { kind: 'row'; seq: number; outputLimit: number };

export interface OpenCodeQuery {
  /** A validated session id (`openCodeSessionID`). */
  session: string;
  query: OpenCodeQueryKind;
}

/** What a poll already holds, so the query reads only what changed. */
export interface OpenCodePollCursor {
  /** The session's event counter at the last read; null always reads as changed. */
  eventSeq: number | null;
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
export type OpenCodeStoreProblem =
  /** No database at the default path, shown with `~` for the home directory. */
  | { kind: 'noStore'; path: string }
  /** The Host has neither `sqlite3` nor a usable `python3`. */
  | { kind: 'noReader' }
  /** The reader's SQLite is older than 3.25, lacks JSON1, or cannot parse the statements on its parser stack. */
  | { kind: 'readerTooOld'; version: string }
  /** The database's `-wal` or `-shm` file is missing: OpenCode is not running. */
  | { kind: 'storeClosed' }
  /** Only OpenCode 1.x tables exist. */
  | { kind: 'olderOpenCode' }
  /** Tables or columns Chat reads are missing (`table.column`). */
  | { kind: 'layout'; missing: string[] };

export interface OpenCodeRowLine {
  id: string;
  seq: number;
  timeUpdated: number;
  /** The row cannot change any more. */
  isFinal: boolean;
  line: Uint8Array;
}

/** Everything one query printed between its markers, as lines for the reducer. */
export interface OpenCodeRecords {
  sqliteVersion: string | null;
  eventSeq: number | null;
  sessionLine: Uint8Array | null;
  inboxLine: Uint8Array | null;
  /** Ascending `seq`. */
  rows: OpenCodeRowLine[];
  /** The session's oldest row, on tail, poll and older reads. */
  firstSeq: number | null;
  /** Rows the store holds in the poll cursor's window, on polls only. */
  windowCount: number | null;
  /** The poll found more than its budget, or the output was cut before the reader's exit line: read the tail instead. */
  overflow: boolean;
  /** Blank or untagged lines between the markers. */
  ignoredLines: number;
}

export type OpenCodeQueryResponse =
  /** The event counter has not moved since the cursor's read. */
  | { type: 'unchanged'; eventSeq: number | null }
  | { type: 'records'; records: OpenCodeRecords }
  /** The store has no such session. `otherStores` names the store files beside the default one, on tail reads only. */
  | { type: 'sessionMissing'; otherStores: string[] }
  | { type: 'unavailable'; problem: OpenCodeStoreProblem };
