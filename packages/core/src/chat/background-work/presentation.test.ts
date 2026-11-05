import { describe, expect, it } from 'vitest';
import { renderText } from '../../errors/text';
import type { BackgroundWorkUsage, ChatBackgroundWorkItem } from '../model/types';
import type { ChatWorkflowAgent, ChatWorkflowProgress } from '../model/workflow-progress';
import { presentBackgroundWork } from './presentation';
import type { BackgroundWorkRow, ChatBackgroundWork } from './work';

const NOW = Date.parse('2026-10-06T15:20:00Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();
// The platform's space before AM/PM varies (a narrow no-break space in newer ICU).
const plain = (text: string) => text.replace(/[  ]/g, ' ');

function row(
  id: string,
  options: {
    kind?: 'subagent' | 'workflow';
    state?: ChatBackgroundWorkItem['state'];
    subtitle?: string | null;
    launchedAgo?: number | null;
    endedAgo?: number | null;
    usage?: Partial<BackgroundWorkUsage>;
    progress?: ChatWorkflowProgress;
    isStale?: boolean;
    lastActivity?: string | null;
  } = {},
): BackgroundWorkRow {
  const launchedAgo = options.launchedAgo === undefined ? 60 : options.launchedAgo;
  return {
    item: {
      id,
      kind: options.kind ?? 'subagent',
      title: id,
      subtitle: options.subtitle ?? null,
      state: options.state ?? 'running',
      journalPath: null,
      launchOffset: 0,
      endOffset: null,
      launchedAt: launchedAgo === null ? null : ago(launchedAgo),
      endedAt: options.endedAgo == null ? null : ago(options.endedAgo),
      usage: options.usage
        ? {
            tokens: null,
            toolUses: null,
            durationMilliseconds: null,
            agents: null,
            agentsDone: null,
            agentsFailed: null,
            ...options.usage,
          }
        : null,
    },
    progress: options.progress ?? null,
    isStale: options.isStale ?? false,
    lastActivity: options.lastActivity ?? null,
  };
}

const agent = (
  id: string,
  label: string | null,
  phase: string,
  state: ChatWorkflowAgent['state'],
): ChatWorkflowAgent => ({ id, label, phase, state });

function present(
  rows: BackgroundWorkRow[],
  options: { isLive?: boolean; isHostConnected?: boolean } = {},
) {
  const work: ChatBackgroundWork = { rows, isLive: options.isLive ?? true };
  return presentBackgroundWork(work, {
    isHostConnected: options.isHostConnected ?? true,
    now: NOW,
    locale: 'en-US',
    timeZone: 'UTC',
  });
}

const audit: ChatWorkflowProgress = {
  agents: [
    agent('k1', 'audit:setup', 'Audit', 'done'),
    agent('k2', 'audit:index', 'Audit', 'done'),
    agent('k3', null, 'Verify', 'running'),
  ],
  updatedAt: null,
};

describe('background work presentation', () => {
  it('shows running work with its time and a Workflow its fraction', () => {
    const presentation = present([
      row('Find old steps', { subtitle: 'Explore', launchedAgo: 138 }),
      row('docs-audit', {
        kind: 'workflow',
        subtitle: 'Check every page',
        launchedAgo: 3900,
        progress: audit,
      }),
      row('Check screenshots', {
        state: 'completed',
        launchedAgo: 200,
        endedAgo: 60,
        usage: { tokens: 41_200, toolUses: 14, durationMilliseconds: 124_000 },
      }),
    ]);
    const [subagent, workflow, done] = presentation.rows;
    expect(presentation.rows.map((r) => r.status)).toEqual(['running', 'running', 'completed']);
    expect(presentation.rows.map((r) => r.time)).toEqual(['2m 18s', '1h 5m', '2m 4s']);
    // A Workflow is in the phase of the agent it started last.
    expect(presentation.rows.map((r) => renderText(r.caption))).toEqual([
      'Explore',
      'Verify',
      'Subagent',
    ]);
    expect(presentation.rows.map((r) => r.fraction)).toEqual([null, { done: 2, total: 3 }, null]);
    expect(workflow?.detail).toBe('Check every page');
    expect(renderText(done?.usage ?? '')).toBe('41.2K tokens · 14 tool uses');
    expect(presentation.ticks).toBe(true);
    expect(renderText(subagent?.accessibilityLabel ?? '')).toBe(
      'Find old steps, Explore subagent, running, 2 minutes, 18 seconds',
    );
    expect(workflow?.agents.map((a) => a.label)).toEqual(['audit:setup', 'audit:index', '']);
    expect(workflow?.agents.map((a) => a.status)).toEqual(['completed', 'completed', 'running']);
  });

  it('freezes what runs when the Host is away or a read failed', () => {
    const rows = [
      row('docs-audit', { kind: 'workflow', progress: audit }),
      row('Check screenshots', { state: 'failed', launchedAgo: 90, endedAgo: 30 }),
    ];
    for (const presentation of [
      present(rows, { isLive: false }),
      present(rows, { isHostConnected: false }),
    ]) {
      const [frozen, failed] = presentation.rows;
      expect(presentation.rows.map((r) => r.status)).toEqual(['unconfirmed', 'failed']);
      expect(frozen?.time).toBeNull();
      expect(renderText(frozen?.note ?? '')).toBe('Not updating');
      expect(renderText(frozen?.shortNote ?? '')).toBe('Not updating');
      // The last read's count still stands.
      expect(frozen?.fraction).toEqual({ done: 2, total: 3 });
      expect(frozen?.agents.map((a) => a.status)).toEqual([
        'completed',
        'completed',
        'unconfirmed',
      ]);
      expect(failed?.time).toBe('1m');
      expect(presentation.ticks).toBe(false);
      expect(renderText(presentation.summary?.text ?? '')).toBe('1 not updating · 1 failed');
    }
  });

  it('says when work silent for too long was last seen', () => {
    const presentation = present([
      row('today', { kind: 'workflow', isStale: true, lastActivity: ago(7400) }),
      row('yesterday', { isStale: true, lastActivity: ago(86_400) }),
      row('unknown', { isStale: true }),
    ]);
    expect(presentation.rows.map((r) => r.status)).toEqual(['quiet', 'quiet', 'quiet']);
    expect(presentation.rows.map((r) => plain(renderText(r.note ?? '')))).toEqual([
      'No updates since 1:16 PM',
      'No updates since Oct 5, 2026, 3:20 PM',
      'No recent updates',
    ]);
    expect(presentation.rows.map((r) => plain(renderText(r.shortNote ?? '')))).toEqual([
      'Last seen 1:16 PM',
      'Last seen Oct 5',
      'No recent updates',
    ]);
    expect(plain(renderText(presentation.rows[0]?.accessibilityLabel ?? ''))).toBe(
      'today, Workflow, no updates since 1:16 PM',
    );
    expect(presentation.ticks).toBe(false);
  });

  it("puts a Workflow in its last running agent's phase", () => {
    // A retry keeps the agent's place among those started.
    const retried: ChatWorkflowProgress = {
      agents: [
        agent('k1', 'audit:setup', 'Audit', 'running'),
        agent('k2', 'verify:setup', 'Verify', 'failed'),
      ],
      updatedAt: null,
    };
    const ended: ChatWorkflowProgress = {
      agents: [
        agent('k1', 'audit:setup', 'Audit', 'done'),
        agent('k2', 'verify:setup', 'Verify', 'done'),
      ],
      updatedAt: null,
    };
    const presentation = present([
      row('retried', { kind: 'workflow', progress: retried }),
      row('ended', { kind: 'workflow', progress: ended }),
    ]);
    expect(presentation.rows.map((r) => renderText(r.caption))).toEqual(['Audit', 'Verify']);
  });

  it('reads zero when the Host clock is ahead of the phone', () => {
    expect(present([row('ahead', { launchedAgo: -45 })]).rows[0]?.time).toBe('0s');
  });

  it('takes finished work counts from its notification', () => {
    const journal: ChatWorkflowProgress = {
      agents: [
        agent('k1', 'audit:setup', 'Audit', 'done'),
        agent('k2', 'audit:index', 'Audit', 'running'),
      ],
      updatedAt: null,
    };
    const presentation = present([
      row('docs-audit', {
        kind: 'workflow',
        state: 'stopped',
        launchedAgo: 600,
        endedAgo: 300,
        usage: { agents: 4, agentsDone: 3, agentsFailed: 0 },
        progress: journal,
      }),
      row('unread', { kind: 'workflow', state: 'completed', launchedAgo: null, endedAgo: 30 }),
    ]);
    const [first, second] = presentation.rows;
    expect(first?.fraction).toEqual({ done: 3, total: 4 });
    // With no duration in the notification, the records' times say.
    expect(first?.time).toBe('5m');
    // Work that ended took its running agents with it.
    expect(first?.agents.map((a) => a.status)).toEqual(['completed', 'stopped']);
    expect(second?.fraction).toBeNull();
    expect(second?.time).toBeNull();
    expect(presentation.rows.map((r) => renderText(r.caption))).toEqual(['Audit', 'Workflow']);
  });

  it('names a running Workflow first in the summary', () => {
    const running = present([
      row('Find old steps', { subtitle: 'Explore' }),
      row('docs-audit', { kind: 'workflow', progress: audit }),
      row('Check screenshots', { state: 'completed', endedAgo: 10 }),
    ]);
    expect(running.summary?.status).toBe('running');
    expect(renderText(running.summary?.text ?? '')).toBe('2 running · docs-audit 2/3');
    expect(renderText(running.summary?.accessibilityValue ?? '')).toBe(
      '2 running, docs-audit, 2 of 3 agents done',
    );
    const subagents = present([row('Find old steps'), row('quiet', { isStale: true })]);
    expect(renderText(subagents.summary?.text ?? '')).toBe('1 running · Find old steps');
    const finished = present([
      row('a', { state: 'completed' }),
      row('b', { state: 'completed' }),
      row('c', { state: 'stopped' }),
    ]);
    expect(finished.summary?.status).toBe('completed');
    expect(renderText(finished.summary?.text ?? '')).toBe('2 done · 1 stopped');
    expect(renderText(finished.summary?.accessibilityValue ?? '')).toBe('2 done, 1 stopped');
    expect(
      present([row('a', { state: 'completed' }), row('b', { state: 'failed' })]).summary?.status,
    ).toBe('failed');
    expect(present([]).summary).toBeNull();
  });

  it('shows three rows in the strip and counts the rest', () => {
    const five = present([1, 2, 3, 4, 5].map((i) => row(`work ${i}`)));
    expect(five.stripRows.map((r) => r.id)).toEqual(['work 1', 'work 2', 'work 3']);
    expect(five.overflow).toBe(2);
    expect(present([1, 2, 3].map((i) => row(`work ${i}`))).overflow).toBe(0);
  });
});
