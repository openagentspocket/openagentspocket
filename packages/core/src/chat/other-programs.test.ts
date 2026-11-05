import { describe, expect, it } from 'vitest';
import { standardAdapter } from './engine/adapter';
import { OTHER_PROGRAM_FIXTURES, transcriptThroughAdapter } from './other-programs.testkit';
import { ChatRowBuilder, projectTimeline, turnSignals } from './timeline';

describe('the program-neutral timeline over every program', () => {
  it('has an adapter for every chat program', () => {
    for (const program of ['claude', 'codex', 'pi', 'omp', 'grok', 'opencode'] as const) {
      expect(standardAdapter(program)?.program).toBe(program);
    }
  });

  describe.each(OTHER_PROGRAM_FIXTURES.map((entry) => [entry.program, entry] as const))(
    '%s',
    (_program, entry) => {
      it('projects to the same row kinds the chat draws, with no program branch', () => {
        const transcript = transcriptThroughAdapter(entry);
        const built = new ChatRowBuilder().rows({
          entries: transcript.entries,
          pending: [],
          older: 'reachedStart',
        });
        const { rows } = projectTimeline(built, {
          turns: transcript.turns,
          precedingTurnEnd: transcript.precedingTurnEnd,
          signals: turnSignals({
            activity: 'idle',
            isBackgroundWorkRunning: false,
          }),
        });
        const kinds = new Set(rows.map((row) => row.content.type));
        expect(kinds.has('user')).toBe(true);
        expect(kinds.has('assistant') || kinds.has('turnHeader')).toBe(true);
        expect(rows.length).toBeGreaterThan(1);
      });
    },
  );
});
