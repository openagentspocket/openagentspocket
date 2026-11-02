// Unit cases for the Codex engine's pieces: line classifier, prefix repair, tool summaries,
// message display rules, pending-echo matching and the rollout locator.

import { describe, expect, it } from 'vitest';
import { decodeUtf8, encodeUtf8 } from '../../events/utf8';
import { FakeHostFiles } from '../model/fake-host-files';
import { classifyLine } from './classifier';
import { isCompleteObject, repairedPrefix } from './json-prefix';
import {
  CodexTranscriptLocator,
  dateDirectories,
  liveSegment,
  parseRolloutFileName,
  threadCreationTime,
} from './locator';
import {
  displayUserContent,
  ideRequest,
  isContextualLegacyMessage,
  questionReplies,
  skillInvocation,
} from './message-formatter';
import { codexEchoKey, matchPendingSends } from './pending-echo';
import { userContent } from './record';
import { contextUsageIn } from './token-count';
import * as summary from './tool-summary';

const bytes = (text: string) => encodeUtf8(text);

describe('line classifier', () => {
  it('reads kind and ordinal from the prefix, in any key order', () => {
    const line = bytes(
      '{"timestamp":"t","ordinal":7,"type":"response_item","payload":{"type":"function_call","name":"shell","call_id":"c1"}}',
    );
    expect(classifyLine(line)).toMatchObject({
      kind: { type: 'response', value: 'function_call' },
      ordinal: 7,
      name: 'shell',
      callID: 'c1',
    });
  });

  it('reads the item type of an item_completed event', () => {
    const line = bytes(
      '{"type":"event_msg","payload":{"type":"item_completed","item":{"type":"AgentMessage"}}}',
    );
    expect(classifyLine(line).kind).toEqual({ type: 'item', value: 'AgentMessage' });
  });

  it('leaves what the limit cuts off unset and unclassifiable', () => {
    const line = bytes(
      '{"type":"event_msg","payload":{"type":"item_completed","item":{"type":"X"}}}',
    );
    expect(classifyLine(line, 30).kind).toEqual({ type: 'unclassified' });
    expect(classifyLine(bytes('garbage')).kind).toEqual({ type: 'unclassified' });
  });

  it('separates ignorable from unknown top-level types', () => {
    expect(classifyLine(bytes('{"type":"turn_context","payload":{}}')).kind.type).toBe('ignorable');
    expect(classifyLine(bytes('{"type":"future","payload":{}}')).kind).toEqual({
      type: 'unknown',
      value: 'future',
    });
  });
});

describe('JSON prefix', () => {
  it('accepts exactly one whole object', () => {
    expect(isCompleteObject(bytes(' {"a":[1,{"b":null}]} '))).toBe(true);
    expect(isCompleteObject(bytes('{"a":1'))).toBe(false);
    expect(isCompleteObject(bytes('{"a":1}{"b":2}'))).toBe(false);
  });

  it('cuts a prefix back to its last complete value and closes it', () => {
    const repaired = repairedPrefix(bytes('{"a":1,"b":{"c":[1,2'));
    expect(repaired && JSON.parse(decodeUtf8(repaired))).toEqual({ a: 1, b: { c: [1] } });
    expect(repairedPrefix(bytes('["x"'))).toBeNull();
    expect(repairedPrefix(bytes('{"a":"unfinished'))).not.toBeNull();
  });
});

describe('tool summaries', () => {
  it('titles a command by its shell script or a shell-quoted argv', () => {
    expect(summary.commandTitle(['bash', '-lc', 'ls -la'])).toBe('ls -la');
    expect(summary.commandTitle(['/bin/zsh', '-c', 'pwd'])).toBe('pwd');
    expect(summary.commandTitle(['pwsh', '-NoProfile', '-Command', 'Get-Date'])).toBe('Get-Date');
    expect(summary.commandTitle(['git', 'commit', '-m', 'a b'])).toBe("git commit -m 'a b'");
    expect(summary.shellQuote("it's")).toBe('"it\'s"');
    expect(summary.shellQuote('$x')).toBe("'$x'");
    expect(summary.shellQuote('')).toBe("''");
  });

  it('derives kind and subtitle from parsed commands', () => {
    const read = { type: 'read', cmd: null, name: 'a.ts', path: null, query: null };
    const search = { type: 'search', cmd: null, name: null, path: null, query: 'foo' };
    const other = { type: 'unknown', cmd: null, name: null, path: null, query: null };
    expect(summary.commandKind([read])).toEqual({ kind: 'fileRead', subtitle: 'a.ts' });
    expect(summary.commandKind([read, search])).toEqual({ kind: 'search', subtitle: 'foo' });
    expect(summary.commandKind([read, other]).kind).toBe('command');
    expect(summary.commandKind([]).kind).toBe('command');
  });

  it('summarizes file changes and patches', () => {
    const changes = {
      '/work/b.txt': { type: 'add', content: 'x\ny\n', unifiedDiff: null, movePath: null },
      '/work/a.txt': {
        type: 'update',
        content: null,
        unifiedDiff: '--- a\n+++ b\n+1\n-2\n-3\n',
        movePath: '/work/c.txt',
      },
    };
    expect(summary.fileChangeSummary(changes, '/work')).toEqual({
      title: 'a.txt → c.txt, b.txt',
      kind: 'fileEdit',
      diff: { added: 3, removed: 2, files: 2 },
    });
    const patch = '*** Begin Patch\n*** Add File: /work/n.txt\n+hi\n*** End Patch';
    expect(summary.patchSummary(patch, '/work')).toEqual({
      title: 'n.txt',
      kind: 'fileWrite',
      diff: { added: 1, removed: 0, files: 1 },
    });
    expect(summary.patchSummary('nothing', null)).toBeNull();
    expect(summary.relativePath('/work/x', '/work/')).toBe('x');
    expect(summary.relativePath('/other/x', '/work')).toBe('/other/x');
  });

  it('reads string-literal patches out of a code-mode script', () => {
    const script =
      'await tools.apply_patch("*** Begin Patch\\n*** Add File: a\\n+x\\n*** End Patch");';
    expect(summary.codeModePatches(script, 'tools.apply_patch(')).toEqual([
      '*** Begin Patch\n*** Add File: a\n+x\n*** End Patch',
    ]);
    expect(summary.codeModePatches('tools.apply_patch(patch)', 'tools.apply_patch(')).toEqual([]);
  });

  it('parses the three legacy output formats', () => {
    expect(summary.legacyOutput('{"output":"hi","metadata":{"exit_code":2}}')).toEqual({
      exitCode: 2,
      body: 'hi',
    });
    expect(summary.legacyOutput('Exit code: 1\nWall time: 1s\nOutput:\nboom')).toEqual({
      exitCode: 1,
      body: 'boom',
    });
    expect(summary.legacyOutput('Process exited with code 0\nOutput:\nok').exitCode).toBe(0);
    expect(summary.legacyOutput('plain')).toEqual({ exitCode: null, body: 'plain' });
  });

  it('shows an API error body by its message and keeps anything else', () => {
    expect(summary.errorDisplay('{"error":{"message":"overloaded"}}')).toBe('overloaded');
    expect(summary.errorDisplay('{"message":"m"}')).toBe('m');
    expect(summary.errorDisplay('plain')).toBe('plain');
    expect(summary.displayAnswer('A\nuser_note: why')).toBe('A\nwhy');
  });
});

describe('message display', () => {
  it('folds an IDE preamble into a chip', () => {
    const text = '# Context from my IDE setup:\nfiles\n## My request for Codex:\n do it ';
    expect(ideRequest(text)).toBe('do it');
    const display = displayUserContent(userContent(text), new Set());
    expect(display).toMatchObject({
      type: 'message',
      message: { text: 'do it', attachmentLabels: [expect.any(String)] },
    });
  });

  it('reads an async question reply as answers', () => {
    const body = JSON.stringify([
      { questionItemId: '["request_user_input_async","i",0]', question: 'Q', answer: 'A' },
    ]);
    const text = `<send_user_message_question_reply>${body}</send_user_message_question_reply>`;
    expect(questionReplies(text)).toEqual([
      { questionItemID: '["request_user_input_async","i",0]', question: 'Q', answer: 'A' },
    ]);
    expect(displayUserContent(userContent(text), new Set()).type).toBe('reply');
    expect(
      questionReplies('<send_user_message_question_reply>[]</send_user_message_question_reply>'),
    ).toBeNull();
  });

  it('reads a known $skill prompt as a command', () => {
    expect(skillInvocation('$review the diff', new Set(['review']))).toEqual({
      name: 'review',
      arguments: 'the diff',
    });
    expect(skillInvocation('$HOME/x', new Set(['HOME']))).toBeNull();
    expect(skillInvocation('$unknown a', new Set(['review']))).toBeNull();
  });

  it('recognizes legacy context messages', () => {
    expect(isContextualLegacyMessage('<environment_context>x</environment_context>', null)).toBe(
      true,
    );
    expect(isContextualLegacyMessage('hello', 'user_instructions')).toBe(true);
    expect(isContextualLegacyMessage('hello', null)).toBe(false);
  });
});

describe('pending echo', () => {
  it('normalizes what the TUI and Agentico change', () => {
    expect(codexEchoKey('a\r\nb\rc​ \u001b[31m')).toBe('a\nb\nc');
    expect(codexEchoKey('  hi\u0007 ')).toBe('hi');
  });

  it('matches first in, first out and one to one, after the cursor only', () => {
    const cursor = { rolloutID: 'r', offset: 100 };
    const prompt = (offset: number, entryID: string) => ({
      rolloutID: 'r',
      offset,
      entryID,
      kind: { type: 'prompt' as const, text: 'go', localImagePaths: [] },
    });
    const candidates = [prompt(50, 'old'), prompt(120, 'e1'), prompt(130, 'e2')];
    const sends = [
      { text: 'go ', cursor },
      { text: 'go ', cursor },
      { text: 'go ', cursor },
    ];
    expect(matchPendingSends(sends, candidates)).toEqual(['e1', 'e2', null]);
  });
});

describe('token count', () => {
  it('reads the context share and tolerates renamed fields', () => {
    const line = (info: string) =>
      bytes(`{"type":"event_msg","payload":{"type":"token_count","info":${info}}}`);
    expect(
      contextUsageIn(line('{"model_context_window":1000,"last_token_usage":{"total_tokens":10}}')),
    ).toEqual({ usedTokens: 10, windowTokens: 1000 });
    expect(
      contextUsageIn(
        line(
          '{"model_context_window":1000,"last_token_usage":{"input_tokens":4,"output_tokens":1}}',
        ),
      ),
    ).toEqual({ usedTokens: 5, windowTokens: 1000 });
    expect(contextUsageIn(line('null'))).toBeNull();
    expect(contextUsageIn(bytes('{"type":"other"}'))).toBeNull();
  });
});

const THREAD = '01a10f87-e025-7fb1-8974-8dd09937767a';
const REVERT = '01a2b3c4-0000-7000-8000-000000000001';
const SESSIONS = '/home/user/.codex/sessions';
/** 2026-10-06T06:00:00Z, the day the fixture thread started. */
const SAME_DAY = 1_791_266_400_000;

const rolloutName = (time: string, rollout?: string, suffix = '.jsonl') =>
  `rollout-${time}-${THREAD}${rollout ? `_${rollout}` : ''}${suffix}`;
const meta = (id: string, padding = 0) =>
  `${JSON.stringify({ type: 'session_meta', payload: { id, base_instructions: 'x'.repeat(padding) } })}\n`;

describe('rollout file names', () => {
  it('parses root and revert segments and compressed copies', () => {
    expect(parseRolloutFileName(rolloutName('2026-10-06T12-45-25'))).toMatchObject({
      threadID: THREAD,
      rolloutID: THREAD,
      isCompressed: false,
    });
    expect(
      parseRolloutFileName(rolloutName('2026-10-06T12-45-25', REVERT, '.jsonl.zst')),
    ).toMatchObject({
      threadID: THREAD,
      rolloutID: REVERT,
      isCompressed: true,
    });
    expect(parseRolloutFileName('notes.txt')).toBeNull();
    expect(parseRolloutFileName('rollout-short.jsonl')).toBeNull();
  });

  it('reads the creation time of a version 7 thread id only', () => {
    expect(threadCreationTime(THREAD)).toBe(0x01a10f87e025);
    expect(threadCreationTime('01a10f87-e025-4fb1-8974-8dd09937767a')).toBeNull();
    expect(dateDirectories(THREAD, SAME_DAY)).toContain('2026/10/06');
  });
});

describe('Codex transcript locator', () => {
  const locate = (files: FakeHostFiles, now = SAME_DAY) =>
    new CodexTranscriptLocator(files, () => now).locate(THREAD);

  it('finds the rollout under its creation date', async () => {
    const files = new FakeHostFiles();
    const path = `${SESSIONS}/2026/10/06/${rolloutName('2026-10-06T12-45-25')}`;
    files.write(path, meta(THREAD));
    const result = await locate(files);
    expect(result.ok && liveSegment(result.location)?.path).toBe(path);
  });

  it('finds a revert segment from another day as the live one', async () => {
    const files = new FakeHostFiles();
    const base = `${SESSIONS}/2026/10/06/${rolloutName('2026-10-06T12-45-25')}`;
    const child = `${SESSIONS}/2026/10/09/${rolloutName('2026-10-09T10-00-00', REVERT)}`;
    files.write(base, meta(THREAD));
    files.write(child, meta(THREAD));
    const result = await locate(files, 1_791_540_000_000);
    expect(result.ok && result.location.segments.map((s) => s.path)).toEqual([base, child]);
    expect(result.ok && liveSegment(result.location)?.name.rolloutID).toBe(REVERT);
  });

  it('looks in archived sessions when the dates hold none', async () => {
    const files = new FakeHostFiles();
    const path = `/home/user/.codex/archived_sessions/${rolloutName('2026-10-06T12-45-25')}`;
    files.write(path, meta(THREAD));
    const result = await locate(files);
    expect(result.ok && liveSegment(result.location)?.path).toBe(path);
  });

  it('refuses a compressed newest segment and lets a plain copy shadow its twin', async () => {
    const compressed = new FakeHostFiles();
    compressed.write(
      `${SESSIONS}/2026/10/06/${rolloutName('2026-10-06T12-45-25', undefined, '.jsonl.zst')}`,
      'z',
    );
    expect(await locate(compressed)).toEqual({ ok: false, reason: 'compressed' });

    const both = new FakeHostFiles();
    const directory = `${SESSIONS}/2026/10/06`;
    both.write(`${directory}/${rolloutName('2026-10-06T12-45-25', undefined, '.jsonl.zst')}`, 'z');
    const plain = `${directory}/${rolloutName('2026-10-06T12-45-25')}`;
    both.write(plain, meta(THREAD));
    const result = await locate(both);
    expect(result.ok && result.location.segments.map((s) => s.path)).toEqual([plain]);
  });

  it('rejects a rollout whose meta names another thread, and reads long metas in pieces', async () => {
    const other = new FakeHostFiles();
    other.write(`${SESSIONS}/2026/10/06/${rolloutName('2026-10-06T12-45-25')}`, meta(REVERT));
    expect(await locate(other)).toEqual({ ok: false, reason: 'mismatched' });

    const long = new FakeHostFiles();
    const path = `${SESSIONS}/2026/10/06/${rolloutName('2026-10-06T12-45-25')}`;
    long.write(path, meta(THREAD, 300_000));
    const result = await locate(long);
    expect(result.ok && liveSegment(result.location)?.path).toBe(path);
  });

  it('accepts a pre-envelope rollout of the thread, and finds nothing for others', async () => {
    const files = new FakeHostFiles();
    const path = `${SESSIONS}/2026/10/06/${rolloutName('2026-10-06T12-45-25')}`;
    files.write(
      path,
      `${JSON.stringify({ id: THREAD.toUpperCase(), timestamp: 't', instructions: null })}\n`,
    );
    expect((await locate(files)).ok).toBe(true);

    expect(await locate(new FakeHostFiles())).toEqual({ ok: false, reason: 'notFound' });
    const stray = new FakeHostFiles();
    stray.write(`${SESSIONS}/2026/10/06/rollout-2026-10-06T12-00-00-${REVERT}.jsonl`, meta(REVERT));
    expect(await locate(stray)).toEqual({ ok: false, reason: 'notFound' });
  });
});
