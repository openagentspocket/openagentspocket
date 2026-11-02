// Derived views and merges of a ChatTranscript (Swift ChatTranscript extensions).

import type {
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

/**
 * Puts work an earlier read listed, launched above `windowStart`, ahead of the work launched in the
 * loaded lines, ending what they end. The earlier read's latest message stands when none is loaded.
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
    .map((item) => {
      const end = transcript.backgroundWorkEnds[item.id];
      if (end && end.offset > (item.endOffset ?? item.launchOffset)) return applyWorkEnd(item, end);
      if (item.state === 'running' && transcript.backgroundWorkStop) {
        return applyWorkEnd(item, transcript.backgroundWorkStop);
      }
      return item;
    });
  return {
    ...transcript,
    backgroundWork: [...carried, ...transcript.backgroundWork],
    latestPromptOffset: transcript.latestPromptOffset ?? earlierPrompt,
  };
}
