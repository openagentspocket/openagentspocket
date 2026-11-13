// A transcript in the Swift exporter's JSON shape (goldens/README.md "JSON encoding"): enum
// payloads as `{case: payload}`, Sets as sorted arrays. Absent optionals are already `null`.
// Shared by every program's golden test.

import type { ChatBackgroundWorkItem, ChatEntry, ChatTranscript } from './model/types';

function entryImage(entry: ChatEntry): unknown {
  return {
    id: entry.id,
    sourceOffset: entry.sourceOffset,
    content: { [entry.content.type]: entry.content.value },
  };
}

/** Background Work as Swift holds it: Subagent resumes are this port's, so their fields are left out. */
function workImage(item: ChatBackgroundWorkItem): unknown {
  const { agentID: _agentID, resume: _resume, ...swift } = item;
  return swift;
}

export function goldenImage(transcript: ChatTranscript): unknown {
  const { backgroundWorkAgents: _agents, ...swift } = transcript;
  return JSON.parse(
    JSON.stringify({
      ...swift,
      entries: transcript.entries.map(entryImage),
      backgroundWork: transcript.backgroundWork.map(workImage),
      diagnostics: {
        ...transcript.diagnostics,
        unknownRecordTypes: [...transcript.diagnostics.unknownRecordTypes].sort(),
      },
      unrecordedEntryIDs: [...transcript.unrecordedEntryIDs].sort(),
    }),
  );
}
