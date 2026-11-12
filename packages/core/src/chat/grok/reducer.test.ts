import '../programs';
// Ports of the Swift reducer tests the goldens cannot state: windows that start mid-file, rewinds
// across a window, prepended history, diagnostics, cut lines, echo keys and expanded output.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../../events/utf8';
import { standardAdapter } from '../engine/adapter';
import { type ChatLine, frameLines } from '../model/lines';
import { withExpandedLimits } from '../model/preview';
import {
  type ChatAgentActivity,
  type ChatToolActivity,
  type ChatTranscript,
  projectionContext,
} from '../model/types';
import {
  directoryOfTranscript,
  GROK_REVISION,
  GrokTranscriptReducer,
  grokEchoKey,
} from './reducer';

const FIXTURES = join(__dirname, '../../../goldens/grok/transcripts');
const PATH =
  '/home/dev/.grok/sessions/%2Fhome%2Fdev%2Fproj/01900000-0000-7000-8000-000000000004/updates.jsonl';
const at = (milliseconds: number) => new Date(milliseconds).toISOString();

const fixtureText = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');
const framed = (name: string): ChatLine[] =>
  frameLines(new Uint8Array(readFileSync(join(FIXTURES, name))));
/** Lines `first` to `last` (1-based, inclusive) of a fixture, with their offsets in the file. */
const lines = (name: string, first = 1, last?: number) => framed(name).slice(first - 1, last);

/** The transcript of `window` read as a window that starts at the first of them. */
function transcript(
  window: readonly ChatLine[],
  options: { activity?: ChatAgentActivity; windowStart?: number } = {},
): ChatTranscript {
  const reducer = new GrokTranscriptReducer(PATH);
  reducer.append(window);
  return reducer.transcript(
    projectionContext({
      windowStart: options.windowStart ?? window[0]?.offset ?? 0,
      activity: options.activity ?? 'idle',
    }),
  );
}

const ids = (result: ChatTranscript) => result.entries.map((entry) => entry.id);
const shown = (result: ChatTranscript) =>
  result.entries.filter((entry) => entry.content.type !== 'tool');
const toolOf = (result: ChatTranscript, callID: string): ChatToolActivity => {
  for (const entry of result.entries) {
    if (entry.content.type === 'tool' && entry.content.value.callID === callID)
      return entry.content.value;
  }
  throw new Error(`no tool ${callID}`);
};

describe('Grok Build transcript reducer', () => {
  it('names the session directory from the transcript path', () => {
    expect(directoryOfTranscript(PATH)).toBe('/home/dev/proj');
    // A long directory's group is a slug, which names none.
    expect(
      directoryOfTranscript('/home/dev/.grok/sessions/my-app-0123456789abcdef/s/updates.jsonl'),
    ).toBeNull();
  });

  it('leaves a turn open through silence', () => {
    for (const activity of ['idle', 'unknown', 'working'] as const) {
      const result = transcript(lines('core-turns.jsonl', 1, 3), { activity });
      expect(ids(result)).toEqual(['grok:391', 'grok:773']);
      expect(result.turns).toEqual([
        { firstEntryID: 'grok:391', startedAt: at(1_792_421_808_883), endedAt: null, ending: null },
      ]);
    }
  });

  it('keeps late records in their closed turn', () => {
    const result = transcript(lines('agent-turns-and-errors.jsonl', 11, 18), {
      activity: 'working',
    });
    expect(shown(result).map((entry) => entry.id)).toEqual([
      'grok:4056',
      'grok:5323',
      'grok:6697',
      'grok:7551',
      'grok:8062',
    ]);
    expect(result.turns.map((turn) => [turn.firstEntryID, turn.ending])).toEqual([
      ['grok:4056', 'completed'],
      ['grok:8062', null],
    ]);
  });

  it('gives a window that starts mid-turn to the turn above it', () => {
    const result = transcript(lines('core-turns.jsonl', 12, 18));
    expect(result.turns).toEqual([]);
    // The turn's end gives how long it ran, which no loaded line starts.
    expect(result.precedingTurnEnd).toEqual({
      ending: 'completed',
      endedAt: at(1_792_421_907_652),
      duration: 5.992,
    });
    expect(shown(result).map((entry) => entry.id)).toEqual([
      'grok:5853',
      'grok:10999',
      'grok:11607',
    ]);
    expect(result.recordedPrompts).toEqual([]);
    expect(result.needsOlderHistory).toBe(true);
  });

  it('closes nothing for a turn_completed without an open turn', () => {
    // The shell command's own `turn_completed` follows the failed turn.
    const result = transcript(lines('agent-turns-and-errors.jsonl', 22, 28));
    expect(result.turns).toEqual([
      {
        firstEntryID: 'grok:9552',
        startedAt: at(1_792_430_070_060),
        endedAt: at(1_792_430_071_040),
        ending: 'failed',
      },
    ]);
    expect(result.precedingTurnEnd).toBeNull();
  });

  describe('rewind', () => {
    it('hides turns from the target index on', () => {
      const result = transcript(lines('rewind.jsonl'));
      expect(ids(result)).toEqual(['grok:391', 'grok:765', 'grok:4054', 'grok:4456']);
      expect(result.turns.map((turn) => turn.firstEntryID)).toEqual(['grok:391', 'grok:4054']);
      expect(result.turns.map((turn) => turn.ending)).toEqual(['completed', 'completed']);
      expect(result.recordedPrompts.map((prompt) => prompt.offset)).toEqual([391, 4054]);
    });

    it("keeps the turn before when it targets the window's first turn", () => {
      // The window starts in turn 0's reply; the rewind targets turn 1.
      const result = transcript(lines('rewind.jsonl', 3, 11));
      expect(ids(result)).toEqual(['grok:765', 'grok:4054', 'grok:4456']);
      expect(result.precedingTurnEnd).toEqual({
        ending: 'completed',
        endedAt: at(1_792_421_803_262),
        duration: 12.852,
      });
      expect(result.turns.map((turn) => turn.firstEntryID)).toEqual(['grok:4054']);
    });

    it('hides the window before a target above it', () => {
      // The window starts in turn 1's reply, below the target's prompt.
      const inTarget = transcript(lines('rewind.jsonl', 6, 11));
      expect(ids(inTarget)).toEqual(['grok:4054', 'grok:4456']);
      expect(inTarget.precedingTurnEnd).toBeNull();

      // The same marker aimed at turn 0, whose prompt is above a window that starts in its reply.
      const retargeted = fixtureText('rewind.jsonl').replace(
        '"target_prompt_index":1',
        '"target_prompt_index":0',
      );
      const above = transcript(frameLines(encodeUtf8(retargeted)).slice(2));
      expect(ids(above)).toEqual(['grok:4054', 'grok:4456']);
      expect(above.precedingTurnEnd).toBeNull();
      expect(above.turns.map((turn) => turn.firstEntryID)).toEqual(['grok:4054']);
    });

    it('needs older history whenever the window starts later', () => {
      const all = lines('rewind.jsonl');
      for (const windowStart of [0, 1, 2060]) {
        const result = transcript(
          all.filter((line) => line.offset >= windowStart),
          { windowStart },
        );
        expect(result.needsOlderHistory).toBe(windowStart > 0);
      }
    });

    it('is made exact by prepended history', () => {
      const all = lines('rewind.jsonl');
      const reducer = new GrokTranscriptReducer(PATH);
      reducer.append(all.slice(5));
      const tail = reducer.transcript(
        projectionContext({ windowStart: all[5]?.offset ?? 0, activity: 'idle' }),
      );
      expect(ids(tail)).toEqual(['grok:4054', 'grok:4456']);

      reducer.prepend(all.slice(0, 5));
      const whole = reducer.transcript(projectionContext({ windowStart: 0, activity: 'idle' }));
      expect(whole).toEqual(transcript(all));
      expect(ids(whole)).toEqual(['grok:391', 'grok:765', 'grok:4054', 'grok:4456']);
    });
  });

  it('counts unknown kinds and unreadable lines instead of failing', () => {
    const window = lines('agent-turns-and-errors.jsonl', 38, 39);
    const last = window[window.length - 1] as ChatLine;
    const end = last.offset + last.length + 1;
    const bad = encodeUtf8('not json');
    const odd = encodeUtf8(
      '{"timestamp":1792430121,"method":"session/update","params":{"sessionId":"x"}}',
    );
    const result = transcript([
      ...window,
      { offset: end, length: bad.length, data: bad },
      { offset: end + 9, length: odd.length, data: odd },
    ]);
    expect(result.diagnostics.invalidLines).toBe(2);
    expect([...result.diagnostics.unknownRecordTypes]).toEqual(['git_branch_update']);
    expect(
      result.entries.flatMap((entry) =>
        entry.content.type === 'user' ? [entry.content.value.text] : [],
      ),
    ).toEqual(['Summarise the plan.']);
  });

  it('repairs a truncated line', () => {
    // A prompt cut inside its text keeps its kind but loses the text and everything after it.
    const core = lines('core-turns.jsonl', 1, 4);
    const second = core[1] as ChatLine;
    const cut = new TextDecoder().decode(second.data).indexOf('Reply with') + 'Reply with'.length;
    const cutLines = [...core];
    cutLines[1] = { ...second, data: second.data.slice(0, cut) };
    const prompt = transcript(cutLines);
    expect(ids(prompt)).toEqual(['grok:391', 'grok:773']);
    expect(prompt.entries[0]?.content).toMatchObject({
      type: 'notice',
      value: { kind: 'system', title: 'Message exceeds the preview limit' },
    });
    expect(prompt.turns.map((turn) => turn.firstEntryID)).toEqual(['grok:391']);
    expect(prompt.recordedPrompts).toEqual([]);
    expect(prompt.latestPromptOffset).toBe(391);
    expect(prompt.diagnostics.oversizedLines).toBe(1);

    // An image cut inside its data still counts, and joins its prompt.
    const split = lines('agent-turns-and-errors.jsonl', 5, 7);
    const imageLine = split[1] as ChatLine;
    const dataAt =
      new TextDecoder().decode(imageLine.data).indexOf('"data":"AA') + '"data":"AA'.length;
    const images = [...split];
    images[1] = { ...imageLine, data: imageLine.data.slice(0, dataAt) };
    const image = transcript(images);
    const text = 'Describe this image.\nAnswer in one word.';
    expect(
      image.entries.flatMap((entry) =>
        entry.content.type === 'user' ? [entry.content.value] : [],
      ),
    ).toMatchObject([{ text, imageCount: 1 }]);
    expect(image.recordedPrompts.map((prompt) => prompt.text)).toEqual([text]);
    expect(image.diagnostics.oversizedLines).toBe(1);
  });

  it('never keys entries by event id', () => {
    for (const name of [
      'core-turns.jsonl',
      'cancel-takeover.jsonl',
      'rewind.jsonl',
      'compaction.jsonl',
      'dispatch-order.jsonl',
      'agent-turns-and-errors.jsonl',
    ]) {
      const result = transcript(lines(name));
      for (const entry of result.entries) {
        if (entry.id.startsWith('grok:tool:')) continue;
        const byOffset = `grok:${entry.sourceOffset}`;
        expect(
          [byOffset, `${byOffset}:notice`, `${byOffset}:compaction`],
          `${name}: ${entry.id}`,
        ).toContain(entry.id);
      }
      expect(new Set(ids(result)).size, name).toBe(result.entries.length);
    }
  });

  it('trims the trailing space Chat adds when comparing echoes', () => {
    expect(grokEchoKey('Reply with exactly the word ping. ')).toBe(
      'Reply with exactly the word ping.',
    );
    expect(grokEchoKey('one\r\ntwo\rthree \n')).toBe('one\ntwo\nthree');
    // Grok records the space Chat sends after a prompt.
    const adapter = standardAdapter('grok');
    expect(adapter).not.toBeNull();
    const recorded = transcript(lines('core-turns.jsonl')).recordedPrompts.map((prompt) =>
      adapter?.echoKey(prompt.text),
    );
    expect(recorded).toContain(adapter?.echoKey('Reply with exactly the word ping. '));
    expect(adapter?.revision).toBe(GROK_REVISION);
    expect(adapter?.joinsCachedHistory).toBe(false);
    expect(adapter?.wantsFirstLine).toBe(false);
    expect(adapter?.limits.automaticOlderSearch).toBe(4 << 20);
  });

  it('reads a result line again for an expanded row', () => {
    const jsonLine = (value: unknown) => JSON.stringify(value);
    const record = (offset: number, params: unknown): ChatLine => {
      const data = encodeUtf8(jsonLine({ timestamp: 1, method: 'session/update', params }));
      return { offset, length: data.length, data };
    };
    const output = Array.from({ length: 60 }, (_, index) => `line ${index + 1}\n`).join('');
    const callID = 'call-1';
    const window: ChatLine[] = [];
    let offset = 0;
    for (const params of [
      {
        update: {
          sessionUpdate: 'user_message_chunk',
          content: { type: 'text', text: 'Print.' },
          _meta: { promptIndex: 0 },
        },
        _meta: { eventId: 's-1' },
      },
      {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: callID,
          title: 'run_terminal_command',
          status: 'in_progress',
          _meta: { 'x.ai/tool': { name: 'run_terminal_command' } },
          rawInput: { command: 'seq 60' },
        },
        _meta: { eventId: 's-2' },
      },
      {
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: callID,
          status: 'completed',
          content: [{ type: 'content', content: { type: 'text', text: output } }],
          rawOutput: { type: 'Bash', output_for_prompt: `exit: 0\n${output}`, exit_code: 0 },
        },
        _meta: { eventId: 's-3' },
      },
    ]) {
      const line = record(offset, params);
      window.push(line);
      offset += line.length + 1;
    }
    const reducer = new GrokTranscriptReducer(PATH);
    reducer.append(window);
    const result = reducer.transcript(projectionContext({ activity: 'idle' }));
    const tool = toolOf(result, callID);
    expect(tool.preview?.text).toBe(
      Array.from({ length: 40 }, (_, index) => `line ${index + 1}`).join('\n'),
    );
    expect(tool.preview?.isTruncated).toBe(true);
    expect(tool.output).toEqual({
      path: null,
      offset: window[2]?.offset,
      length: window[2]?.length,
    });

    const expanded = withExpandedLimits(() => reducer.output(window[2] as ChatLine, tool));
    expect(expanded).toEqual({
      type: 'preview',
      preview: {
        text: Array.from({ length: 60 }, (_, index) => `line ${index + 1}`).join('\n'),
        isTruncated: false,
        imageCount: 0,
      },
      fileChanges: null,
    });
    // Another call's line, or a line without the result, holds none.
    expect(reducer.output(window[2] as ChatLine, { ...tool, callID: 'call-9' })).toBeNull();
    expect(reducer.output(window[1] as ChatLine, tool)).toBeNull();
  });
});
