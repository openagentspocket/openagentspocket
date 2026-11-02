// Ported from Swift ClaudeWorkflowJournalTests and WorkflowJournalFollowerTests.

import { describe, expect, it } from 'vitest';
import { decodeUtf8, encodeUtf8 } from '../../events/utf8';
import { FakeHostFiles } from '../model/fake-host-files';
import { WorkflowJournalFollower } from '../model/journal-follower';
import { type ChatLine, frameLines } from '../model/lines';
import { workflowCounts } from '../model/workflow-progress';
import { ClaudeWorkflowJournal } from './workflow-journal';

const PATH =
  '/home/dev/.claude/projects/-home-dev-docs/s1/subagents/workflows/wf_0a1b2c3d-4e5/journal.jsonl';
const launched = '{"type":"launched"}\n';
const started = (key: string, label: string, phase = 'Audit') =>
  `{"type":"started","key":"v2:${key}","agentId":"a-${key}","label":"${label}","phase":"${phase}"}\n`;
const result = (key: string, text = 'Looks right.') =>
  `{"type":"result","key":"v2:${key}","agentId":"a-${key}","result":"${text}"}\n`;
const failed = (key: string) => `{"type":"failed","key":"v2:${key}","agentId":"a-${key}"}\n`;
const lines = (text: string, options = {}) => frameLines(encodeUtf8(text), options);
const texts = (list: ChatLine[]) => list.map((line) => decodeUtf8(line.data));

describe('ClaudeWorkflowJournal', () => {
  it('agents run until their result or failure', () => {
    const journal = new ClaudeWorkflowJournal();
    journal.apply(
      lines(
        launched +
          started('1', 'audit:pairing') +
          started('2', 'audit:hosts') +
          result('1') +
          started('3', 'verify:hosts', 'Verify') +
          failed('2') +
          '{"type":"restoring"}\n',
      ),
    );
    const progress = journal.progress(null);
    expect(progress.agents).toEqual([
      { id: 'v2:1', label: 'audit:pairing', phase: 'Audit', state: 'done' },
      { id: 'v2:2', label: 'audit:hosts', phase: 'Audit', state: 'failed' },
      { id: 'v2:3', label: 'verify:hosts', phase: 'Verify', state: 'running' },
    ]);
    expect(workflowCounts(progress)).toEqual({ done: 1, failed: 1, started: 3 });
    expect(journal.unreadableLines).toBe(0);
  });

  it('an agent started again is the same agent', () => {
    const journal = new ClaudeWorkflowJournal();
    journal.apply(lines(started('1', 'audit:pairing') + failed('1')));
    journal.apply(lines(started('1', 'audit:pairing')));
    expect(journal.progress(null).agents.map((agent) => agent.state)).toEqual(['running']);
  });

  it('a result line cut to its start still counts', () => {
    const long = result('1', 'x'.repeat(6000));
    const framed = lines(`${started('1', 'audit:pairing')}${long}{not json}\n`, {
      lineCap: 4096,
      prefixCap: 1024,
    });
    const journal = new ClaudeWorkflowJournal();
    journal.apply(framed);
    expect(workflowCounts(journal.progress(null)).done).toBe(1);
    expect(journal.unreadableLines).toBe(1);
  });

  it('a start without a key is unreadable, and wrongly typed fields read as absent', () => {
    const journal = new ClaudeWorkflowJournal();
    journal.apply(
      lines('{"type":"started","label":"x"}\n{"type":"started","key":"k","label":7}\n'),
    );
    expect(journal.unreadableLines).toBe(1);
    expect(journal.progress(null).agents).toEqual([
      { id: 'k', label: null, phase: null, state: 'running' },
    ]);
  });
});

describe('WorkflowJournalFollower', () => {
  const limits = {
    readChunk: 256,
    anchorLength: 8,
    lineCap: 4096,
    prefixCap: 1024,
    maximumBytes: 4096,
  };
  const changeTexts = (change: { type: string; lines?: ChatLine[] }) => texts(change.lines ?? []);

  it('reads from the first byte within its budget', async () => {
    const files = new FakeHostFiles();
    const text = launched + started('1', 'audit:pairing') + started('2', 'audit:hosts');
    files.write(PATH, text);
    const follower = new WorkflowJournalFollower(PATH, limits);
    const first = await follower.poll(files, 100);
    expect(changeTexts(first)).toEqual(['{"type":"launched"}']);
    expect(follower.isCaughtUp).toBe(false);
    const rest = await follower.poll(files, 1000);
    expect(changeTexts(rest)).toHaveLength(2);
    expect(follower.isCaughtUp).toBe(true);
    expect(follower.readOffset).toBe(encodeUtf8(text).length);
  });

  it('a quiet journal costs no read and an append costs one', async () => {
    const files = new FakeHostFiles();
    files.write(PATH, launched + started('1', 'audit:pairing'));
    const follower = new WorkflowJournalFollower(PATH, limits);
    await follower.poll(files, 4096);
    const before = files.readCount;
    expect(await follower.poll(files, 4096)).toEqual({ type: 'unchanged' });
    expect(files.readCount).toBe(before);

    files.append(PATH, result('1'));
    const appended = await follower.poll(files, 4096);
    expect(changeTexts(appended)).toEqual([result('1').trimEnd()]);
    expect(files.readCount).toBe(before + 1);
  });

  it('a journal that no longer continues starts over', async () => {
    const files = new FakeHostFiles();
    files.write(PATH, launched + started('1', 'audit:pairing') + result('1'));
    const follower = new WorkflowJournalFollower(PATH, limits);
    await follower.poll(files, 4096);

    const shorter = launched + started('2', 'audit:hosts');
    files.write(PATH, shorter, 2);
    expect(await follower.poll(files, 4096)).toEqual({ type: 'restarted', lines: lines(shorter) });

    const rewritten = launched + started('3', 'audit:keys') + result('3', 'Rewritten');
    files.write(PATH, rewritten, 3);
    expect(await follower.poll(files, 4096)).toEqual({
      type: 'restarted',
      lines: lines(rewritten),
    });

    // The same length, written again in a later second.
    const same = rewritten.replace('Rewritten', 'Rewrote!!');
    files.write(PATH, same, 4);
    expect(await follower.poll(files, 4096)).toEqual({ type: 'restarted', lines: lines(same) });
    expect(follower.isCaughtUp).toBe(true);
  });

  it('reports a missing or oversized journal', async () => {
    const files = new FakeHostFiles();
    const follower = new WorkflowJournalFollower(PATH, limits);
    expect(await follower.poll(files, 4096)).toEqual({ type: 'missing' });
    files.write(PATH, started('1', 'audit:pairing').repeat(60));
    expect(await follower.poll(files, 4096)).toEqual({ type: 'tooLarge' });
  });

  it('a followed journal reads what it appends past the cap', async () => {
    const files = new FakeHostFiles();
    const one = started('1', 'audit:pairing');
    const text = one.repeat(Math.floor(4000 / encodeUtf8(one).length));
    files.write(PATH, text);
    const follower = new WorkflowJournalFollower(PATH, limits);
    await follower.poll(files, 4096);

    files.append(PATH, result('1') + result('2'));
    expect(changeTexts(await follower.poll(files, 4096))).toHaveLength(2);

    // Read again from its start, it is over the cap.
    files.write(PATH, `x${text}${result('1')}${result('2')}`, 9);
    expect(await follower.poll(files, 4096)).toEqual({ type: 'tooLarge' });
  });

  it('a failed read keeps the last good position', async () => {
    const files = new FakeHostFiles();
    files.write(PATH, launched);
    const follower = new WorkflowJournalFollower(PATH, limits);
    await follower.poll(files, 4096);
    const offset = follower.readOffset;
    files.append(PATH, started('1', 'audit:pairing'));
    files.failing.add(PATH);
    await expect(follower.poll(files, 4096)).rejects.toThrow();
    expect(follower.readOffset).toBe(offset);
    files.failing.delete(PATH);
    expect(changeTexts(await follower.poll(files, 4096))).toHaveLength(1);
  });
});
