// The entries, turns and prompts OpenCode's rows make, built in `seq` order (the private
// `Projection` of Swift OpenCodeTranscriptReducer). A turn runs from a prompt to the `idle` row
// OpenCode writes when the session goes idle; prompts steered in while it runs stay in it. A
// declined permission or a dismissed question ends a turn with no `idle` row, so the projection ends
// it at that step while the step is the turn's last: OpenCode may resume the turn after a restart.
//
// A session OpenCode 2 imported from 1.x keeps its 1.x version and has no `idle` rows, and 1.x took
// no steers. Until an `idle` row shows the session going on in OpenCode 2, each of its prompts opens
// a turn, and the turn before ends with its last step.

import { notice, userMessage } from '../model/factories';
import { capPreview } from '../model/preview';
import {
  type ChatEntry,
  type ChatEntryContent,
  type ChatProjectionContext,
  type ChatTranscript,
  emptyTranscript,
  type TurnEnding,
} from '../model/types';
import {
  compactionPreview,
  dateOf,
  failedCompactionNotice,
  isCut,
  isDeclined,
  newRun,
  noteNotice,
  offsetOf,
  type Run,
  shown,
  stepNotices,
  stepTools,
  switchNotice,
  trimmed,
} from './projection-parts';
import type {
  OpenCodeCompaction,
  OpenCodeError,
  OpenCodeInboxItem,
  OpenCodeNote,
  OpenCodeRow,
  OpenCodeStep,
  OpenCodeUserMessage,
} from './record';
import { openCodeToolActivity } from './tool-summary';

export class OpenCodeProjection {
  readonly transcript: ChatTranscript = emptyTranscript();
  private sawIdle = false;
  private run: Run;

  constructor(
    private readonly context: ChatProjectionContext,
    private readonly isImported: boolean,
  ) {
    this.transcript.needsOlderHistory = context.windowStart > 0;
    this.run =
      context.windowStart > 0
        ? newRun({ kind: 'above', seen: false })
        : newRun({ kind: 'loose' }, true);
  }

  append(entry: ChatEntry): void {
    this.transcript.entries.push(entry);
  }

  add(row: OpenCodeRow, length: number): void {
    const { content } = row;
    switch (content.type) {
      case 'user':
        this.addPrompt(row, content.message);
        break;
      case 'assistant':
        this.addStep(row, content.step, length);
        break;
      case 'idle':
        this.addIdle(row, content.idle.outcome, content.idle.error);
        break;
      case 'compaction':
        this.addCompaction(row, content.compaction);
        break;
      case 'note':
        this.addNote(row, content.note);
        break;
      case 'shell':
        this.entry(
          row,
          'notice',
          notice('shellCommand', content.shell.command ?? 'Shell command', {
            detail: content.shell.output === null ? null : capPreview(content.shell.output).text,
          }),
        );
        break;
      case 'agentSwitched':
      case 'modelSwitched':
      case 'locationSwitched': {
        const switched = switchNotice(content);
        if (switched !== null) this.entry(row, 'notice', switched);
        break;
      }
      case 'oversized':
        if (row.type === 'user') {
          this.open(row, this.entryID(row));
          this.entry(row, 'notice', notice('system', 'This message is too large to show in Chat.'));
          this.transcript.latestPromptOffset = offsetOf(row.seq);
        } else {
          if (row.type === 'assistant') this.resume();
          this.entry(row, 'notice', notice('system', 'This step is too large to show in Chat.'));
        }
        break;
      default:
        break;
    }
  }

  /**
   * Ends the open run at its declined step when the step is its last. While herdr says Blocked, the
   * open run's newest running call is the one OpenCode asks about.
   */
  finish(): void {
    this.settleDecline();
    const index = this.run.runningTools.at(-1);
    if (this.run.isEnded || this.context.activity !== 'blocked' || index === undefined) return;
    const target = this.transcript.entries[index];
    if (target?.content.type !== 'tool') return;
    const tool = target.content.value;
    tool.status = 'awaitingApproval';
    this.transcript.pendingRequests.push({
      entryID: target.id,
      callID: tool.callID,
      kind: tool.kind,
      toolName: tool.name,
      summary: tool.title,
      detail: tool.subtitle,
      questions: tool.questions,
      planFilePath: null,
    });
  }

  /** A prompt OpenCode has taken but not yet written as a row. */
  addQueued(item: OpenCodeInboxItem, id: string): void {
    const text = item.text ?? '';
    const cut = isCut(text, item.length);
    const offset = offsetOf(item.seq ?? 0);
    const value = userMessage(shown(trimmed(text), cut), {
      attachmentLabels: item.files,
      wasQueued: true,
    });
    this.append({ id, sourceOffset: offset, content: { type: 'user', value } });
    (this.transcript.unrecordedEntryIDs as Set<string>).add(id);
    // A long one echoes once its row holds the whole text.
    if (!cut) {
      this.transcript.recordedPrompts.push({ offset, text, entryID: id, pastedImagePaths: null });
    }
  }

  // MARK: Rows

  private addPrompt(row: OpenCodeRow, message: OpenCodeUserMessage): void {
    const id = this.entryID(row);
    const steers = this.open(row, id);
    const text = message.text ?? '';
    const labels = message.files.flatMap((file) => {
      const label = file.name ?? file.mime;
      return label === null ? [] : [label];
    });
    this.entry(
      row,
      'user',
      userMessage(shown(trimmed(text), isCut(text, message.length)), {
        attachmentLabels: labels,
        wasQueued: steers,
      }),
    );
    // A prompt of only an image or a PDF records no text to match a send.
    const attachesOnly =
      trimmed(text) === '' &&
      message.files.some(
        (file) => file.mime?.startsWith('image/') || file.mime === 'application/pdf',
      );
    const offset = offsetOf(row.seq);
    this.transcript.recordedPrompts.push({
      offset,
      text,
      entryID: id,
      pastedImagePaths: attachesOnly ? [] : null,
    });
    this.transcript.latestPromptOffset = offset;
  }

  private addStep(row: OpenCodeRow, step: OpenCodeStep, length: number): void {
    this.resume();
    for (const item of step.items) {
      const suffix = `:${item.index}`;
      const { kind } = item;
      if (kind.type === 'text' && kind.text.text !== '') {
        // Text fills in only when its block ends; an empty item is one still being written.
        this.entry(
          row,
          'assistant',
          { text: shown(kind.text.text, isCut(kind.text.text, kind.text.length)) },
          suffix,
        );
      } else if (kind.type === 'reasoning' && kind.text.text !== '') {
        const { started, completed } = kind.text;
        this.entry(
          row,
          'reasoning',
          {
            text: shown(kind.text.text, isCut(kind.text.text, kind.text.length)),
            durationMilliseconds:
              started !== null && completed !== null ? completed - started : null,
          },
          suffix,
        );
      } else if (kind.type === 'tool') {
        const tool = openCodeToolActivity(kind.tool, {
          path: null,
          offset: offsetOf(row.seq),
          length,
        });
        if (tool.status === 'running') this.run.runningTools.push(this.transcript.entries.length);
        this.entry(row, 'tool', tool, suffix);
      }
    }
    const said = stepNotices(step, row.isFinal);
    for (const item of said.notices) this.entry(row, 'notice', item.notice, item.suffix);
    if (said.failure !== null) this.run.failure = said.failure;
    const endedAt = dateOf(step.completed ?? row.updated);
    if (step.finish === 'error' && stepTools(step).some(isDeclined)) {
      this.run.decline = { endedAt };
    }
    let ending: TurnEnding = 'completed';
    if (step.error?.type === 'aborted') ending = 'interrupted';
    else if (step.error || step.finish === 'error') ending = 'failed';
    this.run.lastStep = { ending, endedAt, duration: null };
  }

  private addIdle(row: OpenCodeRow, outcome: string | null, error: OpenCodeError | null): void {
    this.sawIdle = true;
    // A run its declined step ended is already over: this idle, such as the one `/redo` writes,
    // closes nothing.
    this.settleDecline();
    let ending: TurnEnding;
    if (outcome === 'interrupted') ending = 'interrupted';
    // An idle row too large to keep reads as a failure.
    else if (outcome === 'failed' || outcome === null) ending = 'failed';
    else ending = 'completed';
    // A step that failed has already said why.
    const message = error?.message ?? 'The turn failed';
    const isSaid = !this.run.isEnded && this.run.failure === message;
    this.end(ending, dateOf(row.created));
    if (ending === 'failed' && !isSaid) {
      this.entry(row, 'notice', notice('error', message));
    } else if (ending === 'interrupted') {
      // A stop says so, as OpenCode's own screen does.
      this.entry(row, 'notice', notice('interrupted', 'Interrupted'));
    }
  }

  private addCompaction(row: OpenCodeRow, compaction: OpenCodeCompaction): void {
    if (compaction.reason === 'manual') {
      const id = this.entryID(row);
      this.open(row, id);
      this.entry(row, 'notice', notice('command', '/compact'));
      this.transcript.recordedPrompts.push({
        offset: offsetOf(row.seq),
        text: '/compact',
        entryID: id,
        pastedImagePaths: null,
      });
    } else {
      this.resume();
    }
    if (compaction.status === 'completed') {
      this.entry(
        row,
        'divider',
        { kind: 'compaction', detail: compactionPreview(compaction.summary) },
        ':divider',
      );
    } else if (compaction.status === 'failed') {
      this.addFailedCompaction(row, compaction.error);
    }
  }

  private addNote(row: OpenCodeRow, note: OpenCodeNote): void {
    const shown = noteNotice(row.type, note);
    if (shown === null) return;
    if (shown.resumes) this.resume();
    this.entry(row, 'notice', shown.notice);
  }

  private addFailedCompaction(row: OpenCodeRow, error: OpenCodeError | null): void {
    const failed = failedCompactionNotice(error);
    this.entry(row, 'notice', failed.notice, failed.suffix);
  }

  // MARK: Turns

  /**
   * Places a prompt or `/compact`: it steers a turn still running, and otherwise opens one. Returns
   * whether it steered. In a session imported from 1.x, until an `idle` row, it always opens one,
   * and the run before ends with its last step.
   */
  private open(row: OpenCodeRow, id: string): boolean {
    this.settleDecline();
    if (this.isImported && !this.sawIdle) {
      if (this.run.lastStep) this.end(this.run.lastStep.ending, this.run.lastStep.endedAt);
    } else if (this.takesSteers()) {
      return true;
    }
    this.endQuietly();
    this.transcript.turns.push({
      firstEntryID: id,
      startedAt: dateOf(row.created),
      endedAt: null,
      ending: null,
    });
    this.run = newRun({ kind: 'turn', index: this.transcript.turns.length - 1 });
    return false;
  }

  /** Whether a prompt now steers this run rather than opening a turn. */
  private takesSteers(): boolean {
    if (this.run.isEnded || this.run.decline !== null) return false;
    const { place } = this.run;
    return place.kind === 'above' ? place.seen : place.kind === 'turn';
  }

  /**
   * A step or a note that shows OpenCode working: a run that ended goes on as rows no prompt
   * opened, and a declined step is no longer the run's last.
   */
  private resume(): void {
    if (this.run.isEnded) {
      this.run = newRun({ kind: 'loose' });
    } else if (this.run.place.kind === 'above') {
      this.run.place = { kind: 'above', seen: true };
    }
    this.run.decline = null;
  }

  private settleDecline(): void {
    if (this.run.isEnded || this.run.decline === null) return;
    this.end('interrupted', this.run.decline.endedAt);
  }

  private end(ending: TurnEnding, endedAt: string | null): void {
    if (this.run.isEnded) return;
    const { place } = this.run;
    if (place.kind === 'turn') {
      const turn = this.transcript.turns[place.index];
      if (turn) {
        turn.ending = ending;
        turn.endedAt = endedAt;
      }
    } else if (place.kind === 'above') {
      this.transcript.precedingTurnEnd = { ending, endedAt, duration: null };
    }
    this.endQuietly();
  }

  /** Ends the run without an ending of its own: its tools still running never completed. */
  private endQuietly(): void {
    for (const index of this.run.runningTools) {
      const target = this.transcript.entries[index];
      if (target?.content.type === 'tool') target.content.value.status = 'notCompleted';
    }
    this.run.runningTools = [];
    this.run.isEnded = true;
  }

  // MARK: Entries

  private entryID(row: OpenCodeRow, suffix = ''): string {
    return `oc:${row.id}${suffix}`;
  }

  private entry<T extends ChatEntryContent['type']>(
    row: OpenCodeRow,
    type: T,
    value: Extract<ChatEntryContent, { type: T }>['value'],
    suffix = '',
  ): void {
    this.append({
      id: this.entryID(row, suffix),
      sourceOffset: offsetOf(row.seq),
      content: { type, value } as ChatEntryContent,
    });
  }
}
