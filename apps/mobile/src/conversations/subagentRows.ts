import type { ChatTranscript } from '@openagentspocket/core';
import type { SubagentRow } from '@openagentspocket/ui';

/** A subagent's transcript as the read-only timeline draws it: messages, answers and tool calls. */
export function subagentRows(transcript: ChatTranscript): SubagentRow[] {
  const rows: SubagentRow[] = [];
  for (const entry of transcript.entries) {
    const { content } = entry;
    switch (content.type) {
      case 'user':
        rows.push({ id: entry.id, kind: 'user', text: content.value.text });
        break;
      case 'assistant':
        rows.push({ id: entry.id, kind: 'assistant', text: content.value.text });
        break;
      case 'tool':
        rows.push({
          id: entry.id,
          kind: 'tool',
          summary: content.value.subtitle ?? content.value.title,
        });
        break;
      default:
        break;
    }
  }
  return rows;
}
