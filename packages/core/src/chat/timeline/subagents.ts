// Keeps collaboration updates of one subagent together even when other tasks interleave. A prompt or
// divider cuts the identity scope, including queued prompts within a turn.

import { type ChatRow, type ChatRowID, hashRevision } from './row';

export function coalescingSubagents(
  rows: readonly ChatRow[],
  owners: Map<ChatRowID, ChatRowID>,
): ChatRow[] {
  const result: ChatRow[] = [];
  const indices = new Map<string, number>();
  for (const row of rows) {
    const content = row.content;
    if (content.type === 'user' || content.type === 'divider') indices.clear();
    const path = content.type === 'tool' ? content.tool.subagentActivity?.agentPath : null;
    if (content.type !== 'tool' || !content.tool.subagentActivity || !path?.trim()) {
      result.push(row);
      continue;
    }
    const activity = content.tool.subagentActivity;
    const index = indices.get(path);
    const first = index === undefined ? undefined : result[index];
    const previous = first?.content.type === 'tool' ? first.content.tool.subagentActivity : null;
    if (index === undefined || !first || !previous) {
      indices.set(path, result.length);
      result.push(row);
      continue;
    }
    const events = [...previous.events, ...activity.events];
    const merged = {
      ...content.tool,
      subagentActivity: { agentPath: path, events },
      preview: null,
      output: null,
    };
    result[index] = {
      ...first,
      content: { type: 'tool', tool: merged },
      revision: hashRevision(first.revision, row.revision, merged.title, merged.status, ...events),
    };
    owners.set(row.id, first.id);
  }
  return result;
}
