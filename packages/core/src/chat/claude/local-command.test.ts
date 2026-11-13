// A local command's output in Chat (Claude Code `/context`): one notice tied to the command, with
// the markdown Claude Code records for the model in place of the terminal's colored grid.

import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../../events/utf8';
import { frameLines } from '../model/lines';
import type { ChatAgentActivity, ChatNotice } from '../model/types';
import { projectionContext } from '../model/types';
import {
  CONTEXT_MARKDOWN,
  CONTEXT_RECORDS,
  contextCommand,
  contextMarkdown,
  contextStdout,
} from './local-command.testkit';
import { ClaudeTranscriptReducer } from './reducer';

function transcript(records: string[], activity: ChatAgentActivity = 'idle') {
  const reducer = new ClaudeTranscriptReducer();
  reducer.append(frameLines(encodeUtf8(`${records.join('\n')}\n`)));
  return reducer.transcript(projectionContext({ activity }));
}

const onlyNotice = (records: string[]): ChatNotice => {
  const { entries } = transcript(records);
  expect(entries).toHaveLength(1);
  const content = entries[0]?.content;
  if (content?.type !== 'notice') throw new Error('not a notice');
  return content.value;
};

describe('a local command with recorded markdown', () => {
  it('is one command notice carrying the markdown, not a user or Agent message', () => {
    const { entries } = transcript(CONTEXT_RECORDS);
    expect(entries.map((entry) => entry.id)).toEqual(['notice:cmd1']);
    const value = onlyNotice(CONTEXT_RECORDS);
    expect(value).toMatchObject({ kind: 'command', title: '/context', detailFormat: 'markdown' });
    expect(value.detail).toBe(CONTEXT_MARKDOWN.trim());
  });

  it('never shows terminal escape codes or the grid glyphs', () => {
    const value = onlyNotice(CONTEXT_RECORDS);
    for (const unwanted of ['\u001b', '⛁', '⛶']) expect(value.detail).not.toContain(unwanted);
  });

  it('keeps the arguments in the title', () => {
    const records = [contextCommand('cmd1', null, 'all'), contextStdout(), contextMarkdown()];
    expect(onlyNotice(records).title).toBe('/context all');
  });

  it('falls back to the plain output, without escape codes, when no markdown is recorded', () => {
    const next = `{"type":"user","uuid":"p2","parentUuid":"out1","message":{"role":"user","content":"thanks"},"promptSource":"typed","origin":{"kind":"human"}}`;
    const { entries } = transcript([contextCommand(), contextStdout(), next]);
    expect(entries.map((entry) => entry.id)).toEqual(['notice:cmd1', 'user:p2']);
    const content = entries[0]?.content;
    if (content?.type !== 'notice') throw new Error('not a notice');
    expect(content.value.detailFormat).toBeUndefined();
    expect(content.value.detail).toContain('Context Usage');
    expect(content.value.detail).not.toContain('\u001b');
  });

  it('leaves a later meta record that is not under the output alone', () => {
    const records = [contextCommand(), contextStdout(), contextMarkdown('md1', 'cmd1')];
    expect(onlyNotice(records).detailFormat).toBeUndefined();
  });

  it('reads the output record alone, as when the command record is missing', () => {
    const records = [contextStdout('out1', 'gone'), contextMarkdown()];
    const { entries } = transcript(records);
    expect(entries.map((entry) => entry.id)).toEqual(['notice:out1']);
    expect(onlyNotice(records)).toMatchObject({ title: '/context', detailFormat: 'markdown' });
  });

  it('records the command as the prompt Chat sent, so its send is confirmed', () => {
    const prompts = transcript(CONTEXT_RECORDS).recordedPrompts;
    expect(prompts.map((prompt) => prompt.text)).toEqual(['/context']);
    expect(prompts[0]?.entryID).toBe('notice:cmd1');
  });
});
