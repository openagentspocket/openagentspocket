// Row builders and an id printer shared by the timeline tests (Swift ChatTimelineProjectionTests).

import { renderText } from '../../errors/text';
import { toolActivity, userMessage } from '../model/factories';
import type {
  ChatDiffStats,
  ChatFileChange,
  ChatFileChanges,
  ChatNotice,
  ChatToolActivity,
  ChatTurn,
  NoticeKind,
  ToolKind,
  ToolStatus,
  TurnEnding,
} from '../model/types';
import { type ProjectionInput, type ProjectionOutput, projectTimeline } from './projection';
import {
  type ChatOlderHistory,
  type ChatRow,
  type ChatRowContent,
  type ChatRowID,
  chatRow,
  entryOf,
  rowID,
  turnSignals,
} from './row';

export const START = '2026-10-04T10:15:42.000Z';
const startMs = Date.parse(START);

export const entryRow = (id: string, content: ChatRowContent, revision = 1): ChatRow =>
  chatRow(rowID.entry(id), content, revision);

export const user = (id: string, queued = false) =>
  entryRow(id, { type: 'user', message: userMessage(id, { wasQueued: queued }) });
export const text = (id: string) => entryRow(id, { type: 'assistant', source: id });
export const thought = (id: string, body = 'Considering') =>
  entryRow(id, { type: 'reasoning', reasoning: { text: body, durationMilliseconds: null } });

export function toolOf(
  id: string,
  kind: ToolKind = 'command',
  extra: {
    name?: string;
    title?: string;
    status?: ToolStatus;
    diff?: ChatDiffStats;
    changes?: ChatFileChanges;
  } = {},
): ChatToolActivity {
  return toolActivity({
    kind,
    name: extra.name ?? 'Bash',
    title: extra.title ?? id,
    status: extra.status ?? 'succeeded',
    diff: extra.diff ?? null,
    fileChanges: extra.changes ?? null,
  });
}

export const tool = (...args: Parameters<typeof toolOf>) =>
  entryRow(args[0], { type: 'tool', tool: toolOf(...args) });

export const notice = (id: string, kind: NoticeKind) =>
  entryRow(id, {
    type: 'notice',
    notice: { kind, title: id, detail: null, rawDetail: null, questions: [] } satisfies ChatNotice,
  });

export const turn = (
  first: string,
  options: { ended?: boolean; ending?: TurnEnding; seconds?: number } = {},
): ChatTurn => {
  const { ended = true, ending = 'completed', seconds = 35 } = options;
  return {
    firstEntryID: first,
    startedAt: START,
    endedAt: ended ? new Date(startMs + seconds * 1000).toISOString() : null,
    ending: ended ? ending : null,
  };
};

export const fileChange = (
  path: string,
  kind: ChatFileChange['kind'] = 'updated',
): ChatFileChange => ({
  path,
  kind,
  added: 1,
  removed: 0,
  lineCount: 1,
  hunks: [],
  isLineCut: false,
});

export const fileChanges = (
  files: ChatFileChange[],
  extra: Partial<ChatFileChanges> = {},
): ChatFileChanges => ({
  files,
  moreFiles: 0,
  directory: null,
  isShared: false,
  isUnavailable: false,
  isSkipped: false,
  movesWorkingTree: false,
  ...extra,
});

export const IDLE = turnSignals({ activity: 'idle' });
export const WORKING = turnSignals({ activity: 'working' });

export const project = (
  rows: readonly ChatRow[],
  input: Partial<ProjectionInput> & { turns: ChatTurn[] },
): ProjectionOutput => projectTimeline(rows, { signals: IDLE, ...input });

/** Short ids: "u1", "[turn a1]", "[group c2]", "  c1" for nested, "[working]". */
export function ids(output: ProjectionOutput): string[] {
  return output.rows.map((row) => {
    const entry = entryOf(row.id);
    if (entry !== null) return row.isNested ? `  ${entry}` : entry;
    if (row.id.startsWith('pending:')) return 'pending';
    if (row.id === 'older') return 'older';
    if (row.id === 'liveTurn') return '[working]';
    if (row.id.startsWith('turn:')) return `[turn ${row.id.slice(5)}]`;
    if (row.id.startsWith('group:')) return `[group ${row.id.slice(6)}]`;
    return `[live group ${row.id.slice(10)}]`;
  });
}

export const find = (output: ProjectionOutput, id: ChatRowID) =>
  output.rows.find((row) => row.id === id);

export function turnHeaderOf(output: ProjectionOutput, id: ChatRowID) {
  const content = find(output, id)?.content;
  return content?.type === 'turnHeader' ? content.header : undefined;
}

export function groupOf(output: ProjectionOutput, id: ChatRowID) {
  const content = find(output, id)?.content;
  return content?.type === 'toolGroup' ? content.group : undefined;
}

export const groupSummary = (output: ProjectionOutput, id: ChatRowID) => {
  const group = groupOf(output, id);
  return group ? renderText(group.summary) : undefined;
};

export function toolIn(output: ProjectionOutput, id: string): ChatToolActivity | undefined {
  const content = find(output, rowID.entry(id))?.content;
  return content?.type === 'tool' ? content.tool : undefined;
}

/** A finished turn: prompt, narration, two commands, a plan, an edit, and a two-part answer. */
export const finished: ChatRow[] = [
  user('u1'),
  text('n1'),
  tool('c1'),
  thought('r1'),
  tool('c2'),
  entryRow('p1', {
    type: 'plan',
    plan: {
      text: 'Plan',
      filePath: null,
      status: 'succeeded',
      note: null,
      callID: null,
      cardAnswer: null,
    },
  }),
  tool('e1', 'fileEdit', { name: 'Edit' }),
  text('a1'),
  text('a2'),
];

export const olderRow = (older: ChatOlderHistory) =>
  chatRow(rowID.olderHistory, { type: 'olderHistory', older }, 1);

export function subagentTool(path: string | null, event: string): ChatToolActivity {
  return toolActivity({
    kind: 'agent',
    name: 'SubAgentActivity',
    title: 'Subagent: task',
    status: event === 'completed' ? 'succeeded' : 'noResult',
    subagentActivity: { agentPath: path, events: [event] },
  });
}
