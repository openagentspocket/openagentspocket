// A transcript in the Swift exporter's JSON shape (goldens/README.md "JSON encoding"): enum
// payloads as `{case: payload}`, Sets as sorted arrays. Absent optionals are already `null`.
// Shared by every program's golden test.

import type { ChatBackgroundWorkItem, ChatEntry, ChatTranscript } from './model/types';

/** An entry as Swift holds it: a tool's purpose and command line are this port's, so they are left out. */
function entryImage(entry: ChatEntry): unknown {
  let value: unknown = entry.content.value;
  if (entry.content.type === 'tool') {
    const { purpose: _purpose, command: _command, ...swift } = entry.content.value;
    value = swift;
  }
  return {
    id: entry.id,
    sourceOffset: entry.sourceOffset,
    content: { [entry.content.type]: value },
  };
}

/** Background Work as Swift holds it: Subagent resumes are this port's, so their fields are left out. */
function workImage(item: ChatBackgroundWorkItem): unknown {
  const { agentID: _agentID, resume: _resume, ...swift } = item;
  return swift;
}

/** The transcript as Swift holds it: entries only this port shows are left out. */
export function goldenImage(transcript: ChatTranscript): unknown {
  const { backgroundWorkAgents: _agents, ...swift } = transcript;
  return JSON.parse(
    JSON.stringify({
      ...swift,
      entries: transcript.entries.filter((entry) => !entry.isPortOnly).map(entryImage),
      backgroundWork: transcript.backgroundWork.map(workImage),
      diagnostics: {
        ...transcript.diagnostics,
        unknownRecordTypes: [...transcript.diagnostics.unknownRecordTypes].sort(),
      },
      unrecordedEntryIDs: [...transcript.unrecordedEntryIDs].sort(),
    }),
  );
}
