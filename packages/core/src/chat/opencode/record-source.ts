// Follows one OpenCode session through queries of OpenCode's own database on the Host (Swift
// OpenCodeRecordSource, ADR 0025), handing the reducer the lines `probe.ts` parses. A row's offset is
// its `seq`; the session and inbox lines sit at `readOffset`, past every row read.
//
// The session's event counter moves with every change to its rows, so a poll whose counter has not
// moved reads nothing more. Otherwise the poll reads the rows past the window, the rows still open
// and the rows updated since the last read, and counts the rows in the window: a count other than
// the rows held means rows were deleted, as a committed `/undo` does, and the source starts over
// from a tail read. Older pages read below the window and never move the counter, which only a newer
// read may.
//
// A read whose output was cut reads again at half its budget, twice at most.

import { TransportFailure } from '../../errors';
import { encodeUtf8 } from '../../events/utf8';
import type { FollowChange, OlderPage } from '../model/follower';
import type { ChatHostFiles } from '../model/host-files';
import type { ChatLine } from '../model/lines';
import {
  ChatOutputTooLong,
  ChatSourceUnavailable,
  type ChatTranscriptSource,
} from '../model/source';
import type { ChatOutputReference } from '../model/types';
import type { ChatSessionStoreProblem } from '../timeline/reasons';
import { OPEN_ROW_LIMIT } from './probe-sql';
import type {
  OpenCodePollCursor,
  OpenCodeQuery,
  OpenCodeQueryKind,
  OpenCodeQueryResponse,
  OpenCodeRecords,
  OpenCodeRowLine,
  OpenCodeStoreProblem,
} from './query';
import { readOpenCodeLine } from './record';

/** Bytes of slimmed JSON each read asks for. */
export interface OpenCodeBudgets {
  /** An open, or a poll that starts over. */
  tail: number;
  /** The most one poll reads; past it the source reads the tail. */
  poll: number;
  /** The first older page; it doubles to `olderMaximumPage`. */
  olderPage: number;
  /** Half the output cap: a page's lines run past its rows' data, and it may end with a row that crosses the budget. */
  olderMaximumPage: number;
  /** How much one request for older history reads back. */
  olderSearch: number;
  /** Characters of a tool's output a row read again for an expanded tool row keeps. */
  outputLimit: number;
}

export const DEFAULT_OPENCODE_BUDGETS: OpenCodeBudgets = {
  tail: 512 << 10,
  poll: 1 << 20,
  olderPage: 512 << 10,
  olderMaximumPage: 1 << 20,
  olderSearch: 8 << 20,
  outputLimit: 256 << 10,
};

/** A cut read is tried at its full budget, then at half and a quarter. */
const ATTEMPTS = 3;

const offsetOf = (seq: number) => Math.max(seq, 0);

const tooLarge = () =>
  new TransportFailure({
    kind: 'hostStoreUnreadable',
    detail: "OpenCode's conversation is too large to read in one query.",
  });

const unexpectedUnchanged = () =>
  new TransportFailure({
    kind: 'malformedResponse',
    detail: "OpenCode's store answered a read with an unchanged counter",
  });

function unavailable(problem: OpenCodeStoreProblem): ChatSourceUnavailable {
  let reason: ChatSessionStoreProblem;
  switch (problem.kind) {
    case 'noStore':
      reason = { kind: 'noStore', path: problem.path };
      break;
    case 'readerTooOld':
      reason = { kind: 'readerTooOld', version: problem.version };
      break;
    case 'layout':
      reason = { kind: 'unsupportedLayout', detail: problem.missing.join(', ') };
      break;
    default:
      reason = { kind: problem.kind };
  }
  return new ChatSourceUnavailable({ kind: 'sessionStore', program: 'opencode', problem: reason });
}

/** Chat shows a subagent's session only inside its parent's. */
function checkSession(records: OpenCodeRecords): void {
  if (records.sessionLine === null) return;
  const line = readOpenCodeLine(records.sessionLine);
  if (line.kind === 'session' && line.session.parent !== null) {
    throw new ChatSourceUnavailable({
      kind: 'sessionStore',
      program: 'opencode',
      problem: { kind: 'subagentSession' },
    });
  }
}

type Tail = { type: 'lines'; lines: ChatLine[] } | { type: 'missing'; otherStores: string[] };

export class OpenCodeRecordSource implements ChatTranscriptSource {
  private isOpen = false;
  /** The event counter at the last newer read. */
  private eventSeq: number | null = null;
  /** The rows held, by `seq`: every row from `lowSeq` to `highSeq`. */
  private held = new Set<number>();
  /** The held rows that can still change. */
  private openRows = new Set<number>();
  private lowSeq: number | null = null;
  private highSeq: number | null = null;
  /** The session's oldest row, as the last read that printed it said. */
  private firstSeq: number | null = null;
  /** The newest `time_updated` a newer read saw, in milliseconds. */
  private newestUpdate: number | null = null;
  /** Bytes the request for older history begun last has read. */
  private olderSearchRead = 0;

  constructor(
    /** A validated session id (`openCodeSessionID`). */
    readonly session: string,
    private readonly budgets: OpenCodeBudgets = DEFAULT_OPENCODE_BUDGETS,
  ) {}

  get path(): string {
    return `opencode:${this.session}`;
  }

  get head(): Uint8Array {
    return encodeUtf8(this.session);
  }

  /** Past the counter and every row read. A session with no counter row has a null counter. */
  get readOffset(): number {
    return offsetOf(Math.max(this.eventSeq ?? 0, this.highSeq ?? 0)) + 1;
  }

  get windowStart(): number | null {
    if (!this.isOpen) return null;
    if (this.lowSeq === null || !(this.lowSeq > (this.firstSeq ?? Number.NEGATIVE_INFINITY))) {
      return 0;
    }
    return offsetOf(this.lowSeq);
  }

  get hasOlder(): boolean {
    return (this.windowStart ?? 0) > 0;
  }

  get olderPageLengths(): { first: number; maximum: number } {
    return { first: this.budgets.olderPage, maximum: this.budgets.olderMaximumPage };
  }

  /** OpenCode's automatic requests read as the user's do. */
  get automaticOlderSearch(): number | null {
    return null;
  }

  get olderSearchExhausted(): boolean {
    return this.olderSearchRead >= this.budgets.olderSearch;
  }

  beginOlderSearch(): void {
    this.olderSearchRead = 0;
  }

  // MARK: Reading

  /** Reads the newest rows. A missing session is unavailable rather than null, so Chat can say which other stores the Host has. */
  async open(files: ChatHostFiles): Promise<ChatLine[] | null> {
    const tail = await this.readTail(files);
    if (tail.type === 'lines') return tail.lines;
    throw new ChatSourceUnavailable({
      kind: 'sessionStore',
      program: 'opencode',
      problem: { kind: 'sessionMissing', otherStores: tail.otherStores },
    });
  }

  async poll(files: ChatHostFiles): Promise<FollowChange> {
    if (!this.isOpen) return this.startOver(files);
    const cursor: OpenCodePollCursor = {
      eventSeq: this.eventSeq,
      lowSeq: this.lowSeq ?? 0,
      highSeq: this.highSeq ?? 0,
      knownInWindow: this.held.size,
      openRows: [...this.openRows].sort((a, b) => a - b).slice(-OPEN_ROW_LIMIT),
      updatedSince: (this.newestUpdate ?? 0) - 2000,
      budget: this.budgets.poll,
    };
    const response = await this.query(files, { kind: 'poll', cursor });
    switch (response.type) {
      case 'unchanged':
        return { type: 'unchanged' };
      case 'sessionMissing':
        return { type: 'missing' };
      case 'unavailable':
        throw unavailable(response.problem);
      case 'records': {
        const { records } = response;
        checkSession(records);
        // Over budget, rows deleted from the window, or too many open rows to name: read the tail instead.
        if (
          records.overflow ||
          records.windowCount !== cursor.knownInWindow ||
          this.openRows.size > OPEN_ROW_LIMIT
        ) {
          return this.startOver(files);
        }
        this.eventSeq = records.eventSeq;
        if (records.firstSeq !== null) this.firstSeq = records.firstSeq;
        for (const row of records.rows) this.hold(row, true);
        const lines = this.chatLines(records);
        return lines.length === 0 ? { type: 'unchanged' } : { type: 'appended', lines };
      }
    }
  }

  /** `limit` stays null: with no `automaticOlderSearch`, no request bounds its pages. */
  async loadOlder(
    files: ChatHostFiles,
    length: number | null = null,
    _limit: number | null = null,
  ): Promise<OlderPage> {
    const lowSeq = this.lowSeq;
    if (!this.hasOlder || lowSeq === null) return { type: 'headReached' };
    let budget = Math.min(
      Math.max(this.budgets.olderPage, length ?? 0),
      this.budgets.olderMaximumPage,
    );
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const response = await this.query(files, { kind: 'older', before: lowSeq, budget });
      switch (response.type) {
        case 'records': {
          const { records } = response;
          if (records.overflow) {
            budget = Math.floor(budget / 2);
            break;
          }
          if (records.firstSeq !== null) this.firstSeq = records.firstSeq;
          if (records.rows.length === 0) {
            // Nothing below the window: it starts at the first row.
            this.firstSeq = lowSeq;
            return { type: 'headReached' };
          }
          for (const row of records.rows) {
            this.hold(row, false);
            this.olderSearchRead += row.line.length;
          }
          return {
            type: 'lines',
            lines: records.rows.map((row) => lineOf(offsetOf(row.seq), row.line)),
          };
        }
        case 'sessionMissing':
          return { type: 'missing' };
        case 'unavailable':
          throw unavailable(response.problem);
        case 'unchanged':
          throw unexpectedUnchanged();
      }
    }
    throw tooLarge();
  }

  /**
   * The row at the reference's `seq` again, its tool output cut at `outputLimit` characters rather
   * than the usual 16 Ki. A row still over the output cap at a quarter of that is too long to show.
   */
  async line(reference: ChatOutputReference, files: ChatHostFiles): Promise<ChatLine | null> {
    const seq = reference.offset;
    let limit = this.budgets.outputLimit;
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const response = await this.query(files, { kind: 'row', seq, outputLimit: limit });
      switch (response.type) {
        case 'records': {
          if (response.records.overflow) {
            limit = Math.floor(limit / 2);
            break;
          }
          const row = response.records.rows.find((candidate) => candidate.seq === seq);
          return row ? lineOf(reference.offset, row.line) : null;
        }
        case 'sessionMissing':
          return null;
        case 'unavailable':
          throw unavailable(response.problem);
        case 'unchanged':
          throw unexpectedUnchanged();
      }
    }
    throw new ChatOutputTooLong();
  }

  // MARK: Tail

  /** A tail read that replaces everything held. */
  private async startOver(files: ChatHostFiles): Promise<FollowChange> {
    const tail = await this.readTail(files);
    return tail.type === 'lines'
      ? { type: 'reset', lines: tail.lines, replaced: false }
      : { type: 'missing' };
  }

  private async readTail(files: ChatHostFiles): Promise<Tail> {
    let budget = this.budgets.tail;
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const response = await this.query(files, { kind: 'tail', budget });
      switch (response.type) {
        case 'records': {
          const { records } = response;
          if (records.overflow) {
            budget = Math.floor(budget / 2);
            break;
          }
          checkSession(records);
          this.isOpen = true;
          this.eventSeq = records.eventSeq;
          this.firstSeq = records.firstSeq;
          this.held = new Set();
          this.openRows = new Set();
          this.lowSeq = null;
          this.highSeq = null;
          this.newestUpdate = null;
          for (const row of records.rows) this.hold(row, true);
          return { type: 'lines', lines: this.chatLines(records) };
        }
        case 'sessionMissing':
          return { type: 'missing', otherStores: response.otherStores };
        case 'unavailable':
          throw unavailable(response.problem);
        case 'unchanged':
          throw unexpectedUnchanged();
      }
    }
    throw tooLarge();
  }

  // MARK: State

  private hold(row: OpenCodeRowLine, isNewer: boolean): void {
    this.held.add(row.seq);
    if (row.isFinal) this.openRows.delete(row.seq);
    else this.openRows.add(row.seq);
    this.lowSeq = Math.min(this.lowSeq ?? row.seq, row.seq);
    this.highSeq = Math.max(this.highSeq ?? row.seq, row.seq);
    if (isNewer)
      this.newestUpdate = Math.max(this.newestUpdate ?? row.timeUpdated, row.timeUpdated);
  }

  /** The rows oldest first, then the session and its inbox. */
  private chatLines(records: OpenCodeRecords): ChatLine[] {
    const lines = records.rows.map((row) => lineOf(offsetOf(row.seq), row.line));
    for (const data of [records.sessionLine, records.inboxLine]) {
      if (data !== null) lines.push(lineOf(this.readOffset, data));
    }
    return lines;
  }

  // MARK: Queries

  private query(files: ChatHostFiles, kind: OpenCodeQueryKind): Promise<OpenCodeQueryResponse> {
    const run = files.queryOpenCode;
    if (!run) {
      throw new TransportFailure({ kind: 'hostFeatureUnavailable', feature: 'Chat' });
    }
    const query: OpenCodeQuery = { session: this.session, query: kind };
    return run.call(files, query);
  }
}

const lineOf = (offset: number, data: Uint8Array): ChatLine => ({
  offset,
  length: data.length,
  data,
});
