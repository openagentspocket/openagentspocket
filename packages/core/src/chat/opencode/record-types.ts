// The shapes of the lines the OpenCode record source hands the reducer (Swift OpenCodeLine and its
// parts, ADR 0025): a `session_message` row cut to what Chat shows, the session's own row, or its
// inbox. `record.ts` reads them.

export interface OpenCodeSession {
  /** The id of the session this one is a subagent of. */
  parent: string | null;
  title: string | null;
  /** The OpenCode version that created the session; one imported from 1.x keeps its 1.x version. */
  version: string | null;
  /** The boundary message of a staged `/undo`. */
  revertMessage: string | null;
  /** The boundary message's `seq`; null when its row is gone. */
  revertSeq: number | null;
}

export interface OpenCodeInboxItem {
  /** The id the item's user row will carry. */
  id: string | null;
  type: string | null;
  /** `enqueued_seq`. */
  seq: number | null;
  /** The text's first 16 Ki characters. */
  text: string | null;
  /** The text's length in characters before the cut. */
  length: number | null;
  /** Attached files' names. */
  files: string[];
}

export interface OpenCodeInbox {
  items: OpenCodeInboxItem[];
}

export interface OpenCodeError {
  /** `aborted` for a call or step the user stopped or declined. */
  type: string | null;
  message: string | null;
}

export interface OpenCodeText {
  text: string;
  /** The text's length in characters before the cut. */
  length: number | null;
  /** When a reasoning block started and ended, in milliseconds. */
  started: number | null;
  completed: number | null;
}

export interface OpenCodeQuestion {
  question: string | null;
  header: string | null;
  options: { label: string | null; description: string | null }[];
  multiple: boolean | null;
}

/** The fields of a tool's input that a row names. */
export interface OpenCodeToolInput {
  filePath: string | null;
  path: string | null;
  command: string | null;
  pattern: string | null;
  url: string | null;
  query: string | null;
  description: string | null;
  agent: string | null;
  /** The older `task` tool's agent. */
  subagentType: string | null;
  patchText: string | null;
  /** The `skill` tool's skill. */
  id: string | null;
  questions: OpenCodeQuestion[];
  text: string | null;
}

export interface OpenCodeFileDiff {
  file: string | null;
  /** `added`, `deleted` or `modified`; older rows say `add`, `update`. */
  status: string | null;
  additions: number | null;
  deletions: number | null;
  /** A unified patch, cut at 64 Ki characters. */
  patch: string | null;
}

export interface OpenCodeToolMetadata {
  exit: number | null;
  /** OpenCode shortened the output itself. */
  truncated: boolean | null;
  /** `running` for a call that left its work running in the background. */
  status: string | null;
  /** The `skill` tool's skill name. */
  name: string | null;
  files: OpenCodeFileDiff[];
  /** The older single-file patch. */
  diff: string | null;
  filediff: OpenCodeFileDiff | null;
  /** A question tool's answers: each question's selected labels. */
  answers: string[][] | null;
}

export interface OpenCodeTool {
  callID: string | null;
  name: string;
  /** `streaming`, `running`, `completed` or `error`. */
  status: string | null;
  input: OpenCodeToolInput;
  error: OpenCodeError | null;
  metadata: OpenCodeToolMetadata | null;
  /** The output texts joined, cut to the source's output limit. */
  output: string | null;
  /** The joined output's length in characters before the cut. */
  outputLength: number | null;
}

export type OpenCodeItemKind =
  | { type: 'text'; text: OpenCodeText }
  | { type: 'reasoning'; text: OpenCodeText }
  | { type: 'tool'; tool: OpenCodeTool }
  | { type: 'other' };

export interface OpenCodeStep {
  /** A content item, by its index in the stored step. */
  items: { index: number; kind: OpenCodeItemKind }[];
  /** `stop`, `tool-calls`, `length`, `error`, `content-filter` or `unknown`. */
  finish: string | null;
  error: OpenCodeError | null;
  retry: { attempt: number | null; error: OpenCodeError | null } | null;
  /** When the step ended, in milliseconds. */
  completed: number | null;
}

export interface OpenCodeUserMessage {
  text: string | null;
  length: number | null;
  files: { name: string | null; mime: string | null }[];
}

export interface OpenCodeIdle {
  /** `succeeded`, `failed` or `interrupted`; null when the row was too large to keep. */
  outcome: string | null;
  error: OpenCodeError | null;
}

export interface OpenCodeCompaction {
  /** `running`, `completed` or `failed`. */
  status: string | null;
  /** `manual` for `/compact`, `auto` for one OpenCode started. */
  reason: string | null;
  summary: string | null;
  error: OpenCodeError | null;
}

/** A `synthetic`, `system` or `skill` row. */
export interface OpenCodeNote {
  text: string | null;
  description: string | null;
  /** Whether the row carries metadata at all. */
  hasMetadata: boolean;
  /** `subagent` or `shell` for a background completion. */
  source: string | null;
  jobID: string | null;
  /** `restart` for the note OpenCode adds when it resumes a turn. */
  notice: string | null;
  skill: string | null;
  name: string | null;
}

export interface OpenCodeShell {
  command: string | null;
  output: string | null;
}

export type OpenCodeRowContent =
  | { type: 'user'; message: OpenCodeUserMessage }
  | { type: 'assistant'; step: OpenCodeStep }
  | { type: 'idle'; idle: OpenCodeIdle }
  | { type: 'compaction'; compaction: OpenCodeCompaction }
  | { type: 'note'; note: OpenCodeNote }
  | { type: 'shell'; shell: OpenCodeShell }
  | { type: 'agentSwitched'; agent: string | null }
  | { type: 'modelSwitched'; model: string | null }
  | { type: 'locationSwitched'; directory: string | null }
  /** A type this reader does not know; the source keeps only its time. */
  | { type: 'unknown' }
  /** The stored data is not JSON (`{"k":"invalid"}`). */
  | { type: 'invalid' }
  /** The data was over the source's row limit: its size in bytes. */
  | { type: 'oversized'; size: number };

export interface OpenCodeRow {
  id: string;
  type: string;
  seq: number;
  /** `time_created` and `time_updated`, in milliseconds. */
  created: number | null;
  updated: number | null;
  /** False while the row can still change: an unfinished step, compaction or shell command. */
  isFinal: boolean;
  content: OpenCodeRowContent;
}

export type OpenCodeLine =
  | { kind: 'session'; session: OpenCodeSession }
  | { kind: 'inbox'; inbox: OpenCodeInbox }
  | { kind: 'row'; row: OpenCodeRow }
  /** Not one of the three: not JSON, or without the fields its kind needs. */
  | { kind: 'malformed' };
