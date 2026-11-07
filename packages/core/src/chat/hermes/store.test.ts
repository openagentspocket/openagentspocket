// The Host script against a real database: what Hermes's rows read as through `sqlite3`, and what a
// follower sees as they change. Skipped on a machine without the CLI.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { decodeUtf8 } from '../../events/utf8';
import type { ChatHostFiles } from '../model/host-files';
import type { ChatLine } from '../model/lines';
import { ChatSourceUnavailable } from '../model/source';
import { type ChatTranscript, projectionContext } from '../model/types';
import { StoreRecordSource } from '../store/record-source';
import { HermesTranscriptReducer } from './reducer';
import { hermesStore } from './store';
import {
  HermesHome,
  hasSqlite3,
  insertMessage,
  partsLiteral,
  quoted,
  SESSION,
} from './store.testkit';
import { hermesStatements } from './store-sql';

const homes: HermesHome[] = [];

function homeWith(...messages: string[]): HermesHome {
  const home = new HermesHome(messages.join('\n'));
  homes.push(home);
  return home;
}

afterEach(() => {
  for (const home of homes.splice(0)) home.remove();
});

const source = () => new StoreRecordSource(hermesStore, SESSION);

function transcriptOf(lines: readonly ChatLine[]): ChatTranscript {
  const reducer = new HermesTranscriptReducer();
  reducer.append(lines);
  return reducer.transcript(projectionContext({ activity: 'idle' }));
}

const kinds = (transcript: ChatTranscript) => transcript.entries.map((e) => e.content.type);

const textOf = (transcript: ChatTranscript, type: 'user' | 'assistant') =>
  transcript.entries.flatMap((entry) =>
    entry.content.type === type ? [entry.content.value.text] : [],
  );

const TOOL_CALL = {
  id: 'call_1',
  type: 'function',
  function: { name: 'terminal', arguments: '{"command":"echo synthetic"}' },
};

const say = (role: string, text: string, extra = {}) =>
  insertMessage({ role, content: quoted(text), ...extra });

describe.skipIf(!hasSqlite3())('the Hermes store read through sqlite3', () => {
  it('reads a conversation with its tool call, result and reasoning', async () => {
    const files = homeWith(
      say('user', 'first question'),
      say('assistant', '', { toolCalls: [TOOL_CALL], reasoning: 'thinking it over' }),
      say('tool', '{"output":"synthetic","exit_code":0}', {
        toolCallID: 'call_1',
        toolName: 'terminal',
      }),
      say('assistant', 'first answer', { finishReason: 'stop' }),
    ).files();

    const transcript = transcriptOf((await source().open(files)) ?? []);

    expect(kinds(transcript)).toEqual(['user', 'reasoning', 'tool', 'assistant']);
    expect(transcript.title).toBe('Synthetic title');
    expect(transcript.turns.map((turn) => turn.ending)).toEqual(['completed']);
    const tool = transcript.entries[2]?.content;
    if (tool?.type !== 'tool') throw new Error('tool');
    expect(tool.value).toMatchObject({ kind: 'command', status: 'succeeded', callID: 'call_1' });
    expect(tool.value.title).toBe('echo synthetic');
    expect(tool.value.preview?.text).toContain('synthetic');
  });

  it('shows what Hermes paints and nothing else', async () => {
    const files = homeWith(
      say('user', 'kept'),
      say('assistant', 'undone', { active: false, finishReason: 'stop' }),
      say('user', 'scaffolding', { displayKind: 'hidden' }),
      say('user', 'for the model', { displayMetadata: { model_only: true } }),
      say('assistant', 'archived', { active: false, compacted: true, finishReason: 'stop' }),
    ).files();

    const transcript = transcriptOf((await source().open(files)) ?? []);

    expect(textOf(transcript, 'user')).toEqual(['kept']);
    expect(textOf(transcript, 'assistant')).toEqual(['archived']);
  });

  it('paints one row per slot, the live one, and a summary only in a slot of its own', async () => {
    const files = homeWith(
      say('user', 'original', { active: false, compacted: true, displayOrder: 1 }),
      say('user', 'carrier', { summary: true, displayOrder: 1 }),
      say('assistant', 'old copy', { active: false, compacted: true, displayOrder: 2 }),
      say('assistant', 'live copy', { displayOrder: 2, finishReason: 'stop' }),
      say('user', 'a summary of earlier turns', { summary: true, displayOrder: 3 }),
    ).files();

    const transcript = transcriptOf((await source().open(files)) ?? []);

    expect(textOf(transcript, 'user')).toEqual(['original']);
    expect(textOf(transcript, 'assistant')).toEqual(['live copy']);
    expect(kinds(transcript)).toContain('divider');
  });

  it('paints a tool result compaction carried forward once, as its original', async () => {
    const stub = {
      role: 'tool',
      toolCallID: 'call_1',
      toolName: 'terminal',
      uid: 'uid-1',
      timestamp: 1_800_000_001,
    };
    const files = homeWith(
      say('assistant', '', { toolCalls: [TOOL_CALL] }),
      say('tool', 'the whole output', {
        ...stub,
        active: false,
        compacted: true,
        displayOrder: 2,
      }),
      say('tool', 'stub', { ...stub, displayOrder: 3 }),
    ).files();

    const [tool, ...others] = transcriptOf((await source().open(files)) ?? []).entries;

    expect(others).toEqual([]);
    expect(tool?.content.type === 'tool' && tool.content.value.preview?.text).toBe(
      'the whole output',
    );
  });

  it('reads content made of parts past its NUL prefix', async () => {
    const parts = [
      { type: 'text', text: 'what is this' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ];
    const files = homeWith(insertMessage({ role: 'user', content: partsLiteral(parts) })).files();

    const transcript = transcriptOf((await source().open(files)) ?? []);

    expect(textOf(transcript, 'user')).toEqual(['what is this']);
    const user = transcript.entries[0]?.content;
    expect(user?.type === 'user' && user.value.imageCount).toBe(1);
  });

  it('a poll reads nothing until a row comes, then only that row', async () => {
    const home = homeWith(say('user', 'one'));
    const files = home.files();
    const followed = source();
    await followed.open(files);

    expect(await followed.poll(files)).toEqual({ type: 'unchanged' });

    home.run(say('assistant', 'two', { finishReason: 'stop' }));
    const change = await followed.poll(files);

    if (change.type !== 'appended') throw new Error(`expected appended, got ${change.type}`);
    const rows = change.lines.filter((line) => decodeUtf8(line.data).includes('"k":"row"'));
    expect(rows).toHaveLength(1);
    expect(await followed.poll(files)).toEqual({ type: 'unchanged' });
  });

  it('a row rewritten in place, or undone, reads the conversation again', async () => {
    const home = homeWith(say('user', 'one'), say('assistant', 'two', { finishReason: 'stop' }));
    const files = home.files();
    const followed = source();
    await followed.open(files);

    home.run(`UPDATE messages SET content = 'two, rewritten' WHERE role = 'assistant';
      UPDATE sessions SET transcript_revision = transcript_revision + 1;`);
    const rewritten = await followed.poll(files);
    if (rewritten.type !== 'reset') throw new Error(`expected reset, got ${rewritten.type}`);
    expect(textOf(transcriptOf(rewritten.lines), 'assistant')).toEqual(['two, rewritten']);

    home.run(`UPDATE messages SET active = 0 WHERE role = 'assistant';`);
    const undone = await followed.poll(files);
    if (undone.type !== 'reset') throw new Error(`expected reset, got ${undone.type}`);
    expect(textOf(transcriptOf(undone.lines), 'assistant')).toEqual([]);
  });

  it('pages older rows in, and reads a whole tool result again for an expanded row', async () => {
    const long = 'x'.repeat(40_000);
    const files = homeWith(
      say('user', 'older'),
      say('assistant', '', { toolCalls: [TOOL_CALL] }),
      say('tool', long, { toolCallID: 'call_1', toolName: 'terminal' }),
      say('assistant', 'newer', { finishReason: 'stop' }),
    ).files();
    const followed = new StoreRecordSource(hermesStore, SESSION, {
      tail: 20_000,
      poll: 1 << 20,
      olderPage: 1 << 20,
      olderMaximumPage: 1 << 20,
      olderSearch: 1 << 20,
      outputLimit: 1 << 20,
    });

    const lines = (await followed.open(files)) ?? [];
    const newest = transcriptOf(lines);
    expect(followed.hasOlder).toBe(true);
    const tool = newest.entries.find((entry) => entry.content.type === 'tool')?.content;
    if (tool?.type !== 'tool' || tool.value.output === null) throw new Error('tool');
    expect(tool.value.preview?.isTruncated).toBe(true);

    const page = await followed.loadOlder(files);
    if (page.type !== 'lines') throw new Error(`expected lines, got ${page.type}`);
    expect(followed.hasOlder).toBe(false);

    const line = await followed.line(tool.value.output, files);
    if (line === null) throw new Error('line');
    const output = new HermesTranscriptReducer().output(line, tool.value);
    expect(output?.type === 'preview' && output.preview?.text.length).toBeGreaterThan(8_000);
  });

  it('reads the segments compression rotated the session out of, oldest first', async () => {
    const segment = (id: string, parent: string | null, end: string | null) =>
      `INSERT INTO sessions (id, parent_session_id, end_reason) VALUES
        (${quoted(id)}, ${quoted(parent)}, ${quoted(end)});`;
    const home = homeWith(
      segment('root', null, 'compression'),
      segment('middle', 'root', 'compression'),
      `UPDATE sessions SET parent_session_id = 'middle' WHERE id = ${quoted(SESSION)};`,
      insertMessage({ role: 'user', content: quoted('first'), displayOrder: 1 }, 'root'),
      insertMessage({ role: 'user', content: quoted('second'), displayOrder: 1 }, 'middle'),
      insertMessage({ role: 'user', content: quoted('third'), displayOrder: 1 }),
    );
    const lines = (await source().open(home.files())) ?? [];
    expect(textOf(transcriptOf(lines), 'user')).toEqual(['first', 'second', 'third']);
  });

  it('shows once what rotation cloned into the next segment', async () => {
    const home = homeWith(
      `INSERT INTO sessions (id, end_reason) VALUES ('old', 'compression');`,
      `UPDATE sessions SET parent_session_id = 'old' WHERE id = ${quoted(SESSION)};`,
      insertMessage({ role: 'user', content: quoted('asked'), timestamp: 1 }, 'old'),
      insertMessage({ role: 'user', content: quoted('cloned'), timestamp: 2 }, 'old'),
      insertMessage({ role: 'user', content: quoted('cloned'), timestamp: 2 }),
      insertMessage({ role: 'user', content: quoted('newest'), timestamp: 3 }),
    );
    const lines = (await source().open(home.files())) ?? [];
    expect(textOf(transcriptOf(lines), 'user')).toEqual(['asked', 'cloned', 'newest']);
  });

  it('a branch of a rotated segment keeps to its own copy', async () => {
    const home = homeWith(
      `INSERT INTO sessions (id, end_reason) VALUES ('old', 'compression');`,
      `UPDATE sessions SET parent_session_id = 'old',
         model_config = '{"_branched_from":"old"}' WHERE id = ${quoted(SESSION)};`,
      insertMessage({ role: 'user', content: quoted('parent only') }, 'old'),
      insertMessage({ role: 'user', content: quoted('branch') }),
    );
    const lines = (await source().open(home.files())) ?? [];
    expect(textOf(transcriptOf(lines), 'user')).toEqual(['branch']);
  });

  it('stops at a parent that did not end in compression, and pages across segments', async () => {
    const home = homeWith(
      `INSERT INTO sessions (id, end_reason) VALUES ('forked', 'branched');
       INSERT INTO sessions (id, parent_session_id, end_reason) VALUES ('old', 'forked', 'compression');`,
      `UPDATE sessions SET parent_session_id = 'old' WHERE id = ${quoted(SESSION)};`,
      insertMessage({ role: 'user', content: quoted('not ours'), displayOrder: 1 }, 'forked'),
      insertMessage({ role: 'user', content: quoted('x'.repeat(30_000)) }, 'old'),
      insertMessage({ role: 'user', content: quoted('y'.repeat(30_000)), displayOrder: 1 }),
    );
    const files = home.files();
    const followed = new StoreRecordSource(hermesStore, SESSION, {
      tail: 20_000,
      poll: 1 << 20,
      olderPage: 1 << 20,
      olderMaximumPage: 1 << 20,
      olderSearch: 1 << 20,
      outputLimit: 1 << 20,
    });
    await followed.open(files);
    expect(followed.hasOlder).toBe(true);
    const page = await followed.loadOlder(files);
    if (page.type !== 'lines') throw new Error(`expected lines, got ${page.type}`);
    expect(followed.hasOlder).toBe(false);
    const texts = textOf(transcriptOf(page.lines), 'user');
    expect(texts).toHaveLength(1);
    expect(texts[0]?.startsWith('x')).toBe(true);
  });

  it('finds the session in the open store of a profile', async () => {
    const home = homeWith();
    await home.moveToOpenProfile('someone', say('user', 'from a profile'));

    const transcript = transcriptOf((await source().open(home.files())) ?? []);

    expect(textOf(transcript, 'user')).toEqual(['from a profile']);
    expect(transcript.title).toBe('Profile title');
  });

  it('says why it cannot read', async () => {
    const reason = async (files: ChatHostFiles, session = SESSION) => {
      const failure = await new StoreRecordSource(hermesStore, session)
        .open(files)
        .catch((error: unknown) => error);
      if (!(failure instanceof ChatSourceUnavailable)) throw new Error('expected a reason');
      return failure.reason.kind === 'sessionStore' ? failure.reason.problem.kind : null;
    };
    const absent = new HermesHome(null);
    homes.push(absent);
    expect(await reason(absent.files())).toBe('noStore');

    const other = homeWith();
    expect(await reason(other.files(), 'local-ffff')).toBe('sessionMissing');

    const older = new HermesHome(null);
    homes.push(older);
    older.run('CREATE TABLE sessions (id TEXT); CREATE TABLE messages (id INT);');
    expect(await reason(older.files())).toBe('unsupportedLayout');
  });

  it('reads a rollback database without touching it, and leaves a closed WAL one unopened', async () => {
    const home = homeWith(say('user', 'one'));
    const digest = () => createHash('sha256').update(readFileSync(home.database)).digest('hex');
    const before = digest();
    expect((await source().open(home.files()))?.length).toBeGreaterThan(0);
    expect(digest()).toBe(before);
    expect(readdirSync(home.directory)).toEqual(['state.db']);

    home.run('PRAGMA journal_mode = WAL;');
    const failure = await source()
      .open(home.files())
      .catch((error: unknown) => error);
    if (!(failure instanceof ChatSourceUnavailable)) throw new Error('expected a reason');
    expect(failure.reason).toMatchObject({ problem: { kind: 'storeClosed' } });
    expect(readdirSync(home.directory)).toEqual(['state.db']);
  });
});

describe('Hermes statements', () => {
  it('keep to what both readers can split', () => {
    const cursor = {
      eventSeq: 9,
      generation: '2.1',
      lowSeq: 1,
      highSeq: 9,
      knownInWindow: 3,
      openRows: [],
      updatedSince: 0,
      budget: 1024,
    };
    const queries = [
      { kind: 'tail', budget: 1024 },
      { kind: 'poll', cursor },
      { kind: 'older', before: 4, budget: 1024 },
      { kind: 'row', seq: 3, outputLimit: 2048 },
    ] as const;
    for (const query of queries) {
      for (const statement of hermesStatements({ session: SESSION, query })) {
        expect(statement).not.toContain(';');
        expect(statement.split('\n').some((line) => line.startsWith('.'))).toBe(false);
      }
    }
  });
});
