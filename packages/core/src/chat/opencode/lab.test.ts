import '../programs';
// Chat against real OpenCode 2.1.3 (goldens/opencode/lab, captured by scripts/agent-lab.py): each
// capture is the store script's output for one tail read over SSH, read here through the record
// source and the reducer the app uses.

import { describe, expect, it } from 'vitest';
import { labStoreFiles } from '../../lab-captures.testkit';
import { type ChatAgentActivity, type ChatTranscript, projectionContext } from '../model/types';
import { openCodeAdapter } from './adapter';
import { OpenCodeRecordSource } from './record-source';

const SESSION = 'ses_e2d0145c0ffeFUENCuCYVJcvJF';

async function transcriptOf(capture: string, activity: ChatAgentActivity): Promise<ChatTranscript> {
  const lines = await new OpenCodeRecordSource(SESSION).open(labStoreFiles('opencode', capture));
  const adapter = openCodeAdapter();
  if (!adapter || !lines) throw new Error('OpenCode is not readable');
  const reducer = adapter.makeReducer({ path: '', firstLine: null });
  reducer.append(lines);
  expect(reducer.unsupportedFormat).toBeNull();
  return reducer.transcript(projectionContext({ activity }));
}

const kinds = (transcript: ChatTranscript) => transcript.entries.map((entry) => entry.content.type);

function textOf(transcript: ChatTranscript, index: number): string | undefined {
  const content = transcript.entries[index]?.content;
  if (content?.type === 'user' || content?.type === 'assistant') return content.value.text;
  return undefined;
}

describe('OpenCode 2.1.3 store, live captures', () => {
  it('reads a prompt and its reply', async () => {
    const transcript = await transcriptOf('store-pong', 'idle');
    expect(kinds(transcript)).toEqual(['user', 'assistant']);
    expect(textOf(transcript, 0)).toBe('Reply with the single word pong.');
    expect(textOf(transcript, 1)).toBe('pong');
  });

  it('shows the shell call a permission holds as awaiting approval', async () => {
    const transcript = await transcriptOf('store-permission-shell', 'blocked');
    expect(kinds(transcript)).toEqual(['user', 'assistant', 'user', 'tool']);
    const tool = transcript.entries[3]?.content;
    expect(tool?.type === 'tool' && tool.value.status).toBe('awaitingApproval');
    // The call id a Blocked card needs to plan Reject (see blocked/opencode-lab.test.ts).
    expect(tool?.type === 'tool' && tool.value.callID).toBe('call_85f0f209553640a79b73b399');
  });

  it('reads declined calls, an answered question and a manual compaction', async () => {
    const transcript = await transcriptOf('store-after-compact', 'idle');
    const types = kinds(transcript);
    expect(types.filter((type) => type === 'user')).toHaveLength(4);
    expect(types).toContain('tool');
    expect(types.slice(-2)).toEqual(['notice', 'divider']);
    // Chat sends end in one space; the reducer shows the prompt without it.
    expect(textOf(transcript, 2)).toBe(
      'Run the shell command `ls` in this directory and tell me what you see.',
    );
  });
});
