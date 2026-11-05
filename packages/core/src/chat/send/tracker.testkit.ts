// Test support for the send tracker: a host whose conversation, clock and screen the test drives.

import type { AnsiScreen } from '../../blocked/screen';
import { FakeClock } from '../../hosts/cancellation';
import type { ChatPhase } from '../engine/snapshot';
import { FakeHostFiles } from '../model/fake-host-files';
import {
  type ChatAgentActivity,
  type ChatEntry,
  type ChatRecordedPrompt,
  emptyTranscript,
} from '../model/types';
import { conservativeSendPolicy } from './defaults';
import type { ProgramSendPolicy } from './policy';
import { SendTracker } from './tracker';
import type { SendTiming } from './tracker-types';

export interface Harness {
  readonly tracker: SendTracker;
  readonly files: FakeHostFiles;
  readonly clock: FakeClock;
  readonly state: {
    entries: ChatEntry[];
    prompts: ChatRecordedPrompt[];
    readOffset: number;
    layout: number;
    generation: number;
    activity: ChatAgentActivity;
    phase: ChatPhase;
    screen: AnsiScreen | null;
    screenReads: number;
  };
  readonly calls: { sent: number; overdue: number; refresh: number; changed: number };
  /** Moves time on by `seconds`. */
  tick(seconds: number): void;
  record(text: string, offset: number, entryID?: string): void;
  status(id: string): string | undefined;
  /** A status change as herdr reports it. */
  setActivity(activity: ChatAgentActivity): void;
}

export const prompt = (
  text: string,
  offset: number,
  entryID: string | null = null,
): ChatRecordedPrompt => ({
  offset,
  text,
  entryID,
  pastedImagePaths: null,
});

export function harness(
  overrides: Partial<ProgramSendPolicy> = {},
  timing: Partial<SendTiming> = {},
): Harness {
  const clock = new FakeClock();
  const files = new FakeHostFiles();
  let now = 1_000_000;
  const calls = { sent: 0, overdue: 0, refresh: 0, changed: 0 };
  const state: Harness['state'] = {
    entries: [],
    prompts: [],
    readOffset: 0,
    layout: 0,
    generation: 1,
    activity: 'idle',
    phase: { type: 'following', path: '/work/session.jsonl' },
    screen: null,
    screenReads: 0,
  };
  const tracker = new SendTracker({
    policy: conservativeSendPolicy('claude', 'Claude Code', overrides),
    clock,
    files,
    timing,
    now: () => now,
    echoKey: (text) => text.trim(),
    conversation: () => ({
      transcript: { ...emptyTranscript(), entries: state.entries, recordedPrompts: state.prompts },
      readOffset: state.readOffset,
      layoutGeneration: state.layout,
      phase: state.phase,
    }),
    generation: () => state.generation,
    activity: () => state.activity,
    followedSessionID: () => 'session-1',
    readScreen: async () => {
      state.screenReads += 1;
      if (!state.screen) throw new Error('no screen');
      return state.screen;
    },
    sent: () => {
      calls.sent += 1;
    },
    overdue: () => {
      calls.overdue += 1;
    },
    refreshAgent: () => {
      calls.refresh += 1;
    },
    changed: () => {
      calls.changed += 1;
    },
  });
  return {
    tracker,
    files,
    clock,
    state,
    calls,
    tick: (seconds) => {
      now += seconds * 1000;
    },
    record: (text, offset, entryID) => {
      state.prompts.push(prompt(text, offset, entryID ?? null));
      state.readOffset = Math.max(state.readOffset, offset + 1);
      tracker.match();
    },
    status: (id) => tracker.statuses.get(id)?.kind,
    setActivity: (activity) => {
      const previous = state.activity;
      state.activity = activity;
      tracker.agentStatusChanged(activity, previous);
    },
  };
}
