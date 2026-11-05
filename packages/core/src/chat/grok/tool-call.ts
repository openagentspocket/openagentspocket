// How a Grok Build tool call reads as a row (Swift GrokToolSummary and GrokToolCall): its kind, and
// the command, path, pattern or question it names; one call merged from its records: the call, the
// input Grok holds back until it runs, the result, and the background task or subagent it started.

import { toolActivity } from '../model/factories';
import type {
  ChatAgentActivity,
  ChatFileChanges,
  ChatOutputReference,
  ChatPendingRequest,
  ChatQuestion,
  ChatToolActivity,
  ChatToolPreview,
  ToolKind,
  ToolStatus,
} from '../model/types';
import { KINDS, KINDS_BY_GROK_KIND, OUTPUT_NAMES, VARIANT_NAMES } from './tool-kinds';
import {
  type GrokInput,
  type GrokOutput,
  type GrokTodo,
  type GrokTool,
  mergeInput,
} from './tool-record';
import {
  answerTo,
  cappedText,
  SEARCH_TITLE_PREFIXES,
  shownChanges,
  subagentStats,
  toolSummary,
} from './tool-summary';
import type { SubagentFinished, TaskCompleted } from './update-record';
import { todoText } from './values';

/** How the turn a call belongs to ended; null while it is open. */
export type TurnEnd = 'completed' | 'cancelled' | 'rejected' | 'failed' | 'replaced';

/** One Grok Build tool call, merged from its records. */
export class GrokToolCall {
  name: string | null = null;
  toolKind: string | null = null;
  label: string | null = null;
  kind: string | null = null;
  /** The call's `title`: the tool's name, or for a command typed in Grok's shell mode a readable title. */
  callTitle: string | null = null;
  /** The input update's readable title: ``Execute `ls` ``. */
  inputTitle: string | null = null;
  location: string | null = null;
  input: GrokInput | null = null;
  /** An input update came, or the call said it runs: it no longer waits for approval. */
  hasStarted = false;
  /** The result's `status`. */
  status: string | null = null;
  notRun: string | null = null;
  output: GrokOutput | null = null;
  outputLine: ChatOutputReference | null = null;
  /** The result's line was longer than the reader keeps. */
  outputIsTruncated = false;
  resultChanges: ChatFileChanges | null = null;
  inputChanges: ChatFileChanges | null = null;
  /** Grok moved the call's command to the background. */
  sentToBackground = false;
  subagentID: string | null = null;
  subagentType: string | null = null;
  subagentDescription: string | null = null;
  subagentEnd: SubagentFinished | null = null;
  subagentEndLine: ChatOutputReference | null = null;
  taskEnd: TaskCompleted | null = null;
  taskEndLine: ChatOutputReference | null = null;

  constructor(
    readonly id: string,
    readonly entryID: string,
    /** The turn the call was first seen in, as the reducer counts them. */
    readonly turn: number,
  ) {}

  /** Adds one record of the call, read from `line`. */
  merge(tool: GrokTool, isCall: boolean, line: ChatOutputReference, isTruncated: boolean): void {
    this.name = tool.name ?? this.name;
    this.toolKind = tool.toolKind ?? this.toolKind;
    this.label = tool.label ?? this.label;
    this.kind = tool.kind ?? this.kind;
    this.location = tool.location ?? this.location;
    if (tool.input !== null) {
      this.input = this.input === null ? tool.input : mergeInput(this.input, tool.input);
    }
    if (tool.status === 'in_progress' || (!isCall && tool.output === null)) this.hasStarted = true;
    // A result's title is Grok's label for its output, which rows leave out.
    if (isCall) this.callTitle = tool.title ?? this.callTitle;
    else if (tool.output === null) this.inputTitle = tool.title ?? this.inputTitle;
    if (tool.output === null) {
      this.inputChanges = tool.fileChanges ?? this.inputChanges;
      return;
    }
    this.output = tool.output;
    this.status = tool.status;
    this.notRun = tool.notRun;
    this.outputLine = line;
    this.outputIsTruncated = isTruncated;
    this.resultChanges = tool.fileChanges ?? this.resultChanges;
    if (tool.output.isBackgrounded || tool.output.type === 'BackgroundTaskStarted') {
      this.sentToBackground = true;
    }
  }

  /**
   * Grok's name for the tool. A record without `_meta["x.ai/tool"]` names it by its input's
   * variant, its result's type, or a call title that is a tool name.
   */
  get toolName(): string {
    if (this.name !== null) return this.name;
    const variant = this.input?.variant;
    if (variant != null && VARIANT_NAMES[variant] !== undefined) return VARIANT_NAMES[variant];
    const type = this.output?.type;
    if (type != null && OUTPUT_NAMES[type] !== undefined) return OUTPUT_NAMES[type];
    if (this.callTitle !== null && /^[a-z0-9_]+$/.test(this.callTitle)) return this.callTitle;
    return 'tool';
  }

  get isSpawn(): boolean {
    return (
      this.toolName === 'spawn_subagent' ||
      this.toolKind === 'task' ||
      this.input?.variant === 'Task'
    );
  }

  get rowKind(): ToolKind {
    // A command typed in Grok's shell mode.
    if (this.id.startsWith('bash-mode-')) return 'command';
    const byName = KINDS[this.toolName];
    if (byName !== undefined) return byName;
    const title = this.callTitle ?? this.inputTitle;
    if (title !== null && SEARCH_TITLE_PREFIXES.some((prefix) => title.startsWith(prefix))) {
      return 'web';
    }
    const byGrok =
      (this.toolKind === null ? undefined : KINDS_BY_GROK_KIND[this.toolKind]) ??
      (this.kind === null ? undefined : KINDS_BY_GROK_KIND[this.kind]);
    return byGrok ?? 'other';
  }

  /**
   * The row's status and the note under it. `turnEnd` is how the call's turn ended; while it is
   * open, a call without a result follows what herdr reports.
   */
  outcome(
    turnEnd: TurnEnd | null,
    activity: ChatAgentActivity,
  ): { status: ToolStatus; note: string | null } {
    if (this.notRun !== null) {
      switch (this.notRun) {
        case 'rejected':
          return {
            status: 'declined',
            note: turnEnd === 'rejected' ? 'Rejecting ended the turn' : null,
          };
        case 'cancelled':
          return { status: 'interrupted', note: null };
        default:
          return { status: 'notCompleted', note: null };
      }
    }
    if (this.subagentEnd !== null) {
      const end = this.subagentEnd;
      const status: ToolStatus =
        end.status === 'completed'
          ? 'succeeded'
          : end.status === 'cancelled'
            ? 'interrupted'
            : end.status === 'failed'
              ? 'failed'
              : 'notCompleted';
      return { status, note: end.error ?? subagentStats(end) };
    }
    if (this.taskEnd !== null) {
      const end = this.taskEnd;
      if (end.wasKilled || end.signal !== null) {
        return { status: 'interrupted', note: 'Stopped in the background' };
      }
      return {
        status: (end.exitCode ?? 0) === 0 ? 'succeeded' : 'failed',
        note: 'Finished in the background',
      };
    }
    if (this.status === 'failed') return { status: 'failed', note: null };
    if (
      this.sentToBackground ||
      (this.isSpawn && this.input?.isBackground === true && this.output !== null)
    ) {
      return { status: 'started', note: 'Sent to the background' };
    }
    if (this.output !== null) {
      const code = this.output.exitCode;
      if (code !== null && code !== 0) return { status: 'failed', note: null };
      return { status: 'succeeded', note: this.output.isUnanswered ? 'Not answered' : null };
    }
    switch (turnEnd) {
      case null:
        switch (activity) {
          // Until the user approves it, Grok has written only the call. An approved spawn can show
          // nothing more for as long as its subagent runs, except the `subagent_spawned` Grok
          // writes as it starts, also while the Agent waits on the next card.
          case 'blocked':
            return {
              status: this.hasStarted || this.subagentID !== null ? 'running' : 'awaitingApproval',
              note: null,
            };
          case 'working':
          case 'unknown':
            return { status: 'running', note: null };
          case 'idle':
            return { status: 'notCompleted', note: null };
        }
        break;
      case 'cancelled':
      case 'rejected':
        return { status: 'interrupted', note: null };
      case 'completed':
        return { status: 'noResult', note: null };
      case 'failed':
      case 'replaced':
        return { status: 'notCompleted', note: null };
    }
    return { status: 'notCompleted', note: null };
  }

  /** The call's row. Paths read relative to `directory`. */
  activity(
    directory: string | null,
    turnEnd: TurnEnd | null,
    agent: ChatAgentActivity,
  ): ChatToolActivity {
    const summary = toolSummary(this, directory);
    const { status, note } = this.outcome(turnEnd, agent);
    let questions: ChatQuestion[] = this.input?.questions ?? [];
    const answers = this.output?.answers ?? null;
    if (answers !== null) {
      const texts = questions.map((question) => question.text);
      questions = questions.map((question) => ({
        ...question,
        answer: answerTo(question.text, answers, texts),
      }));
    }
    const tool = toolActivity({
      kind: summary.kind,
      name: this.toolName,
      title: summary.title,
      subtitle: summary.subtitle,
      status,
      note,
      questions,
      callID: this.id,
    });
    // A diff shows what the call changed, or would change while it waits. Once it has a result,
    // only the result's changes show: a write of the text a file already held changed nothing.
    let changes: ChatFileChanges | null = null;
    if (status === 'succeeded')
      changes = this.output === null ? this.previewChanges : this.resultChanges;
    else if (status === 'running' || status === 'awaitingApproval') changes = this.previewChanges;
    if (changes !== null) {
      const shown = shownChanges(changes, summary.kind, directory);
      tool.fileChanges = shown;
      tool.diff = {
        added: shown.files.reduce((sum, file) => sum + file.added, 0),
        removed: shown.files.reduce((sum, file) => sum + file.removed, 0),
        files: shown.files.length + shown.moreFiles,
      };
    }
    if (this.notRun === null && tool.fileChanges === null)
      tool.preview = this.preview(summary.kind);
    tool.exitCode = this.taskEnd !== null ? this.taskEnd.exitCode : (this.output?.exitCode ?? null);
    // A question's answers show in its questions, and its result holds nothing more for an
    // expanded row to read.
    if (this.notRun === null && summary.kind !== 'question') {
      tool.output =
        (this.subagentEnd?.preview != null ? this.subagentEndLine : null) ??
        this.taskEndLine ??
        this.outputLine;
    }
    if (this.outputIsTruncated && tool.output !== null && tool.output === this.outputLine) {
      if (tool.preview !== null) tool.preview = { ...tool.preview, isTruncated: true };
      if (tool.note === null) tool.note = 'Output exceeds the preview limit.';
    }
    return tool;
  }

  /**
   * The changes the input update previews. A write's preview never records the file's old text, so
   * only its result tells a new file from one it replaces: until then the file reads as written.
   */
  private get previewChanges(): ChatFileChanges | null {
    if (this.inputChanges === null) return null;
    if (this.rowKind !== 'fileWrite') return this.inputChanges;
    return {
      ...this.inputChanges,
      files: this.inputChanges.files.map((file) =>
        file.kind === 'created' ? { ...file, kind: 'written' as const } : file,
      ),
    };
  }

  /** The output a row of `kind` shows. */
  private preview(kind: ToolKind): ChatToolPreview | null {
    switch (kind) {
      case 'question':
        return null;
      case 'todo': {
        if (this.output?.preview != null) return this.output.preview;
        const todos: GrokTodo[] = this.input?.todos ?? [];
        return todos.length === 0 ? null : cappedText(todoText(todos));
      }
      case 'agent':
        if (this.subagentEnd !== null) return this.subagentEnd.preview;
        // Work in the background reports when it ends.
        return this.sentToBackground || this.input?.isBackground === true
          ? null
          : (this.output?.preview ?? null);
      default:
        // A command or a monitor in the background shows its output once its task ends.
        if (this.taskEnd !== null) return this.taskEnd.preview;
        return this.output?.preview ?? null;
    }
  }

  /** What a Blocked card matches the call on: its command, its file or its row's title, with the questions it asks. */
  pendingRequest(tool: ChatToolActivity): ChatPendingRequest {
    return {
      entryID: this.entryID,
      callID: this.id,
      kind: tool.kind,
      toolName: this.toolName,
      summary: this.input?.command ?? this.input?.filePath ?? tool.title,
      detail: this.input?.description ?? null,
      questions: tool.questions,
      planFilePath: null,
    };
  }
}
