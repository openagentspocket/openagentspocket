import { describe, expect, it } from 'vitest';
import '../programs';
import { type ProgramFixture, projectionThroughAdapter } from '../other-programs.testkit';
import { openQuestions, transcriptCalls } from './open-questions';
import { type ChatAgentActivity, emptyTranscript } from './types';

const has =
  (...parts: string[]) =>
  (line: string) =>
    parts.every((part) => line.includes(part));

const CLAUDE: ProgramFixture = {
  program: 'claude',
  directory: 'claude',
  fixture: 'probe1-transcript.jsonl',
};
const OMP: ProgramFixture = {
  program: 'omp',
  directory: 'omp',
  fixture: 'approvals-asks-plan.jsonl',
};
const GROK: ProgramFixture = {
  program: 'grok',
  directory: 'grok',
  fixture: 'subagent-todo-question.jsonl',
};

/** Each program's conversation read up to the call that asks, so the question stands open. */
const ASKING: readonly (readonly [ProgramFixture, ((line: string) => boolean) | undefined])[] = [
  [CLAUDE, has('tool_use', 'AskUserQuestion')],
  [
    { program: 'codex', directory: 'codex', fixture: 'probe2-rollout.jsonl' },
    has('function_call', 'request_user_input'),
  ],
  [OMP, has('"name":"ask"')],
  [GROK, has('ask_user_question')],
  [
    { program: 'opencode', directory: 'opencode', fixture: 'rows-question-blocked.jsonl' },
    undefined,
  ],
];

function asked(
  activity: ChatAgentActivity,
  entry: ProgramFixture,
  through?: (line: string) => boolean,
) {
  const project = projectionThroughAdapter(entry, through);
  return openQuestions(project(activity), project);
}

describe('openQuestions', () => {
  describe.each(ASKING.map((row) => [row[0].program, ...row] as const))(
    '%s',
    (_program, entry, through) => {
      it.each(['idle', 'working', 'blocked'] as const)(
        'finds the call open while %s',
        (activity) => {
          const open = asked(activity, entry, through);
          expect(open).toHaveLength(1);
          expect(open[0]?.kind).toBe('question');
          expect(open[0]?.callID).not.toBeNull();
        },
      );
    },
  );

  it.each([
    ['claude', CLAUDE],
    ['omp', OMP],
    ['grok', GROK],
    [
      'opencode',
      { program: 'opencode', directory: 'opencode', fixture: 'rows-question-answered.jsonl' },
    ],
  ] as const)('finds none in a %s conversation that answered', (_program, entry) => {
    expect(asked('idle', entry)).toEqual([]);
  });

  it('projects no second time for a conversation that asks nothing', () => {
    let projections = 0;
    const open = openQuestions(emptyTranscript(), () => {
      projections += 1;
      return emptyTranscript();
    });
    expect(open).toEqual([]);
    expect(projections).toBe(0);
  });
});

describe('transcriptCalls', () => {
  it('names what waits and whether a question is open', () => {
    const project = projectionThroughAdapter(CLAUDE, has('tool_use', 'AskUserQuestion'));
    const transcript = project('idle');
    const open = openQuestions(transcript, project);
    const calls = transcriptCalls(transcript, open);
    expect(calls.openQuestion).toBe(true);
    expect(calls.waiting.has(open[0]?.callID ?? '')).toBe(true);
    expect(calls.resolved.has(open[0]?.callID ?? '')).toBe(false);
  });

  it('says whether a subagent call runs, and lists what waits for a card to match', () => {
    const spawning = projectionThroughAdapter(GROK, has('spawn_subagent'))('working');
    expect(transcriptCalls(spawning, []).subagentRunning).toBe(true);
    const project = projectionThroughAdapter(CLAUDE, has('tool_use', 'AskUserQuestion'));
    const open = openQuestions(project('idle'), project);
    const calls = transcriptCalls(project('idle'), open);
    expect(calls.subagentRunning).toBe(false);
    expect(calls.requests.map((request) => request.callID)).toEqual(
      expect.arrayContaining(open.map((q) => q.callID)),
    );
  });

  it('counts a finished call as resolved', () => {
    const calls = transcriptCalls(projectionThroughAdapter(CLAUDE)('idle'), []);
    expect(calls.openQuestion).toBe(false);
    expect(calls.resolved.size).toBeGreaterThan(0);
  });
});
