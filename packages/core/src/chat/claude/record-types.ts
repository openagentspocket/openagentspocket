// Decoded Claude Code transcript records (Swift ClaudeTranscriptRecord).

import type {
  ChatCommandInvocation,
  ChatDiffStats,
  ChatFileChanges,
  ChatQuestion,
  ChatToolPreview,
} from '../model/types';

export type ClaudeRecordKind =
  | { type: 'user' }
  | { type: 'assistant' }
  | { type: 'system'; subtype: string }
  | { type: 'attachment'; subtype: string }
  | { type: 'progress' }
  | { type: 'unknown'; name: string };

export interface ClaudeTodo {
  content: string;
  status: string | null;
}

export interface ClaudeToolInput {
  command: string | null;
  description: string | null;
  filePath: string | null;
  path: string | null;
  pattern: string | null;
  url: string | null;
  query: string | null;
  prompt: string | null;
  subagentType: string | null;
  plan: string | null;
  planFilePath: string | null;
  questions: ChatQuestion[];
  todos: ClaudeTodo[] | null;
  skill: string | null;
  arguments: string | null;
  teammateName: string | null;
  subject: string | null;
  taskID: string | null;
  status: string | null;
  planContent: string | null;
}

export interface ClaudeToolUse {
  id: string;
  name: string;
  input: ClaudeToolInput;
}

export interface ClaudeToolResult {
  toolUseID: string;
  isError: boolean;
  content: ChatToolPreview;
}

export type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'redactedThinking' }
  | { type: 'toolUse'; use: ClaudeToolUse }
  | { type: 'toolResult'; result: ClaudeToolResult }
  | { type: 'image' }
  | { type: 'fallback'; from: string | null; to: string | null }
  | { type: 'other'; name: string };

export interface ClaudeToolUseResult {
  commandOutput: ChatToolPreview | null;
  isInterrupted: boolean;
  backgroundTaskID: string | null;
  persistedOutputPath: string | null;
  type: string | null;
  filePath: string | null;
  diff: ChatDiffStats | null;
  fileChanges: ChatFileChanges | null;
  status: string | null;
  agentID: string | null;
  /** A `SendMessage` that continued an ended Subagent names it here. */
  resumedAgentID: string | null;
  teammateName: string | null;
  taskID: string | null;
  taskType: string | null;
  workflowName: string | null;
  runID: string | null;
  workflowSummary: string | null;
  agentReport: ChatToolPreview | null;
  answers: Record<string, string>;
  plan: string | null;
  todos: ClaudeTodo[] | null;
}

export interface ClaudeToolResultDetails {
  denialKind: string | null;
  userFeedback: string | null;
  isDenialUnanswered: boolean;
  result: ClaudeToolUseResult | null;
}

export interface ClaudeCompaction {
  trigger: string | null;
  preTokens: number | null;
  preservedSegment: { headUUID: string; anchorUUID: string; tailUUID: string } | null;
  preservedMessages: { anchorUUID: string; uuids: string[] } | null;
}

export interface ClaudeSystemDetails {
  content: string | null;
  logicalParentUUID: string | null;
  compaction: ClaudeCompaction | null;
  retractedMessageUUIDs: string[];
  originalModel: string | null;
  fallbackModel: string | null;
  commandRun: ChatCommandInvocation | null;
}

export interface ClaudeQueuedCommand {
  text: string;
  imageCount: number;
  sourceUUID: string | null;
  commandMode: string | null;
  originKind: string | null;
  isMeta: boolean;
}

export interface ClaudeAttachmentDetails {
  queuedCommand: ClaudeQueuedCommand | null;
  planFilePath: string | null;
}

export interface ClaudeRecord {
  uuid: string;
  parentUUID: string | null;
  kind: ClaudeRecordKind;
  byteOffset: number;
  byteLength: number;
  isSidechain: boolean;
  isMeta: boolean;
  teamName: string | null;
  agentID: string | null;
  sessionID: string | null;
  timestamp: string | null;
  blocks: ClaudeContentBlock[];
  messageID: string | null;
  apiBlockIndex: number | null;
  thinkingDurationMilliseconds: number | null;
  isAPIError: boolean;
  promptSource: string | null;
  originKind: string | null;
  sourceToolUseID: string | null;
  isCompactSummary: boolean;
  interruptedMessageID: string | null;
  toolResult: ClaudeToolResultDetails | null;
  cwd: string | null;
  contextSample: { promptTokens: number; model: string | null } | null;
  system: ClaudeSystemDetails | null;
  attachment: ClaudeAttachmentDetails | null;
}

export type ClaudeMetadata =
  | { type: 'customTitle'; value: string }
  | { type: 'aiTitle'; value: string }
  | { type: 'summary'; value: string }
  | { type: 'permissionMode'; value: string }
  | { type: 'relocated'; value: string }
  | { type: 'continuedIn'; value: string }
  | { type: 'queueOperation'; operation: string; content: string | null; timestamp: string | null }
  | { type: 'other'; name: string };

export type ClaudeLine =
  | { type: 'record'; record: ClaudeRecord }
  | { type: 'metadata'; metadata: ClaudeMetadata }
  | { type: 'invalid' };

export function isUserOrAssistant(record: ClaudeRecord): boolean {
  return record.kind.type === 'user' || record.kind.type === 'assistant';
}

export function isSystem(record: ClaudeRecord, subtype: string): boolean {
  return record.kind.type === 'system' && record.kind.subtype === subtype;
}

export function isAttachment(record: ClaudeRecord, subtype: string): boolean {
  return record.kind.type === 'attachment' && record.kind.subtype === subtype;
}

export function toolResultsOf(record: ClaudeRecord): ClaudeToolResult[] {
  const out: ClaudeToolResult[] = [];
  for (const block of record.blocks) if (block.type === 'toolResult') out.push(block.result);
  return out;
}

export function toolUsesOf(record: ClaudeRecord): ClaudeToolUse[] {
  const out: ClaudeToolUse[] = [];
  for (const block of record.blocks) if (block.type === 'toolUse') out.push(block.use);
  return out;
}

export function textsOf(record: ClaudeRecord): string[] {
  const out: string[] = [];
  for (const block of record.blocks) if (block.type === 'text') out.push(block.text);
  return out;
}

export function imageCountOf(record: ClaudeRecord): number {
  return record.blocks.filter((block) => block.type === 'image').length;
}
