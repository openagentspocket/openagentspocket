// Titles, kinds and outcomes for Codex tool rows, matching what the Codex TUI shows so a Blocked
// card's screen text and the row agree (Swift CodexToolSummary).

import { capPreview } from '../model/preview';
import { asInt, asObject, asString } from '../model/reducer';
import type { ChatDiffStats, ChatToolPreview, ToolKind } from '../model/types';
import type { RawFileChange, RawMcpResult, RawParsedCommand, RawWebAction } from './raw';

// MARK: Commands

export { commandTitle, shellJoin, shellQuote, shellScript } from './shell-quote';

/** The row kind `parsed_cmd` implies, and a subtitle naming what was read, listed or searched. */
export function commandKind(parsed: RawParsedCommand[]): {
  kind: ToolKind;
  subtitle: string | null;
} {
  if (parsed.length === 0) return { kind: 'command', subtitle: null };
  const types = parsed.map((p) => p.type ?? 'unknown');
  const joined = (values: (string | null)[]): string | null => {
    const kept = values.filter((v): v is string => v !== null);
    return kept.length === 0 ? null : kept.join(', ');
  };
  if (types.every((t) => t === 'read')) {
    return { kind: 'fileRead', subtitle: joined(parsed.map((p) => p.name ?? p.path)) };
  }
  if (types.every((t) => t === 'list_files')) {
    return { kind: 'listing', subtitle: joined(parsed.map((p) => p.path)) };
  }
  if (types.every((t) => ['read', 'list_files', 'search'].includes(t))) {
    return {
      kind: 'search',
      subtitle: joined(parsed.map((p) => (p.type === 'search' ? (p.query ?? p.path) : null))),
    };
  }
  return { kind: 'command', subtitle: null };
}

// MARK: Files

/** `path` relative to the session's working directory when it lies inside it. */
export function relativePath(path: string, cwd: string | null): string {
  if (!cwd) return path;
  let base = cwd;
  while (base.length > 1 && (base.endsWith('/') || base.endsWith('\\'))) base = base.slice(0, -1);
  for (const separator of ['/', '\\']) {
    if (path.startsWith(base + separator)) {
      const rest = path.slice(base.length + 1);
      if (rest !== '') return rest;
    }
  }
  return path;
}

export interface FileChangeSummary {
  title: string;
  kind: ToolKind;
  diff: ChatDiffStats;
}

/** Lines in a file's content: a trailing newline does not start another. */
export function lineCount(content: string): number {
  if (content === '') return 0;
  const newlines = content.split('\n').length - 1;
  return content.endsWith('\n') ? newlines : newlines + 1;
}

/** `+` and `-` lines of a unified diff, excluding its file headers. */
export function diffLineCounts(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added += 1;
    else if (line.startsWith('-') && !line.startsWith('---')) removed += 1;
  }
  return { added, removed };
}

function sortedKeys(object: object): string[] {
  // Swift sorts Strings by unicode scalar value; JS default compares UTF-16 units.
  return Object.keys(object).sort((a, b) => {
    const left = [...a].map((c) => c.codePointAt(0) as number);
    const right = [...b].map((c) => c.codePointAt(0) as number);
    for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
      if (left[i] !== right[i]) return (left[i] as number) - (right[i] as number);
    }
    return left.length - right.length;
  });
}

/** Title, kind and line counts for a `FileChange` item's or `patch_apply_end`'s `changes`. */
export function fileChangeSummary(
  changes: Record<string, RawFileChange>,
  cwd: string | null,
): FileChangeSummary {
  const paths = sortedKeys(changes);
  let added = 0;
  let removed = 0;
  let onlyAdds = paths.length > 0;
  const titles: string[] = [];
  for (const path of paths) {
    const change = changes[path];
    if (!change) continue;
    if (change.type === 'add') {
      added += lineCount(change.content ?? '');
    } else if (change.type === 'delete') {
      removed += lineCount(change.content ?? '');
      onlyAdds = false;
    } else {
      const counts = diffLineCounts(change.unifiedDiff ?? '');
      added += counts.added;
      removed += counts.removed;
      onlyAdds = false;
    }
    let title = relativePath(path, cwd);
    if (change.movePath !== null) title += ` → ${relativePath(change.movePath, cwd)}`;
    titles.push(title);
  }
  return {
    title: titles.join(', '),
    kind: onlyAdds ? 'fileWrite' : 'fileEdit',
    diff: { added, removed, files: paths.length },
  };
}

function trimmedPrefix(line: string, prefix: string): string | null {
  return line.startsWith(prefix) ? line.slice(prefix.length).replace(/^[ \t]+|[ \t]+$/g, '') : null;
}

/** The same summary from an `apply_patch` call's patch text. */
export function patchSummary(patch: string, cwd: string | null): FileChangeSummary | null {
  const titles: string[] = [];
  let added = 0;
  let removed = 0;
  let onlyAdds = true;
  for (const line of patch.split('\n')) {
    const added_ = trimmedPrefix(line, '*** Add File: ');
    const updated = trimmedPrefix(line, '*** Update File: ');
    const deleted = trimmedPrefix(line, '*** Delete File: ');
    const moved = trimmedPrefix(line, '*** Move to: ');
    if (added_ !== null) {
      titles.push(relativePath(added_, cwd));
    } else if (updated !== null) {
      titles.push(relativePath(updated, cwd));
      onlyAdds = false;
    } else if (deleted !== null) {
      titles.push(relativePath(deleted, cwd));
      onlyAdds = false;
    } else if (moved !== null && titles.length > 0) {
      const last = titles.pop() as string;
      titles.push(`${last} → ${relativePath(moved, cwd)}`);
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      added += 1;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removed += 1;
    }
  }
  if (titles.length === 0) return null;
  return {
    title: titles.join(', '),
    kind: onlyAdds ? 'fileWrite' : 'fileEdit',
    diff: { added, removed, files: titles.length },
  };
}

/** The string literals a code-mode script passes to `call`, unescaped; non-literals give nothing. */
export function codeModePatches(script: string, call: string): string[] {
  const patches: string[] = [];
  let rest = script;
  for (;;) {
    const found = rest.indexOf(call);
    if (found < 0) break;
    rest = rest.slice(found + call.length).replace(/^\s+/, '');
    const quote = rest[0];
    if (quote !== '"' && quote !== "'" && quote !== '`') continue;
    let literal = '';
    let index = 1;
    let closed = false;
    while (index < rest.length) {
      const char = rest[index] as string;
      index += 1;
      if (char === quote) {
        closed = true;
        break;
      }
      if (char !== '\\' || index >= rest.length) {
        literal += char;
        continue;
      }
      const escaped = rest[index] as string;
      index += 1;
      if (escaped === 'n') literal += '\n';
      else if (escaped === 't') literal += '\t';
      else if (escaped === 'r') literal += '\r';
      else if (escaped === 'u') {
        const hex = rest.slice(index, index + 4);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          literal += String.fromCharCode(Number.parseInt(hex, 16));
          index += 4;
        } else {
          literal += escaped;
        }
      } else literal += escaped;
    }
    rest = rest.slice(index);
    if (closed) patches.push(literal);
  }
  return patches;
}

// MARK: Questions

/** An answer as the TUI shows it: the `user_note: ` key is dropped from note lines. */
export function displayAnswer(answer: string): string {
  const prefix = 'user_note: ';
  return answer
    .split('\n')
    .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line))
    .join('\n');
}

// MARK: Outputs

function integerOf(text: string): number | null {
  return /^[+-]?\d+$/.test(text) ? Number.parseInt(text, 10) : null;
}

/** The exit code a legacy tool output records, and the output without its header. */
export function legacyOutput(text: string): { exitCode: number | null; body: string } {
  if (text.startsWith('{')) {
    try {
      const parsed = asObject(JSON.parse(text));
      const output = parsed ? asString(parsed.output) : null;
      if (parsed && output !== null) {
        return { exitCode: asInt(asObject(parsed.metadata)?.exit_code), body: output };
      }
    } catch {
      // Not the 0.45 JSON shape; try the headers.
    }
  }
  const lines = text.split('\n');
  let exitCode: number | null = null;
  let sawHeader = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as string;
    const exit =
      trimmedPrefix(line, 'Exit code: ') ?? trimmedPrefix(line, 'Process exited with code ');
    const code = exit === null ? null : integerOf(exit);
    if (code !== null) {
      exitCode = code;
      sawHeader = true;
    } else if (
      line.startsWith('Wall time: ') ||
      line.startsWith('Chunk ID: ') ||
      line.startsWith('Total output lines: ') ||
      line.startsWith('Original token count: ') ||
      line.startsWith('Process running with session ID ')
    ) {
      sawHeader = true;
    } else if (line === 'Output:' && sawHeader) {
      return { exitCode, body: lines.slice(index + 1).join('\n') };
    } else {
      break;
    }
  }
  return { exitCode, body: text };
}

/** A preview of `text`, or null when there is nothing to show. */
export function preview(text: string | null, imageCount = 0): ChatToolPreview | null {
  if (text === null || (text === '' && imageCount === 0)) return null;
  return capPreview(text, imageCount);
}

/** An MCP result's text blocks, joined, with its images counted. */
export function mcpPreview(
  result: RawMcpResult | null,
  error: string | null,
): ChatToolPreview | null {
  if (error) return preview(error);
  if (!result) return null;
  const text = result.content
    .map((part) => (part.type === 'text' ? part.text : null))
    .filter((t): t is string => t !== null)
    .join('\n');
  return preview(text, result.content.filter((p) => p.type === 'image').length);
}

/** A turn error's readable message: an API error's JSON body shows its message. */
export function errorDisplay(text: string): string {
  const json = text.trim();
  if (!json.startsWith('{')) return text;
  try {
    const body = asObject(JSON.parse(json));
    const message = asString(asObject(body?.error)?.message) ?? asString(body?.message);
    return message ? message : text;
  } catch {
    return text;
  }
}

/** A web search's title from its query or action. */
export function webSearchTitle(query: string | null, action: RawWebAction | null): string {
  if (query) return query;
  switch (action?.type) {
    case 'search': {
      const queries = action.queries ?? [];
      return action.query ?? (queries.length === 0 ? 'Web search' : queries.join(', '));
    }
    case 'open_page':
    case 'openPage':
      return action.url ?? 'Open page';
    case 'find_in_page':
    case 'findInPage':
      return [action.pattern, action.url].filter((v): v is string => v !== null).join(' in ');
    default:
      return 'Web search';
  }
}
