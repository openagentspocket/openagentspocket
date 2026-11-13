// How an OpenCode tool call shows as a row: its kind by name, its title from its input, its status
// from its state, and its output (Swift OpenCodeToolSummary).

import { toolActivity } from '../model/factories';
import { patchPaths } from '../model/patch-paths';
import { isAbsoluteHostPath } from '../model/paths';
import { capPreview, relativeToDirectory } from '../model/preview';
import type { ChatToolOutput } from '../model/reducer';
import type {
  ChatFileChanges,
  ChatOutputReference,
  ChatQuestion,
  ChatToolActivity,
  ChatToolPreview,
  ToolKind,
  ToolStatus,
} from '../model/types';
import { openCodeFileChanges } from './file-changes';
import type { OpenCodeTool } from './record';

/** The errors OpenCode records for a call the user declined, or a question the user dismissed. */
export const DECLINED_MESSAGES: ReadonlySet<string> = new Set([
  'The user declined this tool call',
  'The user dismissed this question',
]);

/** The line that ends an output OpenCode itself shortened. */
export const SHORTENED_NOTE =
  '[OpenCode shortened this output. The full output stays on the Host.]';

const IMAGE_EXTENSIONS = new Set([
  'avif',
  'bmp',
  'gif',
  'heic',
  'heif',
  'jpeg',
  'jpg',
  'png',
  'tif',
  'tiff',
  'webp',
]);

/** The first matching kind wins: `ast_grep_replace` edits, the other `ast_grep_*` tools search. */
export function toolKindOf(rawName: string): ToolKind {
  const name = rawName.toLowerCase();
  switch (name) {
    case 'shell':
    case 'bash':
    case 'interactive_bash':
    case 'execute':
      return 'command';
    case 'read':
      return 'fileRead';
    case 'edit':
    case 'patch':
    case 'apply_patch':
    case 'ast_grep_replace':
      return 'fileEdit';
    case 'write':
      return 'fileWrite';
    case 'grep':
    case 'glob':
    case 'codesearch':
      return 'search';
    case 'list':
    case 'ls':
      return 'listing';
    case 'webfetch':
    case 'websearch':
      return 'web';
    case 'subagent':
    case 'task':
    case 'call_omo_agent':
      return 'agent';
    case 'question':
      return 'question';
    case 'todowrite':
    case 'todoread':
      return 'todo';
    case 'mcp-resource':
      return 'mcp';
    default:
      break;
  }
  if (name.startsWith('grep_app_') || name.startsWith('ast_grep_')) return 'search';
  if (name.startsWith('websearch_')) return 'web';
  return 'other';
}

export function toolStatusOf(tool: OpenCodeTool): ToolStatus {
  switch (tool.status) {
    case 'completed': {
      const exit = tool.metadata?.exit;
      if (exit != null && exit !== 0) return 'failed';
      // A call that left its work running in the background completes saying so.
      return tool.metadata?.status === 'running' ? 'started' : 'succeeded';
    }
    case 'error':
      if (tool.error?.type !== 'aborted') return 'failed';
      return DECLINED_MESSAGES.has(tool.error.message ?? '') ? 'declined' : 'interrupted';
    default:
      return 'running';
  }
}

const pathOf = (tool: OpenCodeTool) => tool.input.filePath ?? tool.input.path;

const prefix500 = (text: string) => Array.from(text).slice(0, 500).join('');

function labelOf(tool: OpenCodeTool, kind: ToolKind): { title: string; subtitle: string | null } {
  const { input } = tool;
  switch (kind) {
    case 'agent': {
      const agent = input.agent ?? input.subagentType;
      if (input.description === null) return { title: agent ?? tool.name, subtitle: null };
      return { title: input.description, subtitle: agent };
    }
    case 'question':
      return { title: input.questions[0]?.question ?? tool.name, subtitle: null };
    case 'other': {
      if (tool.name.toLowerCase() !== 'skill') return { title: tool.name, subtitle: null };
      const skill = tool.metadata?.name ?? input.id;
      return {
        title: skill === null || skill === undefined ? tool.name : `Skill ${skill}`,
        subtitle: null,
      };
    }
    default: {
      const paths = input.patchText === null ? [] : patchPaths(input.patchText);
      const target =
        pathOf(tool) ??
        input.command ??
        input.pattern ??
        input.url ??
        input.query ??
        (paths.length === 0 ? null : paths.join(', '));
      return { title: target ?? tool.name, subtitle: null };
    }
  }
}

/** A shell call's description (OpenCode's bash tool asks for one), which its row shows over the command. */
function purposeOf(tool: OpenCodeTool, kind: ToolKind, title: string): string | null {
  const description = tool.input.description?.trim() ?? '';
  return kind === 'command' && description !== '' && description !== title ? description : null;
}

/** The questions a question tool asked, each with its answer once given. */
function questionsOf(tool: OpenCodeTool): ChatQuestion[] {
  const answers = tool.metadata?.answers ?? [];
  const out: ChatQuestion[] = [];
  tool.input.questions.forEach((question, index) => {
    if (question.question === null) return;
    const labels = answers[index] ?? [];
    out.push({
      id: null,
      header: question.header,
      text: question.question,
      options: question.options.flatMap((option) =>
        option.label === null ? [] : [{ label: option.label, detail: option.description }],
      ),
      isMultiSelect: question.multiple === true,
      recommendedIndex: null,
      answer: labels.length === 0 ? null : labels.join(', '),
      queuedAnswer: null,
    });
  });
  return out;
}

/** A subagent's result without the `<subagent …>` element around it. */
function subagentResult(text: string): string {
  const end = text.indexOf('\n');
  if (!text.startsWith('<subagent ') || end < 0 || !text.slice(0, end).endsWith('>')) return text;
  let result = text.slice(end + 1);
  if (result.endsWith('</subagent>')) result = result.slice(0, -'</subagent>'.length);
  if (result.endsWith('\n')) result = result.slice(0, -1);
  return result;
}

/**
 * The output as the row shows it: the call's content, a subagent's without its wrapper, or the
 * answers a question was given. Null when the call recorded none.
 */
function previewOf(
  tool: OpenCodeTool,
  kind: ToolKind,
  questions: ChatQuestion[],
): ChatToolPreview | null {
  const answers = questions.flatMap((question) =>
    question.answer === null ? [] : [question.answer],
  );
  if (tool.status === 'completed' && answers.length > 0) {
    return capPreview(`Answered: ${answers.join('; ')}`);
  }
  if (tool.output === null) {
    // A call that failed records its error, and may record nothing else.
    if (tool.status !== 'error' || tool.error?.type === 'aborted' || tool.error?.message == null) {
      return null;
    }
    return capPreview(tool.error.message);
  }
  let text = tool.output;
  const isCut = (tool.outputLength ?? 0) > Array.from(text).length;
  if (kind === 'agent') text = subagentResult(text);
  if (tool.metadata?.truncated === true && !isCut) {
    text += (text === '' || text.endsWith('\n') ? '' : '\n') + SHORTENED_NOTE;
  }
  const preview = capPreview(text);
  if (isCut) preview.isTruncated = true;
  return preview;
}

function fileChangesOf(tool: OpenCodeTool): ChatFileChanges | null {
  if (tool.status !== 'completed') return null;
  return openCodeFileChanges(tool.metadata, pathOf(tool));
}

/** The Host file a read showed, when it is an image the row previews. */
function imagePathOf(tool: OpenCodeTool): string | null {
  const path = pathOf(tool);
  if (path === null || !isAbsoluteHostPath(path)) return null;
  const dot = path.lastIndexOf('.');
  if (dot < 0) return null;
  return IMAGE_EXTENSIONS.has(path.slice(dot + 1).toLowerCase()) ? path : null;
}

/** The row for `tool` as its step recorded it, its output read again from `output`. */
export function openCodeToolActivity(
  tool: OpenCodeTool,
  output: ChatOutputReference,
): ChatToolActivity {
  const kind = toolKindOf(tool.name);
  const status = toolStatusOf(tool);
  const questions = questionsOf(tool);
  const label = labelOf(tool, kind);
  const activity = toolActivity({
    kind,
    name: tool.name,
    title: prefix500(label.title),
    subtitle: label.subtitle,
    purpose: purposeOf(tool, kind, label.title),
    status,
    exitCode: status === 'failed' ? (tool.metadata?.exit ?? null) : null,
    questions,
    callID: tool.callID,
    preview: previewOf(tool, kind, questions),
    output,
  });
  if (kind === 'fileRead' && status === 'succeeded') activity.imagePath = imagePathOf(tool);
  const changes = fileChangesOf(tool);
  if (changes) {
    activity.fileChanges = changes;
    activity.diff = {
      added: changes.files.reduce((sum, file) => sum + file.added, 0),
      removed: changes.files.reduce((sum, file) => sum + file.removed, 0),
      files: changes.files.length + changes.moreFiles,
    };
    // A patch names its files only in its text; the changes name them as the row lists them.
    if (pathOf(tool) === null && changes.files.length > 0) {
      const names = changes.files.map((file) => relativeToDirectory(file.path, changes.directory));
      activity.title = prefix500(names.join(', '));
    }
  }
  return activity;
}

/** `tool`'s output, decoded again for an expanded row. */
export function openCodeToolOutput(tool: OpenCodeTool): ChatToolOutput {
  const kind = toolKindOf(tool.name);
  return {
    type: 'preview',
    preview: previewOf(tool, kind, questionsOf(tool)),
    fileChanges: fileChangesOf(tool),
  };
}
