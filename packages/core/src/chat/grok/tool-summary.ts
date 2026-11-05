// How a Grok Build tool call reads as a row (Swift GrokToolSummary) and the helpers its row uses:
// the diff as shown, a subagent's stats, durations, and a question's answer in Grok's list.

import { capPreview, relativeToDirectory } from '../model/preview';
import type { ChatFileChanges, ChatToolPreview, ToolKind } from '../model/types';
import type { GrokToolCall } from './tool-call';
import type { SubagentFinished } from './update-record';

/** The titles Grok gives a search its server runs. */
export const SEARCH_TITLE_PREFIXES = ['Web search:', 'X search:'];

export const cappedText = (text: string): ChatToolPreview => capPreview(text);

/** `changes` as a row lists them: paths relative to `directory`, and a write over an existing file as written. */
export function shownChanges(
  changes: ChatFileChanges,
  kind: ToolKind,
  directory: string | null,
): ChatFileChanges {
  return {
    ...changes,
    directory,
    files:
      kind === 'fileWrite'
        ? changes.files.map((file) =>
            file.kind === 'updated' ? { ...file, kind: 'written' as const } : file,
          )
        : changes.files,
  };
}

/** A finished subagent's work: `2 tool calls · 1 turn · 7s`. */
export function subagentStats(end: SubagentFinished): string | null {
  const parts: string[] = [];
  if (end.toolCalls !== null)
    parts.push(`${end.toolCalls} tool ${end.toolCalls === 1 ? 'call' : 'calls'}`);
  if (end.turns !== null) parts.push(`${end.turns} ${end.turns === 1 ? 'turn' : 'turns'}`);
  if (end.durationMilliseconds !== null) parts.push(duration(end.durationMilliseconds));
  return parts.length === 0 ? null : parts.join(' · ');
}

/** `38s`, `2m 18s` or `1h 5m`, rounded down. */
export function duration(milliseconds: number): string {
  const seconds = Math.floor(Math.max(milliseconds, 0) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    return seconds % 60 === 0
      ? `${seconds / 60}m`
      : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }
  const minutes = Math.floor(seconds / 60) % 60;
  return minutes === 0
    ? `${Math.floor(seconds / 3600)}h`
    : `${Math.floor(seconds / 3600)}h ${minutes}m`;
}

/**
 * The answer to `question` in Grok's `"<question>"="<answer>", …` list. The next question's pair
 * ends it, and the preview the user selected or their notes, which Grok adds after it, are left out.
 */
export function answerTo(
  question: string,
  answers: string,
  among: readonly string[],
): string | null {
  const key = `"${question}"="`;
  const start = answers.indexOf(key);
  if (start < 0) return null;
  let answer = answers.slice(start + key.length);
  for (const other of among) {
    if (other === question) continue;
    const next = answer.indexOf(`, "${other}"="`);
    if (next >= 0) answer = answer.slice(0, next);
  }
  for (const annotation of [' selected preview:', ' user notes:']) {
    const at = answer.indexOf(annotation);
    if (at >= 0) answer = answer.slice(0, at);
  }
  return answer.endsWith('"') ? answer.slice(0, -1) : answer;
}

interface Summary {
  kind: ToolKind;
  title: string;
  subtitle: string | null;
}

/** What a server-side search looked for: its title after `Web search:` or `X search:`, without quotes. */
function searched(title: string | null): string | null {
  if (title === null) return null;
  for (const prefix of SEARCH_TITLE_PREFIXES) {
    if (title.startsWith(prefix)) {
      return title
        .slice(prefix.length)
        .replace(/^[ \t]+|[ \t]+$/g, '')
        .replace(/^["'`]+|["'`]+$/g, '');
    }
  }
  return null;
}

/** `<server>.<tool>` for an MCP call, from its input's `<server>__<tool>` or its result. */
function mcpTool(call: GrokToolCall): string | null {
  const name = call.input?.toolName;
  if (name != null && name !== '') {
    const separator = name.indexOf('__');
    return separator < 0 ? name : `${name.slice(0, separator)}.${name.slice(separator + 2)}`;
  }
  const server = call.output?.server;
  const tool = call.output?.tool;
  return server != null && tool != null ? `${server}.${tool}` : null;
}

/** The input update's readable title, else the call's when it is more than the tool's name, else the tool's label or name. */
function fallbackTitle(call: GrokToolCall): string {
  if (call.inputTitle !== null && call.inputTitle !== '') return call.inputTitle;
  if (call.callTitle !== null && call.callTitle !== '' && call.callTitle !== call.name) {
    return call.callTitle;
  }
  return call.label ?? call.toolName;
}

/** Paths read relative to `directory`, the session's directory. */
export function toolSummary(call: GrokToolCall, directory: string | null): Summary {
  const input = call.input;
  const kind = call.rowKind;
  const shown = (path: string | null | undefined) =>
    path == null ? null : relativeToDirectory(path, directory);
  let subtitle: string | null = null;
  let title: string | null;
  switch (kind) {
    case 'command':
      title = input?.command ?? call.output?.command ?? call.taskEnd?.command ?? null;
      subtitle = input?.description ?? null;
      break;
    case 'fileRead':
      title = shown(call.location ?? input?.filePath ?? input?.path);
      break;
    case 'fileEdit':
    case 'fileWrite':
      title = shown(input?.filePath ?? call.location ?? call.output?.path);
      break;
    case 'listing':
      title = shown(input?.path ?? call.location);
      break;
    case 'search':
      title = input?.pattern ?? input?.query ?? null;
      break;
    case 'web':
      title = input?.url ?? input?.query ?? searched(call.callTitle ?? call.inputTitle);
      break;
    case 'mcp':
      title = mcpTool(call);
      break;
    case 'agent':
      title = input?.description ?? call.subagentDescription;
      subtitle = call.subagentType ?? input?.subagentType ?? null;
      break;
    case 'question': {
      const texts = input?.questions.map((question) => question.text) ?? [];
      title = texts.length === 0 ? null : texts.join(' · ');
      break;
    }
    case 'todo':
      title = 'Update todos';
      break;
    default:
      title = null;
  }
  const shownTitle = title !== null && title !== '' ? title : fallbackTitle(call);
  return {
    kind,
    title: shownTitle,
    subtitle: subtitle === null || subtitle === '' || subtitle === shownTitle ? null : subtitle,
  };
}
