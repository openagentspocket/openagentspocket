// One tool call as a chat row (Swift ClaudeToolSummary / ClaudeToolOutcome).

import { isAbsoluteHostPath } from '../model/paths';
import { capPreview, relativeToDirectory } from '../model/preview';
import { isAssignment, RESERVED_WORDS, simpleCommands } from '../model/shell-words';
import type {
  ChatFileChanges,
  ChatToolActivity,
  ChatToolPreview,
  ToolKind,
  ToolStatus,
} from '../model/types';
import type { ClaudeToolResult, ClaudeToolResultDetails, ClaudeToolUse } from './record-types';
import { isMarker } from './user-text';

export interface ClaudeToolSummary {
  kind: ToolKind;
  title: string;
  subtitle: string | null;
}

const SELECT_PREFIX = 'select:';

function first(...values: (string | null)[]): string | null {
  for (const value of values) if (value !== null && value !== '') return value;
  return null;
}

/** A shell call's description, which its row shows, and the command line it stands for. */
export function commandPurpose(use: ClaudeToolUse): Pick<ChatToolActivity, 'purpose' | 'command'> {
  if (use.name !== 'Bash' && use.name !== 'PowerShell') return { purpose: null, command: null };
  const command = use.input.command ?? '';
  const description = first(use.input.description);
  return description === null || description === command
    ? { purpose: null, command: null }
    : { purpose: description, command };
}

export function summarizeTool(
  use: ClaudeToolUse,
  directory: string | null = null,
): ClaudeToolSummary {
  const input = use.input;
  const make = (
    kind: ToolKind,
    title: string,
    subtitle: string | null = null,
  ): ClaudeToolSummary => ({ kind, title, subtitle });
  const file = input.filePath === null ? use.name : relativeToDirectory(input.filePath, directory);
  switch (use.name) {
    case 'Bash':
    case 'PowerShell': {
      const command = input.command ?? '';
      return input.description && input.description !== command
        ? make('command', input.description, command)
        : make('command', command);
    }
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return make('fileEdit', file);
    case 'Write':
      return make('fileWrite', file);
    case 'Read':
    case 'NotebookRead':
      return make('fileRead', file);
    case 'Glob':
    case 'Grep':
      return make('search', input.pattern ?? use.name, input.path);
    case 'LS':
      return make('listing', input.path ?? use.name);
    case 'WebFetch':
      return make('web', input.url ?? use.name);
    case 'WebSearch':
      return make('web', input.query ?? use.name);
    case 'Agent':
    case 'Task':
      return make('agent', input.description ?? use.name, input.subagentType);
    case 'Workflow':
      // Its input is only a script; the row takes the name and summary from the launch result.
      return make('agent', use.name);
    case 'AskUserQuestion': {
      const texts = input.questions.map((q) => q.text);
      return make('question', texts.length === 0 ? use.name : texts.join(' · '));
    }
    case 'TodoWrite':
      return make('todo', 'Update todos');
    case 'TaskCreate': {
      const subject = first(input.subject);
      const description =
        input.description && input.description !== subject ? input.description : null;
      return make(
        'todo',
        subject ?? description ?? use.name,
        subject === null ? null : description,
      );
    }
    case 'Skill': {
      const name = input.skill ?? use.name;
      const args = input.arguments ?? '';
      return make('other', args === '' ? `/${name}` : `/${name} ${args}`);
    }
    case 'ToolSearch': {
      const query = (input.query ?? '').trim();
      const selected = query.startsWith(SELECT_PREFIX)
        ? query
            .slice(SELECT_PREFIX.length)
            .split(',')
            .map((part) => part.trim())
            .filter((part) => part !== '')
        : [];
      const title =
        selected.length > 0
          ? `Loaded ${selected.join(', ')}`
          : query === '' || query.startsWith(SELECT_PREFIX)
            ? use.name
            : `Searched tools for ${query}`;
      return make('other', title);
    }
    case 'EnterPlanMode':
      return make('other', 'Enter plan mode');
    case 'ExitPlanMode':
      return make('other', 'Exit plan mode', input.planFilePath);
    default:
      break;
  }
  if (use.name === 'TaskUpdate' && input.taskID !== null) {
    const task = input.taskID;
    return make('todo', input.status ? `Task #${task}: ${input.status}` : `Updated task #${task}`);
  }
  if (use.name === 'TaskUpdate' || use.name === 'TaskGet' || use.name === 'TaskList') {
    return make('todo', input.description ?? use.name);
  }
  if (use.name.startsWith('mcp__')) {
    // `mcp__server__tool` reads as `server.tool`.
    return make('mcp', use.name.split('__').slice(1).join('.'));
  }
  const detail = first(
    input.description,
    input.command,
    input.filePath,
    input.url,
    input.query,
    input.pattern,
    input.path,
  );
  return make('other', use.name, detail);
}

export function pendingSummary(use: ClaudeToolUse): string {
  const input = use.input;
  switch (use.name) {
    case 'Bash':
    case 'PowerShell':
      return input.command ?? '';
    case 'WebFetch':
      return input.url ?? '';
    case 'AskUserQuestion':
      return input.questions.map((q) => q.text).join('\n');
    case 'ExitPlanMode':
      return input.plan ?? '';
    default:
      return input.filePath ?? summarizeTool(use).title;
  }
}

export function pendingDetail(use: ClaudeToolUse): string | null {
  switch (use.name) {
    case 'Bash':
    case 'PowerShell':
      return use.input.description;
    case 'WebFetch':
      return use.input.prompt;
    case 'ExitPlanMode':
      return use.input.planFilePath;
    default:
      return null;
  }
}

export type ClaudeToolOutcome =
  | { type: 'succeeded'; note: string | null }
  | { type: 'declined'; feedback: string | null }
  | { type: 'clarify' }
  | { type: 'interrupted' }
  | { type: 'notCompleted' }
  | { type: 'failed' };

export const USER_DECLINE_PREFIX = "The user doesn't want to proceed with this tool use.";
export const PERMISSION_DENIED_PREFIX = 'Permission for this tool use was denied';
export const CLARIFY_REQUEST_PREFIX = 'The user wants to clarify these questions.';

export function feedbackIn(text: string): string | null {
  const at = text.toLowerCase().indexOf('user said:\n');
  if (at < 0) return null;
  const feedback = text.slice(at + 'user said:\n'.length).trim();
  return feedback === '' ? null : feedback;
}

export function toolOutcome(
  result: ClaudeToolResult,
  details: ClaudeToolResultDetails | null,
  trailingTexts: readonly string[],
): ClaudeToolOutcome {
  const text = result.content.text;
  if (details?.isDenialUnanswered) return { type: 'notCompleted' };
  if (
    details?.denialKind != null ||
    text.startsWith(USER_DECLINE_PREFIX) ||
    text.startsWith(PERMISSION_DENIED_PREFIX)
  ) {
    const feedback = details?.userFeedback ?? feedbackIn(text);
    if (feedback?.startsWith(CLARIFY_REQUEST_PREFIX)) return { type: 'clarify' };
    return { type: 'declined', feedback: feedback === '' ? null : feedback };
  }
  if (text.startsWith("The user doesn't want to take this action right now."))
    return { type: 'declined', feedback: null };
  if (text.startsWith('[Request interrupted by user')) return { type: 'interrupted' };
  if (isMarker(text)) return { type: 'notCompleted' };
  if (result.isError) return { type: 'failed' };
  const note = trailingTexts
    .filter((part) => !isMarker(part))
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join('\n');
  return { type: 'succeeded', note: note === '' ? null : note };
}

export function outcomeStatus(outcome: ClaudeToolOutcome): ToolStatus {
  switch (outcome.type) {
    case 'succeeded':
      return 'succeeded';
    case 'declined':
      return 'declined';
    case 'clarify':
      return 'chatInstead';
    case 'interrupted':
      return 'interrupted';
    case 'notCompleted':
      return 'notCompleted';
    case 'failed':
      return 'failed';
  }
}

export function outcomeNote(outcome: ClaudeToolOutcome): string | null {
  return outcome.type === 'succeeded'
    ? outcome.note
    : outcome.type === 'declined'
      ? outcome.feedback
      : null;
}

/** An interrupt marker right after a decline without feedback or an interruption adds nothing. */
export function absorbsInterruptMarker(outcome: ClaudeToolOutcome): boolean {
  switch (outcome.type) {
    case 'declined':
      return outcome.feedback === null;
    case 'clarify':
    case 'interrupted':
      return true;
    default:
      return false;
  }
}

function todoLine(todo: { content: string; status: string | null }): string {
  switch (todo.status) {
    case 'completed':
      return `[x] ${todo.content}`;
    case 'in_progress':
      return `[~] ${todo.content}`;
    default:
      return `[ ] ${todo.content}`;
  }
}

export function toolPreview(
  use: ClaudeToolUse,
  result: ClaudeToolResult,
  details: ClaudeToolResultDetails | null,
  outcome: ClaudeToolOutcome,
): ChatToolPreview | null {
  if (outcome.type === 'declined' || outcome.type === 'clarify') return null;
  // A call stopped while it ran can carry the decline text.
  if (result.content.text.startsWith(USER_DECLINE_PREFIX)) return null;
  const structured = details?.result ?? null;
  const content =
    result.content.text === '' && result.content.imageCount === 0 ? null : result.content;
  switch (use.name) {
    case 'Bash':
    case 'PowerShell':
      return structured?.commandOutput ?? (result.isError ? content : null);
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      // A recorded patch shows as the row's file changes instead.
      return result.isError ? content : null;
    case 'Agent':
    case 'Task':
    case 'Workflow':
      // Work in the background reports through its notification.
      if (structured?.status === 'async_launched' || structured?.status === 'remote_launched')
        return null;
      return structured?.agentReport ?? content;
    case 'AskUserQuestion':
    case 'ToolSearch':
    case 'ExitPlanMode':
    case 'EnterPlanMode':
      return null;
    case 'TodoWrite': {
      const todos = structured?.todos ?? use.input.todos;
      if (!todos || todos.length === 0) return content;
      return capPreview(todos.map(todoLine).join('\n'));
    }
    default:
      return content;
  }
}

const WORKING_TREE_STEPS: ReadonlySet<string> = new Set([
  'checkout',
  'switch',
  'stash',
  'pull',
  'merge',
  'rebase',
  'reset',
  'restore',
  'clean',
  'cherry-pick',
  'revert',
]);

function gitSubcommand(words: string[]): string | null {
  if (words[0] !== 'git') return null;
  let index = 1;
  while (index < words.length) {
    const word = words[index] as string;
    if (!word.startsWith('-')) return word;
    index += word === '-C' || word === '-c' ? 2 : 1;
  }
  return null;
}

export function movesWorkingTree(command: string): boolean {
  return simpleCommands(command).some((all) => {
    let words = all;
    while (words.length > 0) {
      const head = words[0] as string;
      if (head === 'function') words = words.slice(2);
      else if (RESERVED_WORDS.has(head) || isAssignment(head)) words = words.slice(1);
      else break;
    }
    if (words[0] === 'sudo') words = words.slice(1);
    const step = gitSubcommand(words);
    return step !== null && WORKING_TREE_STEPS.has(step);
  });
}

export function toolFileChanges(
  use: ClaudeToolUse,
  details: ClaudeToolResultDetails | null,
  outcome: ClaudeToolOutcome,
): ChatFileChanges | null {
  const recorded = details?.result?.fileChanges;
  if (outcome.type !== 'succeeded' || !recorded) return null;
  const changes = { ...recorded };
  if (use.name === 'Bash' && use.input.command !== null)
    changes.movesWorkingTree = movesWorkingTree(use.input.command);
  return changes;
}

export function toolImagePath(
  use: ClaudeToolUse,
  details: ClaudeToolResultDetails | null,
): string | null {
  if (use.name !== 'Read' && use.name !== 'NotebookRead') return null;
  if (details?.result?.type !== 'image') return null;
  const path = use.input.filePath;
  return path !== null && isAbsoluteHostPath(path) ? path : null;
}

export function toolExitCode(use: ClaudeToolUse, result: ClaudeToolResult): number | null {
  if ((use.name !== 'Bash' && use.name !== 'PowerShell') || !result.isError) return null;
  const match = /^Exit code (\d+)/u.exec(result.content.text);
  return match ? Number.parseInt(match[1] as string, 10) : null;
}

export type { ChatToolActivity };
