// A transcript in the Swift exporter's JSON shape (goldens/README.md "JSON encoding"): enum
// payloads as `{case: payload}`, Sets as sorted arrays. Absent optionals are already `null`.
// Shared by every program's golden test.

import type { ChatEntry, ChatTranscript } from './model/types';

function entryImage(entry: ChatEntry): unknown {
  return {
    id: entry.id,
    sourceOffset: entry.sourceOffset,
    content: { [entry.content.type]: entry.content.value },
  };
}

export function goldenImage(transcript: ChatTranscript): unknown {
  return JSON.parse(
    JSON.stringify({
      ...transcript,
      entries: transcript.entries.map(entryImage),
      diagnostics: {
        ...transcript.diagnostics,
        unknownRecordTypes: [...transcript.diagnostics.unknownRecordTypes].sort(),
      },
      unrecordedEntryIDs: [...transcript.unrecordedEntryIDs].sort(),
    }),
  );
}
