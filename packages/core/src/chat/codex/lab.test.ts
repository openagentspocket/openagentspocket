import '../programs';
// Chat against real Codex 0.167 (goldens/codex/lab, rollouts captured by scripts/agent-lab.py and
// redacted by its `keep`): each capture is the rollout file as Chat reads it over SFTP, read here
// through the adapter and the reducer the app uses.

import { describe, expect, it } from 'vitest';
import { labRollout } from '../../lab-captures.testkit';
import type { ChatTranscript } from '../model/types';
import { toolLine } from '../timeline/tool-line';

const kinds = (transcript: ChatTranscript) => transcript.entries.map((entry) => entry.content.type);

function textOf(transcript: ChatTranscript, index: number): string | undefined {
  const content = transcript.entries[index]?.content;
  if (content?.type === 'user' || content?.type === 'assistant') return content.value.text;
  return undefined;
}

describe('Codex 0.167 rollout, live captures', () => {
  it('reads a paginated rollout, a prompt and its reply', () => {
    const { transcript, unsupportedFormat } = labRollout('rollout-question', 'idle');
    expect(unsupportedFormat).toBeNull();
    // Chat sends end in one space; the reducer shows the prompt without it.
    expect(textOf(transcript, 0)).toBe('Reply with the single word pong.');
    expect(textOf(transcript, 1)).toBe('pong');
  });

  it('shows the question Plan Mode asks as a tool waiting for the answer', () => {
    const { transcript } = labRollout('rollout-question', 'blocked');
    expect(kinds(transcript)).toEqual(['user', 'assistant', 'user', 'tool']);
    const tool = transcript.entries[3]?.content;
    expect(tool?.type === 'tool' && tool.value.name).toBe('request_user_input');
  });

  it('reads the answered question, the declined command and the stopped turn', () => {
    const { transcript } = labRollout('rollout-after-deny-and-stop', 'idle');
    const types = kinds(transcript);
    expect(types.filter((type) => type === 'user')).toHaveLength(4);
    expect(textOf(transcript, 4)).toBe('You prefer blue.');
    // The declined command's turn and the stopped turn both end in a notice.
    expect(types.filter((type) => type === 'notice')).toHaveLength(2);
  });

  // Found by the agent lab (2026-11-13): Codex 0.167 runs commands through code mode, a
  // `custom_tool_call` named `exec` whose script calls `tools.exec_command`. A command waiting for
  // approval, or declined, gets no CommandExecution item, so the call itself is its row.
  it('shows the command waiting for approval as a tool awaiting approval', () => {
    const { transcript } = labRollout('rollout-exec-approval', 'blocked');
    const tool = transcript.entries.at(-1)?.content;
    expect(tool?.type === 'tool' && tool.value.status).toBe('awaitingApproval');
    expect(tool?.type === 'tool' && toolLine(tool.value)).toEqual({
      title: 'touch scratch.txt',
      isCommand: true,
      command: null,
    });
    expect(tool?.type === 'tool' && tool.value.kind).toBe('command');
    expect(transcript.pendingRequests.map((request) => request.summary)).toEqual([
      'touch scratch.txt',
    ]);
  });

  it('shows the command running while Codex works', () => {
    const { transcript } = labRollout('rollout-exec-approval', 'working');
    const tool = transcript.entries.at(-1)?.content;
    expect(tool?.type === 'tool' && tool.value.status).toBe('running');
  });

  it('shows the declined command as declined, before the stopped turn', () => {
    const { transcript } = labRollout('rollout-after-deny-and-stop', 'idle');
    const commands = transcript.entries.flatMap((entry) =>
      entry.content.type === 'tool' && entry.content.value.kind === 'command'
        ? [entry.content.value]
        : [],
    );
    expect(
      commands.map(({ title, status, purpose, command }) => [title, status, purpose, command]),
    ).toEqual([['touch scratch.txt', 'declined', null, null]]);
  });
});
