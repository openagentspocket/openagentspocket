// Derived views and merges of a ChatTranscript (Swift ChatTranscript extensions).

import type {
  ChatBackgroundWorkAgent,
  ChatBackgroundWorkEnd,
  ChatBackgroundWorkItem,
  ChatEntry,
  ChatTranscript,
} from './types';

/** The entries a saved document keeps (without waiting bubbles). */
export function recordedEntries(transcript: ChatTranscript): ChatEntry[] {
  return transcript.unrecordedEntryIDs.size === 0
    ? transcript.entries
    : transcript.entries.filter((entry) => !transcript.unrecordedEntryIDs.has(entry.id));
}

/**
 * The Background Work Chat lists: everything still running, and what ended after the user's latest
 * message. Without a message among the loaded lines, everything they hold came after it.
 */
export function listedBackgroundWork(transcript: ChatTranscript): ChatBackgroundWorkItem[] {
  const prompt = transcript.latestPromptOffset ?? 0;
  return transcript.backgroundWork.filter(
    (item) => item.state === 'running' || (item.endOffset ?? 0) > prompt,
  );
}

export function applyWorkEnd(
  item: ChatBackgroundWorkItem,
  end: ChatBackgroundWorkEnd,
): ChatBackgroundWorkItem {
  return {
    ...item,
    state: end.state,
    endOffset: end.offset,
    endedAt: end.endedAt,
    usage: end.usage,
  };
}

/** Where the item's latest run starts: its latest resume, or its launch. */
export function runOffset(item: ChatBackgroundWorkItem): number {
  return item.resume?.offset ?? item.launchOffset;
}

/** When the item's latest run started, on the Host's clock. */
export function runStartedAt(item: ChatBackgroundWorkItem): string | null {
  return item.resume ? item.resume.resumedAt : item.launchedAt;
}

/** The id of the tool call that started the item's latest run, which its ending notification names. */
export function runCallID(item: ChatBackgroundWorkItem): string {
  return item.resume?.callID ?? item.id;
}

/**
 * The item as what the loaded lines say about its Subagent leaves it. A resume after the latest run
 * started begins a new run, running from the resume until the end the lines hold for it. A
 * notification naming only the agent ends the run in progress (it says the agent stopped, not which
 * run, so it never starts a run nor moves an end already read).
 */
export function followAgent(
  item: ChatBackgroundWorkItem,
  agent: ChatBackgroundWorkAgent | undefined,
): ChatBackgroundWorkItem {
  if (!agent) return item;
  const start = runOffset(item);
  if (agent.resume && agent.resume.offset > start) {
    const resumed: ChatBackgroundWorkItem = {
      ...item,
      resume: agent.resume,
      state: 'running',
      endOffset: null,
      endedAt: null,
      usage: null,
    };
    return agent.resumeEnd ? applyWorkEnd(resumed, agent.resumeEnd) : resumed;
  }
  if (item.state !== 'running') return item;
  const end = agent.notifications.find((candidate) => candidate.offset > start);
  return end ? applyWorkEnd(item, end) : item;
}

/**
 * Puts work an earlier read listed, launched above `windowStart`, ahead of the work launched in the
 * loaded lines, ending what they end and running again what they resume. The earlier read's latest message stands when none is loaded.
 */
export function carryBackgroundWork(
  transcript: ChatTranscript,
  earlier: readonly ChatBackgroundWorkItem[],
  launchedBefore: number,
  earlierPrompt: number | null,
): ChatTranscript {
  const loaded = new Set(transcript.backgroundWork.map((item) => item.id));
  const carried = earlier
    .filter((item) => item.launchOffset < launchedBefore && !loaded.has(item.id))
    .map((earlierItem) => {
      let item = earlierItem;
      const end = transcript.backgroundWorkEnds[runCallID(item)];
      if (end && end.offset > (item.endOffset ?? runOffset(item))) item = applyWorkEnd(item, end);
      else if (item.state === 'running' && transcript.backgroundWorkStop) {
        item = applyWorkEnd(item, transcript.backgroundWorkStop);
      }
      const agent =
        item.agentID === null ? undefined : transcript.backgroundWorkAgents[item.agentID];
      return followAgent(item, agent);
    });
  return {
    ...transcript,
    backgroundWork: [...carried, ...transcript.backgroundWork],
    latestPromptOffset: transcript.latestPromptOffset ?? earlierPrompt,
  };
}
