// A command's row reads as what it is for when the program records that: each adapter fills the
// tool's `purpose` (and `command` where the title is not the command line), and `toolLine` reads it.

import './programs';
import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../events/utf8';
import { ClaudeTranscriptReducer } from './claude/reducer';
import { GrokTranscriptReducer } from './grok/reducer';
import { type ChatLine, frameLines } from './model/lines';
import { type ChatToolActivity, type ChatTranscript, projectionContext } from './model/types';
import type { OpenCodeTool } from './opencode/record-types';
import { openCodeToolActivity } from './opencode/tool-summary';
import { toolLine } from './timeline/tool-line';

const LONG = 'S=/private/tmp/claude-501/scratch; cd "$S" && pnpm test --filter core -- --run';

function onlyTool(transcript: ChatTranscript): ChatToolActivity {
  const tools = transcript.entries.flatMap((entry) =>
    entry.content.type === 'tool' ? [entry.content.value] : [],
  );
  expect(tools).toHaveLength(1);
  return tools[0] as ChatToolActivity;
}

describe('Claude Code', () => {
  const read = (input: Record<string, string>) => {
    const records = [
      '{"type":"user","uuid":"p1","parentUuid":null,"message":{"role":"user","content":"go"},"promptSource":"typed","origin":{"kind":"human"}}',
      JSON.stringify({
        type: 'assistant',
        uuid: 'a1',
        parentUuid: 'p1',
        message: {
          id: 'm1',
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input }],
        },
        apiBlockIndex: 0,
      }),
    ];
    const reducer = new ClaudeTranscriptReducer();
    reducer.append(frameLines(encodeUtf8(`${records.join('\n')}\n`)));
    return onlyTool(reducer.transcript(projectionContext({ activity: 'working' })));
  };

  it('titles the row with the call description and opens to the command', () => {
    const tool = read({ command: LONG, description: 'Run the core tests' });
    expect(tool).toMatchObject({ purpose: 'Run the core tests', command: LONG });
    expect(toolLine(tool)).toEqual({
      title: 'Run the core tests',
      isCommand: false,
      command: LONG,
    });
  });

  it('without one, titles it with the short command', () => {
    const tool = read({ command: LONG });
    expect(tool).toMatchObject({ purpose: null, command: null });
    expect(toolLine(tool)).toEqual({
      title: 'pnpm test --filter core …',
      isCommand: true,
      command: LONG,
    });
  });
});

describe('Grok', () => {
  const read = (rawInput: Record<string, string>) => {
    const window: ChatLine[] = [];
    let offset = 0;
    for (const update of [
      {
        sessionUpdate: 'user_message_chunk',
        content: { type: 'text', text: 'Go.' },
        _meta: { promptIndex: 0 },
      },
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'call-1',
        title: 'run_terminal_command',
        status: 'in_progress',
        _meta: { 'x.ai/tool': { name: 'run_terminal_command' } },
        rawInput,
      },
    ]) {
      const data = encodeUtf8(
        JSON.stringify({ timestamp: 1, method: 'session/update', params: { update } }),
      );
      window.push({ offset, length: data.length, data });
      offset += data.length + 1;
    }
    const reducer = new GrokTranscriptReducer('/home/dev/.grok/sessions/x/y/updates.jsonl');
    reducer.append(window);
    return onlyTool(reducer.transcript(projectionContext({ activity: 'working' })));
  };

  it('titles the row with the call description', () => {
    const tool = read({ command: LONG, description: 'Run the core tests' });
    expect(tool.purpose).toBe('Run the core tests');
    expect(toolLine(tool)).toEqual({
      title: 'Run the core tests',
      isCommand: false,
      command: LONG,
    });
  });

  it('without one, titles it with the short command', () => {
    const tool = read({ command: LONG });
    expect(tool.purpose).toBeNull();
    expect(toolLine(tool).title).toBe('pnpm test --filter core …');
  });
});

describe('OpenCode', () => {
  const read = (description: string | null) => {
    const tool: OpenCodeTool = {
      callID: 'c1',
      name: 'bash',
      status: 'completed',
      input: {
        filePath: null,
        path: null,
        command: LONG,
        pattern: null,
        url: null,
        query: null,
        description,
        agent: null,
        subagentType: null,
        patchText: null,
        id: null,
        questions: [],
        text: null,
      },
      error: null,
      metadata: null,
      output: 'ok',
      outputLength: 2,
    };
    return openCodeToolActivity(tool, { path: null, offset: 0, length: 0 });
  };

  it('titles the row with the bash call description', () => {
    const tool = read('Run the core tests');
    expect(tool.purpose).toBe('Run the core tests');
    expect(toolLine(tool)).toEqual({
      title: 'Run the core tests',
      isCommand: false,
      command: LONG,
    });
  });

  it('without one, titles it with the short command', () => {
    expect(toolLine(read(null)).title).toBe('pnpm test --filter core …');
  });
});
