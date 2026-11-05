// Grok Build's names for its tools, and the row kind each one reads as (Swift GrokToolCall tables).

import type { ToolKind } from '../model/types';

export const KINDS: Record<string, ToolKind> = {
  run_terminal_command: 'command',
  read_file: 'fileRead',
  grep: 'search',
  search_tool: 'search',
  search_replace: 'fileEdit',
  write: 'fileWrite',
  list_dir: 'listing',
  todo_write: 'todo',
  spawn_subagent: 'agent',
  ask_user_question: 'question',
  web_fetch: 'web',
  web_search: 'web',
  x_search: 'web',
  use_tool: 'mcp',
  get_command_or_subagent_output: 'other',
  kill_command_or_subagent: 'other',
  monitor: 'other',
};

/** Grok's own kinds, then the ACP kinds. */
export const KINDS_BY_GROK_KIND: Record<string, ToolKind> = {
  execute: 'command',
  read: 'fileRead',
  edit: 'fileEdit',
  write: 'fileWrite',
  search: 'search',
  list: 'listing',
  fetch: 'web',
  task: 'agent',
  ask_user: 'question',
  plan: 'todo',
  use_tool: 'mcp',
};

export const VARIANT_NAMES: Record<string, string> = {
  Bash: 'run_terminal_command',
  ReadFile: 'read_file',
  Grep: 'grep',
  SearchReplace: 'search_replace',
  Write: 'write',
  ListDir: 'list_dir',
  TodoWrite: 'todo_write',
  Task: 'spawn_subagent',
  AskUserQuestion: 'ask_user_question',
  WebFetch: 'web_fetch',
  WebSearch: 'web_search',
  XSearch: 'x_search',
  UseTool: 'use_tool',
};

export const OUTPUT_NAMES: Record<string, string> = {
  Bash: 'run_terminal_command',
  ReadFile: 'read_file',
  ListDir: 'list_dir',
  Todo: 'todo_write',
  SubagentCompleted: 'spawn_subagent',
  AskUserQuestion: 'ask_user_question',
  MCP: 'use_tool',
};
