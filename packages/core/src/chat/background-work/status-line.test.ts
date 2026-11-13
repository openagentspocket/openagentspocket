import { describe, expect, it } from 'vitest';
import { renderText } from '../../errors/text';
import { notice, toolActivity, userMessage } from '../model/factories';
import { type ChatBackgroundWorkItem, emptyTranscript } from '../model/types';
import { type ChatRow, type ChatRowContent, chatRow, rowID } from '../timeline/row';
import { presentBackgroundWork } from './presentation';
import { chatStatusLine, liveTurnOf, sameLiveTurn, withoutLiveTurn } from './status-line';
import { type ChatBackgroundWork, listedNotices } from './work';

const NOW = Date.parse('2026-11-13T15:20:00Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();
const row = (id: string, content: ChatRowContent): ChatRow => chatRow(rowID.entry(id), content, 0);
const header = (since: string): ChatRow =>
  chatRow(
    rowID.liveTurn,
    {
      type: 'turnHeader',
      header: { state: { kind: 'working', since }, isOpen: false, stepCount: 0 },
    },
    0,
  );
const call = (status: 'running' | 'succeeded' | 'awaitingApproval') =>
  row('t', {
    type: 'tool',
    tool: toolActivity({ kind: 'command', name: 'Bash', title: 'pnpm test', status }),
  });
const reasoning = row('r', {
  type: 'reasoning',
  reasoning: { text: 'Checking', durationMilliseconds: null },
});
const user = row('u', { type: 'user', message: userMessage('Go') });

type Item = Partial<ChatBackgroundWorkItem>;

function work(items: Item[]): ChatBackgroundWork {
  return {
    isLive: true,
    rows: items.map((item, index) => ({
      item: {
        id: `w${index}`,
        kind: 'subagent',
        title: `Work ${index}`,
        subtitle: 'general-purpose',
        state: 'running',
        journalPath: null,
        launchOffset: 0,
        endOffset: null,
        launchedAt: ago(30),
        agentID: null,
        resume: null,
        endedAt: null,
        usage: null,
        ...item,
      },
      progress: null,
      isStale: false,
      lastActivity: null,
    })),
  };
}

const line = (rows: ChatRow[], items: Item[] = [], isBlocked = false, notices = 0) =>
  chatStatusLine(
    liveTurnOf(rows),
    presentBackgroundWork(work(items), { isHostConnected: true, now: NOW, locale: 'en' }),
    { now: NOW, isBlocked, notices },
  );
const text = (rows: ChatRow[], items: Item[] = []) => {
  const shown = line(rows, items);
  return shown === null ? null : renderText(shown.text);
};

describe('the status line over the Composer', () => {
  it('is absent with no turn running and nothing for the sheet to list', () => {
    expect(line([user])).toBeNull();
    expect(line([user], [], true)).toBeNull();
  });

  it('stays after the turn while the sheet lists finished work or notices, with counts only', () => {
    const done = line([user], [{ state: 'completed', endedAt: ago(5) }, { state: 'failed' }], true);
    expect(renderText(done?.text ?? '')).toBe('1 done · 1 failed');
    expect(done?.state).toBe('failed');
    expect(done?.ticks).toBe(false);
    const notices = line([user], [], false, 2);
    expect(renderText(notices?.text ?? '')).toBe('2 notices');
    expect(notices?.state).toBe('completed');
  });

  it('says how long the turn has worked, then what the newest record shows', () => {
    expect(text([user, header(ago(116))])).toBe('Working for 1m 56s');
    expect(text([user, header(ago(116)), reasoning])).toBe('Working for 1m 56s · Thinking');
    expect(text([user, header(ago(5)), call('running')])).toBe('Working for 5s · pnpm test');
    // A call that returned says nothing about what comes next.
    expect(text([user, header(ago(5)), call('succeeded')])).toBe('Working for 5s');
    expect(line([user, header(ago(5))])?.ticks).toBe(true);
  });

  it('says the Agent waits on the user for an approval or a Blocked report', () => {
    const waiting = line([user, header(ago(5)), call('awaitingApproval')]);
    expect(waiting?.state).toBe('waiting');
    expect(renderText(waiting?.text ?? '')).toBe('Working for 5s · Needs you');
    expect(line([user, header(ago(5)), reasoning], [], true)?.state).toBe('waiting');
  });

  it('folds running and finished work into counts', () => {
    const items: Item[] = [{}, { state: 'completed' }, { state: 'completed' }, { state: 'failed' }];
    expect(text([user, header(ago(5))], items)).toBe(
      'Working for 5s · 1 running · 2 done · 1 failed',
    );
    // Work still running after the turn keeps the line, without a time of its own.
    const after = line([user], [{}, { state: 'completed' }]);
    expect(renderText(after?.text ?? '')).toBe('1 running · 1 done');
    expect(after?.state).toBe('running');
    expect(after?.ticks).toBe(true);
  });

  it('leaves the live header out of the rows, and tells a changed turn from the same one', () => {
    const rows = [user, header(ago(5)), reasoning];
    expect(withoutLiveTurn(rows).map((shown) => shown.id)).toEqual([user.id, reasoning.id]);
    expect(sameLiveTurn(liveTurnOf(rows), liveTurnOf([...rows]))).toBe(true);
    const running = liveTurnOf([user, header(ago(5)), call('running')]);
    expect(sameLiveTurn(liveTurnOf(rows), running)).toBe(false);
    expect(sameLiveTurn(null, liveTurnOf(rows))).toBe(false);
    expect(sameLiveTurn(null, null)).toBe(true);
  });
});

describe('harness notices for the sheet', () => {
  it('lists the task notifications since the latest message, and nothing else', () => {
    const entry = (id: string, sourceOffset: number, value = notice('taskNotification', 'x')) => ({
      id,
      sourceOffset,
      content: { type: 'notice' as const, value },
    });
    const transcript = {
      ...emptyTranscript(),
      latestPromptOffset: 10,
      entries: [
        entry('old', 5),
        entry('new', 20),
        entry('other', 21, notice('interrupted', 'Interrupted')),
      ],
    };
    expect(listedNotices(transcript).map((listed) => listed.id)).toEqual(['new']);
  });
});
