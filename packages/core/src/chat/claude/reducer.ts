// The Claude Code transcript reducer (Swift ClaudeTranscriptReducer + the transcript assembly of
// ClaudeTranscriptProjection). Bump REVISION when the output of the same lines changes: the
// cache drops anything written by another revision.

import type { ChatLine } from '../model/lines';
import { isAcceptablePath } from '../model/paths';
import type { ChatToolOutput, ChatTranscriptReducer } from '../model/reducer';
import type { ChatProjectionContext, ChatToolActivity, ChatTranscript } from '../model/types';
import { answerOutcome, answersIn } from './answers';
import { Builder } from './builder-user';
import { type ClaudeChain, type ClaudeRole, resolveChain } from './chain';
import { ClaudeTranscriptIndex } from './index-store';
import { recordedPrompts, waitingEnqueues } from './prompts';
import { decodeClaudeLine, emptyInput } from './record';
import { type ClaudeRecord, type ClaudeToolUse, toolUsesOf } from './record-types';
import { toolFileChanges, toolPreview } from './tool-summary';

export const CLAUDE_REVISION = 15;

export class ClaudeTranscriptReducer implements ChatTranscriptReducer {
  readonly index = new ClaudeTranscriptIndex();
  readonly unsupportedFormat: string | null = null;

  constructor(
    readonly role: ClaudeRole = 'main',
    readonly transcriptPath: string | null = null,
  ) {}

  append(lines: readonly ChatLine[]): void {
    for (const line of lines) this.index.apply(line);
  }

  prepend(lines: readonly ChatLine[]): void {
    for (const line of lines) this.index.apply(line);
  }

  chain(context: ChatProjectionContext): ClaudeChain {
    return resolveChain(this.index, this.role, context.windowStart === 0);
  }

  transcript(context: ChatProjectionContext): ChatTranscript {
    const chain = this.chain(context);
    const main = this.role === 'main';
    const builder = new Builder(
      chain,
      this.index,
      this.role,
      context.activity,
      this.transcriptPath,
    );
    builder.build();
    const waiting = main
      ? builder.addWaitingPrompts(waitingEnqueues(this.index))
      : new Map<number, string>();
    return {
      entries: builder.entries,
      title: this.index.title,
      needsOlderHistory: context.windowStart > 0,
      pendingRequests: builder.pendingRequests,
      recordedPrompts: main ? recordedPrompts(this.index, builder.entryByRecord, waiting) : [],
      links: this.index.links,
      diagnostics: this.index.diagnostics,
      backgroundWork: main ? builder.backgroundWork : [],
      latestPromptOffset: builder.latestPromptOffset,
      backgroundWorkEnds: main ? builder.backgroundWorkEnds : {},
      backgroundWorkStop: main ? builder.endStoppingAfter(context.windowStart) : null,
      backgroundWorkAgents: main ? builder.backgroundWorkAgents : {},
      turns: main ? builder.turns : [],
      precedingTurnEnd: main ? builder.precedingTurnEnd : null,
      unrecordedEntryIDs: new Set(waiting.values()),
      contextUsage: main ? this.index.contextUsage : null,
    };
  }

  output(line: ChatLine, tool: ChatToolActivity): ChatToolOutput | null {
    const callID = tool.callID;
    const decoded = decodeClaudeLine(line);
    if (callID === null || decoded.type !== 'record') return null;
    const use = this.findUse(callID) ?? { id: callID, name: tool.name, input: emptyInput() };
    const output = outputOf(use, decoded.record);
    if (output?.type === 'file' && !this.isSpilledOutput(output.path)) {
      return { type: 'preview', preview: output.fallback, fileChanges: output.fileChanges };
    }
    return output;
  }

  private findUse(callID: string): ClaudeToolUse | undefined {
    for (const record of this.index.records.values()) {
      const use = toolUsesOf(record).find((candidate) => candidate.id === callID);
      if (use) return use;
    }
    return undefined;
  }

  private isSpilledOutput(path: string): boolean {
    const base = this.transcriptPath;
    if (base === null || !base.endsWith('.jsonl') || !isAcceptablePath(path)) return false;
    return path.startsWith(`${base.slice(0, -'.jsonl'.length)}/tool-results/`);
  }
}

/** What `record` holds for the call `use`. */
export function outputOf(use: ClaudeToolUse, record: ClaudeRecord): ChatToolOutput | null {
  const answer = answersIn(record).find((candidate) => candidate.result.toolUseID === use.id);
  if (!answer) return null;
  const outcome = answerOutcome(answer);
  const preview = toolPreview(use, answer.result, record.toolResult, outcome);
  const fileChanges = toolFileChanges(use, record.toolResult, outcome);
  const path = record.toolResult?.result?.persistedOutputPath;
  return path
    ? { type: 'file', path, fallback: preview, fileChanges }
    : { type: 'preview', preview, fileChanges };
}
