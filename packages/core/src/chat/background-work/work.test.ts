import { describe, expect, it } from 'vitest';
import { type ChatBackgroundWorkItem, emptyTranscript } from '../model/types';
import type { ChatWorkflowProgress } from '../model/workflow-progress';
import { backgroundWorkOf, holdsActivePace } from './work';

const NOW = Date.parse('2026-10-06T15:20:00Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

function item(
  id: string,
  options: Partial<ChatBackgroundWorkItem> & { at: number; launchedAgo?: number },
): ChatBackgroundWorkItem {
  return {
    id,
    kind: options.kind ?? 'subagent',
    title: id,
    subtitle: null,
    state: options.state ?? 'running',
    journalPath: null,
    launchOffset: options.at,
    endOffset: options.endOffset ?? null,
    launchedAt: ago(options.launchedAgo ?? 60),
    agentID: null,
    resume: null,
    endedAt: null,
    usage: null,
  };
}

const transcript = (
  backgroundWork: ChatBackgroundWorkItem[],
  latestPromptOffset: number | null = null,
) => ({
  ...emptyTranscript(),
  backgroundWork,
  latestPromptOffset,
});

describe('background work', () => {
  it('lists running work first and each part keeps launch order', () => {
    const work = backgroundWorkOf(
      transcript(
        [
          item('a', { state: 'completed', at: 10, endOffset: 50 }),
          item('b', { at: 20 }),
          item('c', { state: 'failed', at: 30, endOffset: 60 }),
          item('d', { kind: 'workflow', at: 40 }),
          item('e', { state: 'completed', at: 1, endOffset: 5 }),
        ],
        8,
      ),
      {},
      true,
      NOW,
    );
    // `e` ended before the latest prompt.
    expect(work.rows.map((row) => row.item.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(holdsActivePace(work)).toBe(true);
  });

  it('marks running work with no sign for too long as stale', () => {
    const staleness = { workflowQuiet: 100, subagentRun: 200 };
    const progress: Record<string, ChatWorkflowProgress> = {
      written: { agents: [], updatedAt: ago(30) },
    };
    const work = backgroundWorkOf(
      transcript([
        item('quiet', { kind: 'workflow', launchedAgo: 150, at: 1 }),
        item('written', { kind: 'workflow', launchedAgo: 150, at: 2 }),
        item('long', { launchedAgo: 250, at: 3 }),
        item('short', { launchedAgo: 150, at: 4 }),
      ]),
      progress,
      true,
      NOW,
      staleness,
    );
    expect(work.rows.map((row) => row.isStale)).toEqual([true, false, true, false]);
    expect(work.rows[1]?.lastActivity).toBe(ago(30));
    expect(holdsActivePace(work)).toBe(true);
    const allStale = backgroundWorkOf(
      transcript([item('long', { launchedAgo: 250, at: 3 })]),
      {},
      true,
      NOW,
      staleness,
    );
    expect(holdsActivePace(allStale)).toBe(false);
  });

  it('holds the active pace only for a live read of running work', () => {
    const running = transcript([item('b', { at: 20 })]);
    expect(holdsActivePace(backgroundWorkOf(running, {}, false, NOW))).toBe(false);
    const finished = transcript([item('b', { state: 'completed', at: 20, endOffset: 30 })]);
    expect(holdsActivePace(backgroundWorkOf(finished, {}, true, NOW))).toBe(false);
  });
});
