// The query-read wiring (Swift ChatConversationEngine with a record source, ADR 0025): the engine
// follows the source its adapter makes instead of finding a file, stops with the reason a source
// names, and reads pages and outputs through the same source.

import { describe, expect, it } from 'vitest';
import { TransportFailure } from '../../errors';
import { encodeUtf8 } from '../../events/utf8';
import { VolatileChatTranscriptCache } from '../model/cache';
import type { ChatHostFiles } from '../model/host-files';
import { type ChatAgentActivity, projectionContext } from '../model/types';
import type { OpenCodeQuery, OpenCodeQueryResponse, OpenCodeRowLine } from '../opencode/query';
import { openCodeSessionID } from '../opencode/session-id';
import { standardAdapter } from './adapter';
import { ChatConversationEngine } from './engine';

const SESSION = 'ses_0a1b2c3d4e5fK2mN8pQ4rT6vX9';
const EPOCH = 1_800_000_000_000;
const context = (activity: ChatAgentActivity) => projectionContext({ activity });

function row(seq: number, type: string, data: string, isFinal = true): OpenCodeRowLine {
  const id = `msg_${seq}`;
  const t = EPOCH + seq;
  return {
    id,
    seq,
    timeUpdated: t,
    isFinal,
    line: encodeUtf8(
      `{"k":"row","id":"${id}","type":"${type}","seq":${seq},"tc":${t},"tu":${t},"f":${isFinal},"d":${data}}`,
    ),
  };
}

const prompt = (seq: number, text: string) =>
  row(seq, 'user', `{"text":${JSON.stringify(text)},"n":${text.length},"files":[],"agents":[]}`);
const reply = (seq: number, text: string) =>
  row(
    seq,
    'assistant',
    `{"time":{"created":${EPOCH + seq},"completed":${EPOCH + seq + 1}},"finish":"stop","content":[{"_i":0,"type":"text","text":${JSON.stringify(text)},"n":${text.length}}]}`,
  );
const idle = (seq: number) =>
  row(seq, 'idle', `{"time":{"created":${EPOCH + seq}},"outcome":"succeeded"}`);

const SESSION_LINE = encodeUtf8(
  `{"k":"session","id":"${SESSION}","parent":null,"title":"Pong","version":"2.0.32"}`,
);

function records(
  rows: OpenCodeRowLine[],
  eventSeq: number,
  firstSeq: number,
  extra: { windowCount?: number } = {},
): OpenCodeQueryResponse {
  return {
    type: 'records',
    records: {
      sqliteVersion: '3.51.0',
      eventSeq,
      sessionLine: SESSION_LINE,
      inboxLine: encodeUtf8('{"k":"inbox","items":[],"more":0}'),
      rows,
      firstSeq,
      windowCount: extra.windowCount ?? null,
      overflow: false,
      ignoredLines: 0,
    },
  };
}

/** A Host that answers OpenCode queries in order and has no files. */
function scripted(...answers: (OpenCodeQueryResponse | Error)[]) {
  const queue = [...answers];
  const asked: OpenCodeQuery[] = [];
  let fileCalls = 0;
  const refuse = async (): Promise<never> => {
    fileCalls += 1;
    throw new Error('no files');
  };
  const files: ChatHostFiles = {
    status: refuse,
    list: refuse,
    read: refuse,
    home: refuse,
    queryOpenCode: async (query) => {
      asked.push(query);
      const next = queue.shift();
      if (next === undefined) throw new Error('no answer scripted');
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { files, asked, fileCalls: () => fileCalls };
}

function engineFor(files: ChatHostFiles, sessionID = SESSION) {
  return new ChatConversationEngine({
    reference: { program: 'opencode', sessionID },
    cacheKey: { hostID: 'h1', herdrSession: '', program: 'opencode', conversationID: sessionID },
    files,
    cache: new VolatileChatTranscriptCache(),
    adapter:
      standardAdapter('opencode') ??
      (() => {
        throw new Error('no adapter');
      })(),
    now: () => EPOCH,
  });
}

describe('ChatConversationEngine (OpenCode, read by query)', () => {
  it('registers an adapter that reads by query and rejects a session id of another shape', () => {
    const adapter = standardAdapter('opencode');
    expect(adapter?.makeRecordSource?.(SESSION)?.path).toBe(`opencode:${SESSION}`);
    expect(adapter?.makeRecordSource?.('not-a-session')).toBeNull();
    expect(openCodeSessionID(SESSION)).toBe(SESSION);
    expect(adapter?.joinsCachedHistory).toBe(false);
  });

  it('follows the source without looking for a file, and shows its turns', async () => {
    const host = scripted(
      records([prompt(4, 'Reply with pong.'), reply(7, 'pong'), idle(12)], 12, 4),
      { type: 'unchanged', eventSeq: 12 },
    );
    const engine = engineFor(host.files);

    const opened = await engine.open([], context('idle'));

    expect(opened.phase).toEqual({ type: 'following', path: `opencode:${SESSION}` });
    expect(opened.older).toEqual({ type: 'reachedStart' });
    expect(opened.transcript.title).toBe('Pong');
    expect(opened.transcript.turns.map((turn) => turn.ending)).toEqual(['completed']);
    expect(opened.readOffset).toBe(13);
    const polled = await engine.poll(context('idle'));
    expect(polled.revision).toBe(opened.revision);
    expect(host.fileCalls()).toBe(0);
  });

  it('stops with the reason the source names', async () => {
    const host = scripted({ type: 'unavailable', problem: { kind: 'storeClosed' } });
    const snapshot = await engineFor(host.files).open([], context('idle'));
    expect(snapshot.phase).toEqual({
      type: 'unavailable',
      reason: { kind: 'sessionStore', program: 'opencode', problem: { kind: 'storeClosed' } },
    });
    expect(snapshot.readFailure).toBeNull();
  });

  it('stops as unidentified for a session id of another shape', async () => {
    const host = scripted();
    const snapshot = await engineFor(host.files, 'nope').open([], context('idle'));
    expect(snapshot.phase).toEqual({
      type: 'unavailable',
      reason: { kind: 'unidentifiedSession', program: 'opencode' },
    });
    expect(host.asked).toEqual([]);
  });

  it('records a read failure and keeps following', async () => {
    const host = scripted(
      records([prompt(4, 'Hi.'), reply(7, 'Hello.'), idle(12)], 12, 4),
      new TransportFailure({ kind: 'hostFileTimedOut' }),
    );
    const engine = engineFor(host.files);
    await engine.open([], context('idle'));

    const failed = await engine.poll(context('idle'));

    expect(failed.phase.type).toBe('following');
    expect(failed.readFailure).toEqual({ kind: 'hostFileTimedOut' });
  });

  it('pages older history, restarting small after a timeout', async () => {
    const earlier = prompt(2, 'Earlier.');
    const host = scripted(
      records(
        [prompt(10, 'Reply with exactly the word pong.'), reply(11, 'pong'), idle(12)],
        12,
        2,
      ),
      // Rows of a type the reducer does not know show nothing, so a page of them opens no turn and
      // the search goes on.
      records([row(6, 'x-later', '{}'), row(8, 'x-later', '{}')], 12, 2),
      new TransportFailure({ kind: 'hostFileTimedOut' }),
      records([earlier], 12, 2),
    );
    const engine = engineFor(host.files);
    const opened = await engine.open([], context('idle'));
    expect(opened.older).toEqual({ type: 'available' });

    const failed = await engine.loadOlder(context('idle'));
    expect(failed.readFailure).toEqual({ kind: 'hostFileTimedOut' });
    expect(failed.older.type).toBe('failed');

    const paged = await engine.loadOlder(context('idle'));
    expect(paged.readFailure).toBeNull();
    expect(paged.older).toEqual({ type: 'reachedStart' });
    expect(paged.transcript.entries.length).toBeGreaterThan(opened.transcript.entries.length);
    expect(
      host.asked.map(({ query }) =>
        query.kind === 'tail'
          ? `tail ${query.budget}`
          : query.kind === 'older'
            ? `older ${query.before} ${query.budget}`
            : query.kind,
      ),
    ).toEqual([
      `tail ${512 << 10}`,
      `older 10 ${512 << 10}`,
      `older 6 ${1 << 20}`,
      `older 6 ${512 << 10}`,
    ]);
    expect(host.fileCalls()).toBe(0);
  });

  it('reads an expanded tool output through the source and says when it is too long', async () => {
    const step = row(
      7,
      'assistant',
      `{"time":{"created":${EPOCH + 7},"completed":${EPOCH + 8}},"finish":"tool-calls","content":[{"_i":0,"type":"tool","id":"call_1","name":"bash","status":"completed","input":{"command":"ls"},"meta":{"exit":0},"out":"one\\ntwo","outN":7}]}`,
    );
    const cut = records([step], 12, 4);
    if (cut.type !== 'records') throw new Error('records');
    const host = scripted(
      records([prompt(4, 'List.'), step, idle(12)], 12, 4),
      records([step], 12, 4),
      { type: 'records', records: { ...cut.records, overflow: true } },
      { type: 'records', records: { ...cut.records, overflow: true } },
      { type: 'records', records: { ...cut.records, overflow: true } },
    );
    const engine = engineFor(host.files);
    const opened = await engine.open([], context('idle'));
    const tool = opened.transcript.entries.flatMap((entry) =>
      entry.content.type === 'tool' ? [entry.content.value] : [],
    )[0];
    if (!tool) throw new Error('no tool entry');
    expect(tool.preview?.text).toBe('one\ntwo');

    const output = await engine.output(tool);
    expect(output).toMatchObject({ ok: true, output: { preview: { text: 'one\ntwo' } } });

    const tooLong = await engine.output(tool);
    expect(tooLong).toEqual({ ok: false, failure: { type: 'tooLong' } });
  });
});
