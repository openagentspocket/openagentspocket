// Shared by the OpenCode record source tests: scripted query answers that also count file calls, row
// and record builders, and the lines the source is expected to hand on (Swift
// OpenCodeRecordSourceTests helpers).

import { TransportFailure } from '../../errors';
import { encodeUtf8 } from '../../events/utf8';
import type { ChatHostFiles } from '../model/host-files';
import type { ChatLine } from '../model/lines';
import { ChatSourceUnavailable } from '../model/source';
import type { ChatSessionStoreProblem } from '../timeline/reasons';
import type {
  OpenCodePollCursor,
  OpenCodeQuery,
  OpenCodeQueryResponse,
  OpenCodeRowLine,
} from './query';

export const SESSION = 'ses_0a1b2c3d4e5fK2mN8pQ4rT6vX9';
/** Milliseconds: a row's default `time_updated` is this plus its `seq`. */
export const EPOCH = 1_800_000_000_000;

/**
 * Answers OpenCode queries with scripted responses, in order, and keeps every query asked. A source
 * read by query never reads the Host's files: each file operation is counted and fails.
 */
export class ScriptedQueries {
  readonly queries: OpenCodeQuery[] = [];
  fileCalls = 0;
  private readonly answers: (OpenCodeQueryResponse | Error)[] = [];

  answer(...responses: OpenCodeQueryResponse[]): void {
    this.answers.push(...responses);
  }

  fail(error: Error): void {
    this.answers.push(error);
  }

  /** Each query's kind, a poll without its cursor. */
  get shapes(): string[] {
    return this.queries.map(({ query }) => {
      if (query.kind === 'tail') return `tail ${query.budget}`;
      if (query.kind === 'poll') return 'poll';
      if (query.kind === 'older') return `older ${query.before} ${query.budget}`;
      return `row ${query.seq} ${query.outputLimit}`;
    });
  }

  get lastCursor(): OpenCodePollCursor | undefined {
    for (const { query } of [...this.queries].reverse()) {
      if (query.kind === 'poll') return query.cursor;
    }
    return undefined;
  }

  get files(): ChatHostFiles {
    const refused = (): never => {
      this.fileCalls += 1;
      throw new TransportFailure({ kind: 'hostFileUnreadable', status: 3 });
    };
    return {
      status: async () => refused(),
      list: async () => refused(),
      read: async () => refused(),
      home: async () => refused(),
      queryStore: async (_store, query) => {
        this.queries.push(query);
        const next = this.answers.shift();
        if (next === undefined) {
          throw new TransportFailure({ kind: 'malformedResponse', detail: 'no answer scripted' });
        }
        if (next instanceof Error) throw next;
        return next;
      },
    };
  }
}

export function row(
  seq: number,
  {
    type = 'user',
    isFinal = true,
    updated = EPOCH + seq,
    data = '{"text":"Hello.","n":6,"files":[],"agents":[]}',
  }: { type?: string; isFinal?: boolean; updated?: number; data?: string } = {},
): OpenCodeRowLine {
  const id = `msg_${seq}`;
  const line = `{"k":"row","id":"${id}","type":"${type}","seq":${seq},"tc":${updated},"tu":${updated},"f":${isFinal},"d":${data}}`;
  return { id, seq, timeUpdated: updated, isFinal, line: encodeUtf8(line) };
}

export const sessionLine = (parent: string | null = null) =>
  encodeUtf8(
    `{"k":"session","id":"${SESSION}","parent":${parent === null ? 'null' : `"${parent}"`},"title":"Pong","version":"2.0.32","revertMessage":null,"revertFiles":null,"revertSeq":null,"updated":1800000013841}`,
  );
export const INBOX = encodeUtf8('{"k":"inbox","items":[],"more":0}');

export function records(
  rows: OpenCodeRowLine[],
  {
    eventSeq,
    firstSeq = null,
    windowCount = null,
    session = sessionLine(),
    overflow = false,
  }: {
    eventSeq: number | null;
    firstSeq?: number | null;
    windowCount?: number | null;
    session?: Uint8Array | null;
    overflow?: boolean;
  },
): OpenCodeQueryResponse {
  return {
    type: 'records',
    records: {
      sqliteVersion: '3.51.0',
      eventSeq,
      generation: null,
      sessionLine: session,
      inboxLine: session === null ? null : INBOX,
      rows,
      firstSeq,
      windowCount,
      overflow,
      ignoredLines: 0,
    },
  };
}

export const lineOf = (offset: number, data: Uint8Array): ChatLine => ({
  offset,
  length: data.length,
  data,
});
export const rowLine = (r: OpenCodeRowLine) => lineOf(r.seq, r.line);
/** The session and inbox lines, which follow the rows at `offset`. */
export const trailer = (offset: number) => [lineOf(offset, sessionLine()), lineOf(offset, INBOX)];

export function cursor(
  eventSeq: number | null,
  lowSeq: number,
  highSeq: number,
  knownInWindow: number,
  newestUpdate: number,
  openRows: number[] = [],
): OpenCodePollCursor {
  return {
    eventSeq,
    generation: null,
    lowSeq,
    highSeq,
    knownInWindow,
    openRows,
    updatedSince: newestUpdate - 2000,
    budget: 1 << 20,
  };
}

export const unavailableReason = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (thrown) {
    if (thrown instanceof ChatSourceUnavailable) return thrown.reason;
    throw thrown;
  }
  throw new Error('expected ChatSourceUnavailable');
};

export const storeReason = (problem: ChatSessionStoreProblem) => ({
  kind: 'sessionStore',
  program: 'opencode',
  problem,
});
