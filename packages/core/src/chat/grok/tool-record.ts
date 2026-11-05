// One record of a Grok Build tool call (Swift GrokUpdateRecord.Tool). Grok writes three for each
// `toolCallId`: the call, whose `title` is the tool's name; the input it holds back until the call
// runs, with a readable `title`, `locations` and `rawInput.variant`; and the result, with `status`,
// `rawOutput` and, for a call that never ran, `_meta.toolNotRun`.

import { question } from '../model/factories';
import { asArray, asObject, asString, type JsonObject } from '../model/reducer';
import type { ChatFileChanges, ChatQuestion, ChatToolPreview } from '../model/types';
import { changesFromApplied, changesFromContent } from './file-changes';
import { integer, previewOf, todoText } from './values';

export interface GrokTodo {
  content: string;
  /** `pending`, `in_progress` or `completed`. */
  status: string | null;
}

/** What a call's `rawInput` names. The call holds part of it, the input update all of it. */
export interface GrokInput {
  /** The input update's name for the tool's input: `Bash`, `SearchReplace`, `Task`. */
  variant: string | null;
  command: string | null;
  description: string | null;
  /** The file a read, edit or write names. */
  filePath: string | null;
  /** The directory a listing or search names. */
  path: string | null;
  pattern: string | null;
  query: string | null;
  url: string | null;
  /** An MCP tool's `<server>__<tool>`. */
  toolName: string | null;
  subagentType: string | null;
  /** The call starts its command or subagent in the background. */
  isBackground: boolean;
  questions: ChatQuestion[];
  todos: GrokTodo[];
}

/** A call's result. */
export interface GrokOutput {
  /** `rawOutput.type`: `Bash`, `SearchReplace`, `MCP`, `Text`. */
  type: string | null;
  /** What the row shows; null when it shows something else, such as an edit's diff or a question's answers. */
  preview: ChatToolPreview | null;
  /** A command's exit code, when it ran to its end. */
  exitCode: number | null;
  signal: string | null;
  /** Grok moved the command to the background before it ended; the result has no status then. */
  isBackgrounded: boolean;
  /** The background task the call started. */
  taskID: string | null;
  /** A question's answers, as Grok lists them for the model: `"<question>"="<answer>", …`. */
  answers: string | null;
  /** The user declined the questions, or no user could answer them. */
  isUnanswered: boolean;
  command: string | null;
  /** The file an edit changed. */
  path: string | null;
  /** An MCP call's server and tool. */
  server: string | null;
  tool: string | null;
}

export interface GrokTool {
  callID: string;
  /** Grok's name for the tool (`_meta["x.ai/tool"].name`): `run_terminal_command`, `search_replace`. */
  name: string | null;
  /** Grok's own kind for the tool: `execute`, `task`, `plan`. */
  toolKind: string | null;
  /** The tool's label: `Run Command`. */
  label: string | null;
  /** The ACP kind: `execute`, `read`, `edit`, `other`. */
  kind: string | null;
  title: string | null;
  /** The first path the record locates. */
  location: string | null;
  input: GrokInput | null;
  /** `in_progress`, `completed` or `failed`. */
  status: string | null;
  /** Why the call never ran: `rejected` or `cancelled`. */
  notRun: string | null;
  /** Null for a record that is not the call's result. */
  output: GrokOutput | null;
  /** The diff items in `content`, or a result's `EditsApplied` when its content holds none. */
  fileChanges: ChatFileChanges | null;
}

const ANSWERED_PREFIX = 'User has answered your questions: ';
const ANSWERED_SUFFIX = ". You can now continue with the user's answers in mind.";
const UNANSWERED_PREFIXES = [
  'User declined to answer the questions',
  'No user is available to answer questions',
];

/** What a tagged failure reads as when nothing else describes it. */
const READABLE_FAILURES: Record<string, string> = {
  FileNotFound: 'File not found',
  NotADirectory: 'Not a directory',
  MultipleMatchesFound: 'Multiple matches',
  InvalidInput: 'Invalid input',
  FileTooLarge: 'File too large',
};

function parseQuestions(value: unknown): ChatQuestion[] {
  const items = asArray(value);
  if (items === null) return [];
  const questions: ChatQuestion[] = [];
  for (const raw of items) {
    const item = asObject(raw);
    const text = asString(item?.question);
    if (item === null || text === null) continue;
    const options = (asArray(item.options) ?? []).flatMap((rawOption) => {
      const option = asObject(rawOption);
      const label = asString(option?.label);
      return label === null ? [] : [{ label, detail: asString(option?.description) }];
    });
    questions.push(
      question({
        id: asString(item.id),
        header: asString(item.header),
        text,
        options,
        isMultiSelect: item.multiSelect === true || item.multi_select === true,
      }),
    );
  }
  return questions;
}

export function parseTodos(value: unknown): GrokTodo[] {
  const items = asArray(value);
  if (items === null) return [];
  return items.flatMap((raw) => {
    const item = asObject(raw);
    const content = asString(item?.content);
    return content === null ? [] : [{ content, status: asString(item?.status) }];
  });
}

function parseInput(raw: JsonObject, meta: JsonObject | null): GrokInput {
  return {
    variant: asString(raw.variant),
    command: asString(raw.command),
    description: asString(raw.description),
    filePath: asString(raw.file_path) ?? asString(raw.target_file),
    path: asString(raw.target_directory) ?? asString(raw.path),
    pattern: asString(raw.pattern),
    query: asString(raw.query) ?? asString(raw.search_term),
    url: asString(raw.url),
    toolName: asString(raw.tool_name),
    subagentType: asString(raw.subagent_type),
    isBackground:
      ['is_background', 'background', 'run_in_background'].some((key) => raw[key] === true) ||
      meta?.subagentBackground === true,
    questions: parseQuestions(raw.questions),
    todos: parseTodos(raw.todos),
  };
}

/** Adds what a later record of the call names. */
export function mergeInput(into: GrokInput, later: GrokInput): GrokInput {
  return {
    variant: later.variant ?? into.variant,
    command: later.command ?? into.command,
    description: later.description ?? into.description,
    filePath: later.filePath ?? into.filePath,
    path: later.path ?? into.path,
    pattern: later.pattern ?? into.pattern,
    query: later.query ?? into.query,
    url: later.url ?? into.url,
    toolName: later.toolName ?? into.toolName,
    subagentType: later.subagentType ?? into.subagentType,
    isBackground: into.isBackground || later.isBackground,
    questions: later.questions.length > 0 ? later.questions : into.questions,
    todos: later.todos.length > 0 ? later.todos : into.todos,
  };
}

/** The variant of an externally tagged `rawOutput`, such as `{type: ReadFile, FileNotFound: "…"}`: its smallest key besides `type` that starts with a capital. */
function tagOf(raw: JsonObject | null): { name: string; value: unknown } | null {
  if (raw === null) return null;
  const names = Object.keys(raw)
    .filter((key) => key !== 'type' && /^\p{Lu}/u.test(key))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const name = names[0];
  return name === undefined ? null : { name, value: raw[name] };
}

/** The text items of `content`, joined, and its images. */
function contentOf(value: unknown): { text: string | null; images: number } {
  const items = asArray(value);
  if (items === null) return { text: null, images: 0 };
  const texts: string[] = [];
  let images = 0;
  for (const raw of items) {
    const item = asObject(raw);
    if (asString(item?.type) !== 'content') continue;
    const inner = asObject(item?.content);
    const type = asString(inner?.type);
    if (type === 'text') {
      const text = asString(inner?.text);
      if (text !== null) texts.push(text);
    } else if (type === 'image') {
      images += 1;
    }
  }
  const text = texts.join('\n');
  return { text: text === '' ? null : text, images };
}

/** A command's output without the `exit: <code>` line Grok puts first for the model. */
function withoutExitLine(text: string): string {
  if (!text.startsWith('exit: ')) return text;
  const newline = text.indexOf('\n');
  return newline < 0 ? '' : text.slice(newline + 1);
}

/** The outputs a read of several tasks found, one after another, else its summary. */
function outputsOf(results: unknown): string | null {
  const object = asObject(results);
  const outputs = (asArray(object?.results) ?? [])
    .map((item) => asString(asObject(item)?.output))
    .filter((output): output is string => output !== null && output !== '');
  return outputs.length === 0 ? asString(object?.summary) : outputs.join('\n');
}

/**
 * The text a result shows: an error's message, a command's output, an MCP tool's, a subagent's
 * report, a background task's output or the todo list, else the content's text, else a failure's
 * readable name.
 */
function shownText(
  raw: JsonObject | null,
  type: string | null,
  tag: { name: string; value: unknown } | null,
  content: string | null,
  failed: boolean,
): string | null {
  if (raw !== null && 'error' in raw) {
    const message = asString(raw.message);
    if (message !== null) return message;
  }
  const tagValue = asObject(tag?.value);
  switch (type) {
    case 'Bash': {
      // A command sent to the background shows its output once its task ends.
      if (asString(raw?.signal) === 'backgrounded') return null;
      const forPrompt = asString(raw?.output_for_prompt);
      return forPrompt === null ? content : withoutExitLine(forPrompt);
    }
    case 'MCP': {
      const output = asObject(raw?.output);
      return asString(output?.OkayOutput) ?? asString(output?.Error) ?? content;
    }
    case 'SubagentCompleted':
      return asString(raw?.output) ?? content;
    // `get_command_or_subagent_output` and `kill_command_or_subagent`, whose results hold no
    // content: the output read, Grok's word on the kill, or why it found no such task.
    case 'TaskOutput':
      if (tag?.name === 'Result') return asString(tagValue?.output) ?? content;
      if (tag?.name === 'MultiResult') return outputsOf(tag.value) ?? content;
      if (tag?.name === 'TaskNotFound') return asString(tag.value) ?? content;
      break;
    case 'KillTask':
      if (tag?.name === 'Result') return asString(tagValue?.message) ?? content;
      if (tag?.name === 'TaskNotFound') return asString(tag.value) ?? content;
      break;
    case 'Todo': {
      const todos = parseTodos(tagValue?.todos);
      return todos.length === 0 ? content : todoText(todos);
    }
    case 'AskUserQuestion':
    case 'BackgroundTaskStarted':
      return null;
    case 'SearchReplace':
      if (tag?.name === 'EditsApplied') return null;
      break;
    case 'ListDir':
      if (tag?.name === 'Content') return asString(tagValue?.content) ?? content;
      break;
    default:
      break;
  }
  if (content !== null) return content;
  if (failed && tag !== null) return READABLE_FAILURES[tag.name] ?? tag.name;
  return asString(raw?.pre_formatted) ?? asString(raw?.content) ?? asString(raw?.text);
}

function parseOutput(
  update: JsonObject,
  status: string | null,
  notRun: string | null,
): GrokOutput | null {
  const raw = asObject(update.rawOutput);
  const type = asString(raw?.type);
  const signal = asString(raw?.signal);
  const isBackgrounded = type === 'Bash' && signal === 'backgrounded';
  if (!(status === 'completed' || status === 'failed' || notRun !== null || isBackgrounded)) {
    return null;
  }
  const content = contentOf(update.content);
  const tag = tagOf(raw);
  const tagValue = asObject(tag?.value);
  const message = content.text ?? asString(tagValue?.message) ?? '';
  let answers: string | null = null;
  if (message.startsWith(ANSWERED_PREFIX)) {
    answers = message.slice(ANSWERED_PREFIX.length);
    if (answers.endsWith(ANSWERED_SUFFIX)) answers = answers.slice(0, -ANSWERED_SUFFIX.length);
  }
  let preview: ChatToolPreview | null = null;
  if (notRun === null) {
    const text = shownText(raw, type, tag, content.text, status === 'failed');
    preview = previewOf(text ?? (content.images > 0 ? '' : null), content.images);
  }
  return {
    type,
    signal,
    isBackgrounded,
    // A search keeps ripgrep's exit code too, 1 when nothing matched; only a command's says how the call ended.
    exitCode: type === 'Bash' && signal === null ? integer(raw?.exit_code) : null,
    taskID: type === 'BackgroundTaskStarted' ? asString(raw?.task_id) : null,
    command: asString(raw?.command),
    path: asString(asObject(raw?.EditsApplied)?.absolute_path),
    server: type === 'MCP' ? asString(raw?.server_name) : null,
    tool: type === 'MCP' ? asString(raw?.tool_name) : null,
    answers,
    isUnanswered: UNANSWERED_PREFIXES.some((prefix) => message.startsWith(prefix)),
    preview,
  };
}

/** Null when the update names no call. */
export function parseTool(update: JsonObject): GrokTool | null {
  const callID = asString(update.toolCallId);
  if (callID === null || callID === '') return null;
  const meta = asObject(update._meta);
  const tool = asObject(meta?.['x.ai/tool']);
  const locations = asArray(update.locations);
  const location =
    locations === null
      ? null
      : (locations
          .map((raw) => asString(asObject(raw)?.path))
          .find((path): path is string => path !== null) ?? null);
  const rawInput = asObject(update.rawInput);
  const status = asString(update.status);
  const notRun = asString(meta?.toolNotRun);
  const output = parseOutput(update, status, notRun);
  let fileChanges = changesFromContent(update.content);
  if (fileChanges === null && output !== null) {
    const applied = asObject(update.rawOutput)?.EditsApplied;
    if (applied !== undefined) fileChanges = changesFromApplied(applied);
  }
  return {
    callID,
    name: asString(tool?.name),
    toolKind: asString(tool?.kind),
    label: asString(tool?.label),
    kind: asString(update.kind),
    title: asString(update.title),
    location,
    input: rawInput === null ? null : parseInput(rawInput, meta),
    status,
    notRun,
    output,
    fileChanges,
  };
}
