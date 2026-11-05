// What the Pi reducer reads out of one tool call and its result (Swift PiTranscriptReducer's
// private helpers): the row's kind and title, Oh My Pi's `ask` questions and their answers, the
// `xd://` devices it drives tools through, and the message `content` blocks.

import { question, toolActivity } from '../model/factories';
import { capPreview, relativeToDirectory } from '../model/preview';
import { asArray, asBool, asInt, asObject, asString, type JsonObject } from '../model/reducer';
import type {
  ChatAgentActivity,
  ChatFileChanges,
  ChatQuestion,
  ChatToolActivity,
  ChatToolPreview,
  ToolKind,
  ToolStatus,
} from '../model/types';
import { patchPaths } from './file-changes';

/** Oh My Pi's scheme for the session's own planning files. */
export const LOCAL_SCHEME = 'local://';
/** What Oh My Pi records for an assistant message that ends a turn without a user interruption. */
export const OMP_SILENT_ABORT = '__omp.silent_abort__';
/** The result of Oh My Pi's plan proposal, before its review screen. */
export const PLAN_READY = 'Plan ready for review.';
/** The `xd://` device Oh My Pi proposes a plan through. */
export const PLAN_DEVICE = 'propose';
/** Pi's assistant error for a turn the user stopped. */
export const PI_ABORT = 'This operation was aborted';
/** Oh My Pi's results for a call the user declined: an approval denied, or a question dismissed. */
export const DENIED_PREFIX = 'Tool call denied by user:';
export const ASK_CANCELLED = 'Ask tool was cancelled by the user';
/** Results of calls the user stopped while they ran. */
export const ABORTED_RESULTS: ReadonlySet<string> = new Set([
  'Command aborted',
  'Operation aborted',
]);
/** How soon after a turn's tool results Pi writes a steer it delivers (seconds). */
export const STEER_WRITE_WINDOW = 2;

const DEVICE_PREFIX = 'xd://';

/** Message `content`: an array of blocks, or a bare string as one text block. */
export function blocks(content: unknown): unknown[] {
  const array = asArray(content);
  if (array) return array;
  const text = asString(content);
  return text === null ? [] : [{ type: 'text', text }];
}

export function textOf(content: unknown): string {
  const parts: string[] = [];
  for (const block of blocks(content)) {
    const object = asObject(block);
    if (asString(object?.type) !== 'text') continue;
    const text = asString(object?.text);
    if (text !== null) parts.push(text);
  }
  return parts.join('\n');
}

export function imageCount(content: unknown): number {
  return blocks(content).filter((block) => asString(asObject(block)?.type) === 'image').length;
}

export function resultPreview(message: JsonObject): ChatToolPreview {
  return capPreview(textOf(message.content), imageCount(message.content));
}

/**
 * The device a write to `xd://<tool>` or `xd://<tool>/<topic>` drives: Oh My Pi mounts discoverable
 * tools there (setting `tools.xdev`, on by default in 18.11).
 */
export function deviceOf(name: string, path: string | null): string | null {
  if (name.toLowerCase() !== 'write' || path === null || !path.startsWith(DEVICE_PREFIX))
    return null;
  const rest = path.slice(DEVICE_PREFIX.length);
  const slash = rest.indexOf('/');
  const device = slash < 0 ? rest : rest.slice(0, slash);
  return device === '' ? null : device;
}

/** A device call's arguments: the JSON object its write's `content` holds. */
export function deviceArguments(args: unknown): unknown {
  const content = asString(asObject(args)?.content);
  if (content === null) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** Oh My Pi's `ask` questions. Optional fields arrive as JSON null. */
function questionsOf(value: unknown): ChatQuestion[] {
  const items = asArray(value);
  if (!items) return [];
  const out: ChatQuestion[] = [];
  for (const item of items) {
    const raw = asObject(item);
    const text = asString(raw?.question);
    if (text === null) continue;
    const options = (asArray(raw?.options) ?? []).flatMap((row) => {
      const option = asObject(row);
      const label = asString(option?.label);
      return label === null ? [] : [{ label, detail: asString(option?.description) }];
    });
    const recommended = asInt(raw?.recommended);
    out.push(
      question({
        id: asString(raw?.id),
        header: asString(raw?.header),
        text,
        options,
        isMultiSelect: asBool(raw?.multi) === true,
        recommendedIndex:
          recommended !== null && recommended >= 0 && recommended < options.length
            ? recommended
            : null,
      }),
    );
  }
  return out;
}

/**
 * The options an answered `ask` selected: one question's in `selectedOptions`, several questions'
 * in `results` by id.
 */
export function recordAnswers(details: unknown, questions: ChatQuestion[]): void {
  const answer = (value: JsonObject | null): string | null => {
    const selected = asArray(value?.selectedOptions);
    if (!selected) return null;
    const labels = selected.filter((label): label is string => typeof label === 'string');
    return labels.length === 0 ? null : labels.join(', ');
  };
  const record = asObject(details);
  const results = asArray(record?.results);
  if (results) {
    for (const result of results) {
      const raw = asObject(result);
      const id = asString(raw?.id);
      const target = questions.find((candidate) => candidate.id !== null && candidate.id === id);
      if (target) target.answer = answer(raw) ?? target.answer;
    }
  } else if (questions.length === 1) {
    const given = answer(record);
    const only = questions[0];
    if (given !== null && only) only.answer = given;
  }
}

function kindOf(name: string): ToolKind {
  switch (name.toLowerCase()) {
    case 'bash':
    case 'exec':
    case 'python':
      return 'command';
    case 'read':
      return 'fileRead';
    case 'edit':
    case 'apply_patch':
      return 'fileEdit';
    case 'write':
      return 'fileWrite';
    // Oh My Pi 18 calls its file finder `glob`.
    case 'grep':
    case 'find':
    case 'glob':
      return 'search';
    case 'ls':
      return 'listing';
    case 'web_search':
    case 'fetch':
    case 'browse':
      return 'web';
    case 'task':
    case 'subagent':
      return 'agent';
    case 'ask':
    case 'ask_user':
      return 'question';
    default:
      return 'other';
  }
}

function statusFor(activity: ChatAgentActivity): ToolStatus {
  switch (activity) {
    case 'working':
      return 'running';
    case 'blocked':
      return 'awaitingApproval';
    default:
      return 'interrupted';
  }
}

const firstCharacters = (text: string, count: number) => Array.from(text).slice(0, count).join('');

/** A call's row: its kind, and a title from what it targets (or, failing that, what it is for). */
export function toolRow(
  name: string,
  args: unknown,
  callID: string,
  activity: ChatAgentActivity,
  directory: string | null,
): ChatToolActivity {
  const kind = kindOf(name);
  const arguments_ = asObject(args);
  const questions = kind === 'question' ? questionsOf(arguments_?.questions) : [];
  // Paths read relative to the session's directory, and Oh My Pi's free-form edit patch names its
  // files only in its headers.
  const single = asString(arguments_?.path) ?? asString(arguments_?.file_path);
  const paths =
    single !== null
      ? [single]
      : kind === 'fileEdit'
        ? patchPaths(asString(arguments_?.input) ?? '')
        : [];
  const pathTarget =
    paths.length === 0
      ? null
      : paths.map((path) => relativeToDirectory(path, directory)).join(', ');
  const target =
    asString(arguments_?.command) ??
    pathTarget ??
    asString(arguments_?.pattern) ??
    asString(arguments_?.query) ??
    asString(arguments_?.url);
  // A question's Blocked label is its first question. A call with no target says what it is for in `i`.
  const summary = questions[0]?.text ?? target ?? name;
  const subtitle = target === null && questions.length === 0 ? asString(arguments_?.i) : null;
  return toolActivity({
    kind,
    name,
    title: firstCharacters(summary, 500),
    subtitle,
    status: statusFor(activity),
    questions,
    callID,
  });
}

/**
 * Lists an edit's files under its row. A call whose arguments named no path, such as Oh My Pi's
 * free-form patch, takes its title from them, read as the list reads them. A file the patch named
 * as `local://name`, which Oh My Pi resolves into the session's own `<session>/local/name`, keeps
 * that name, as the read and write rows of the same file show it, rather than the account's
 * session path.
 */
export function showChanges(
  changes: ChatFileChanges,
  tool: ChatToolActivity,
  namedByCall: boolean,
  localPaths: readonly string[] = [],
): void {
  tool.fileChanges = changes;
  tool.diff = {
    added: changes.files.reduce((sum, file) => sum + file.added, 0),
    removed: changes.files.reduce((sum, file) => sum + file.removed, 0),
    files: changes.files.length + changes.moreFiles,
  };
  if (!namedByCall && changes.files.length > 0) {
    const names = changes.files.map(
      (file) =>
        localPaths.find((local) =>
          file.path.endsWith(`/local/${local.slice(LOCAL_SCHEME.length)}`),
        ) ?? relativeToDirectory(file.path, changes.directory),
    );
    tool.title = firstCharacters(names.join(', '), 500);
  }
}
