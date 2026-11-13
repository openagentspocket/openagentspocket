// OpenCode's background subagents as Background Work: when one starts, when it has ended, and what
// a Blocked card learns from that. The rows are constructed (goldens/opencode/constructed), shaped
// after OpenCode's `subagent` tool and its completion rows; no capture holds a background subagent.

import { describe, expect, it } from 'vitest';
import type { ChatLine } from '../model/lines';
import { transcriptCalls } from '../model/open-questions';
import { carryBackgroundWork } from '../model/transcript';
import { projectionContext } from '../model/types';
import { constructedLines, constructedTranscript } from './constructed.testkit';
import { OpenCodeTranscriptReducer } from './reducer';

const CHILD = 'ses_0c0n5tructedChildAAAAAAAAAA';
const LAUNCH = 'call_0c0n5tructedSubagentAAAA';
const SHELL = 'call_0c0n5tructedShellAAAAAAA';

const launched = constructedLines('rows-background-subagent');
const notes = constructedLines('rows-background-subagent-notes');
/** The launch, then the notes up to the one with `seq`. */
const upTo = (seq: number): ChatLine[] => [
  ...launched,
  ...notes.filter((line) => line.offset <= seq),
];

const work = (lines: readonly ChatLine[]) =>
  constructedTranscript(lines, 'blocked').backgroundWork.map(
    ({ id, state, agentID, endOffset }) => ({ id, state, agentID, endOffset }),
  );

const calls = (lines: readonly ChatLine[]) =>
  transcriptCalls(constructedTranscript(lines, 'blocked'), []);

describe('OpenCode background subagents', () => {
  it('reads a subagent call that returned while its child works on as running work', () => {
    const transcript = constructedTranscript(launched, 'blocked');
    expect(transcript.backgroundWork).toMatchObject([
      {
        id: LAUNCH,
        kind: 'subagent',
        title: 'Review notes',
        subtitle: 'general',
        state: 'running',
        agentID: CHILD,
        launchOffset: 20,
      },
    ]);
  });

  it('keeps it running while the child idles with its own work still running', () => {
    expect(work(upTo(40))).toEqual([
      { id: LAUNCH, state: 'running', agentID: CHILD, endOffset: null },
    ]);
  });

  it('ends it at the completion row naming its child', () => {
    expect(work(upTo(50))).toEqual([
      { id: LAUNCH, state: 'completed', agentID: CHILD, endOffset: 50 },
    ]);
  });

  it('runs it again on a call that continues the child, until that run ends', () => {
    const resumed = constructedTranscript(upTo(60), 'idle').backgroundWork[0];
    expect(resumed).toMatchObject({ state: 'running', endOffset: null });
    expect(resumed?.resume).toMatchObject({ callID: 'call_0c0n5tructedFollowUpAAAAA', offset: 60 });
    expect(work(upTo(70))).toEqual([
      { id: LAUNCH, state: 'stopped', agentID: CHILD, endOffset: 70 },
    ]);
  });

  it('leaves a subagent that ran in its call out of Background Work', () => {
    const foreground = launched.map((line) => {
      const text = new TextDecoder()
        .decode(line.data)
        .replace('"status":"running"}', '"status":"completed"}');
      const data = new TextEncoder().encode(text);
      return { ...line, data, length: data.length };
    });
    expect(work(foreground)).toEqual([]);
  });

  it('ends work launched above the loaded rows by what they say of its child', () => {
    const earlier = constructedTranscript(launched, 'idle').backgroundWork;
    const reducer = new OpenCodeTranscriptReducer();
    reducer.append([...launched.filter((line) => line.offset > 1000), ...notes]);
    const window = reducer.transcript(projectionContext({ windowStart: 40, activity: 'idle' }));
    const carried = carryBackgroundWork(window, earlier, 40, null).backgroundWork;
    expect(carried.find((item) => item.id === LAUNCH)).toMatchObject({
      state: 'completed',
      endOffset: 50,
    });
  });
});

describe("A Blocked card's calls while OpenCode runs a background subagent", () => {
  it("names the main session's waiting call, and that a subagent runs", () => {
    const running = calls(launched);
    expect(running.requests.map((request) => request.callID)).toEqual([SHELL]);
    expect(running.subagentRunning).toBe(true);
    expect(calls(upTo(40)).subagentRunning).toBe(true);
  });

  it('says no subagent runs once its end is recorded', () => {
    expect(calls(upTo(50)).subagentRunning).toBe(false);
    expect(calls(upTo(60)).subagentRunning).toBe(true);
    expect(calls(upTo(70)).subagentRunning).toBe(false);
  });
});
