// A Hermes Agent tool call as a Chat tool row. Its calls are OpenAI-shaped; only the names below say
// more than `other`, and a call's arguments may arrive cut, so they are read for a title at best.

import { toolActivity } from '../model/factories';
import { capPreview } from '../model/preview';
import { asInt, asObject, asString, type ChatToolOutput, type JsonObject } from '../model/reducer';
import type { ChatToolActivity, ChatToolPreview, ToolKind } from '../model/types';
import { isCut } from '../store/text';
import type { HermesRow, HermesToolCall } from './record';

const KINDS: Readonly<Record<string, ToolKind>> = {
  terminal: 'command',
  execute_code: 'command',
  read_file: 'fileRead',
  write_file: 'fileWrite',
  patch: 'fileEdit',
  search_files: 'search',
  web_search: 'web',
  web_extract: 'web',
  x_search: 'web',
  delegate_task: 'agent',
  todo: 'todo',
  todo_list: 'todo',
  vision_analyze: 'image',
  image_generate: 'image',
};

function kindOf(name: string): ToolKind {
  if (name.startsWith('browser_')) return 'web';
  if (name.startsWith('mcp_')) return 'mcp';
  return KINDS[name] ?? 'other';
}

/** The arguments that name what a call acts on, most telling first. */
const TITLE_ARGUMENTS = ['command', 'path', 'file_path', 'query', 'pattern', 'url', 'goal'];

function jsonObjectOf(text: string): JsonObject | null {
  if (!text.trimStart().startsWith('{')) return null;
  try {
    return asObject(JSON.parse(text));
  } catch {
    return null;
  }
}

function titleOf(call: HermesToolCall): string {
  const args = jsonObjectOf(call.arguments);
  for (const key of TITLE_ARGUMENTS) {
    const value = asString(args?.[key]);
    if (value) return value.slice(0, 500);
  }
  return call.name;
}

export function hermesToolActivity(call: HermesToolCall): ChatToolActivity {
  return toolActivity({
    kind: kindOf(call.name),
    name: call.name,
    title: titleOf(call),
    status: 'running',
    callID: call.id,
  });
}

function previewOf(row: HermesRow): ChatToolPreview {
  const preview = capPreview(row.text, row.imageCount);
  return isCut(row.text, row.length) ? { ...preview, isTruncated: true } : preview;
}

/** Fills `tool` in from its result row, whose line is `length` bytes long. */
export function applyHermesResult(tool: ChatToolActivity, row: HermesRow, length: number): void {
  const result = jsonObjectOf(row.text);
  const exitCode = asInt(result?.exit_code);
  const failed = (exitCode !== null && exitCode !== 0) || Boolean(asString(result?.error));
  tool.status = failed ? 'failed' : 'succeeded';
  tool.exitCode = failed ? exitCode : null;
  tool.preview = previewOf(row);
  tool.output = { path: null, offset: Math.max(row.seq, 0), length };
}

/** A tool's result, decoded again for an expanded row. */
export function hermesToolOutput(row: HermesRow): ChatToolOutput {
  return { type: 'preview', preview: previewOf(row), fileChanges: null };
}
