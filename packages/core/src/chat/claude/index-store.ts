// Everything fed so far, keyed by record uuid (Swift ClaudeTranscriptIndex). Feeding is
// idempotent per record: the newest copy of a uuid wins.

import { type ChatLine, isTruncatedLine } from '../model/lines';
import type {
  AgentContextUsage,
  ChatTranscriptDiagnostics,
  ChatTranscriptLinks,
} from '../model/types';
import { decodeClaudeLine, KNOWN_METADATA_TYPES } from './record';
import type { ClaudeMetadata, ClaudeRecord } from './record-types';

export interface QueueOperation {
  offset: number;
  operation: string;
  content: string | null;
  timestamp: string | null;
}

export const KNOWN_SYSTEM_SUBTYPES: ReadonlySet<string> = new Set([
  'turn_duration',
  'compact_boundary',
  'local_command',
  'away_summary',
  'informational',
  'scheduled_task_fire',
  'model_refusal_fallback',
  'model_fallback',
  'model_consent_fallback',
  'agents_killed',
  'memory_saved',
  'api_error',
  'permission_retry',
  'stop_hook_summary',
]);

export const CLAUDE_DEFAULT_WINDOW = 200_000;
export const CLAUDE_EXTENDED_WINDOW = 1_000_000;

export function claudeContextWindow(model: string | null, usedTokens = 0): number {
  if (model?.toLowerCase().includes('[1m]')) return CLAUDE_EXTENDED_WINDOW;
  return usedTokens > CLAUDE_DEFAULT_WINDOW ? CLAUDE_EXTENDED_WINDOW : CLAUDE_DEFAULT_WINDOW;
}

class Latest {
  value: string | null = null;
  offset = 0;

  offer(candidate: string, at: number): void {
    if (this.value === null || at >= this.offset) {
      this.value = candidate;
      this.offset = at;
    }
  }
}

export class ClaudeTranscriptIndex {
  readonly records = new Map<string, ClaudeRecord>();
  readonly queueOperations = new Map<number, QueueOperation>();
  readonly unknownRecordTypes = new Set<string>();
  private customTitle = new Latest();
  private aiTitle = new Latest();
  private summaryTitle = new Latest();
  private permissionModeValue = new Latest();
  private relocatedCwd = new Latest();
  private continuedIn = new Latest();
  private lastAssistantOffset: number | null = null;
  private contextSample: { offset: number; tokens: number; model: string | null } | null = null;
  private invalidOffsets = new Set<number>();
  private oversizedOffsets = new Set<number>();

  apply(line: ChatLine): void {
    if (isTruncatedLine(line)) {
      this.oversizedOffsets.add(line.offset);
      return;
    }
    const decoded = decodeClaudeLine(line);
    if (decoded.type === 'invalid') this.invalidOffsets.add(line.offset);
    else if (decoded.type === 'record') this.insert(decoded.record);
    else this.fold(decoded.metadata, line.offset);
  }

  private insert(record: ClaudeRecord): void {
    const existing = this.records.get(record.uuid);
    if (existing && existing.byteOffset > record.byteOffset) return;
    this.records.set(record.uuid, record);
    if (record.kind.type === 'assistant' && !record.isSidechain) {
      this.lastAssistantOffset = Math.max(this.lastAssistantOffset ?? 0, record.byteOffset);
      const sample = record.contextSample;
      if (
        sample &&
        !record.isAPIError &&
        (this.contextSample === null || record.byteOffset > this.contextSample.offset)
      ) {
        this.contextSample = {
          offset: record.byteOffset,
          tokens: sample.promptTokens,
          model: sample.model,
        };
      }
    }
    if (record.kind.type === 'unknown') this.unknownRecordTypes.add(record.kind.name);
    else if (record.kind.type === 'system' && !KNOWN_SYSTEM_SUBTYPES.has(record.kind.subtype)) {
      this.unknownRecordTypes.add(`system/${record.kind.subtype}`);
    }
  }

  private fold(metadata: ClaudeMetadata, offset: number): void {
    switch (metadata.type) {
      case 'customTitle':
        this.customTitle.offer(metadata.value, offset);
        break;
      case 'aiTitle':
        this.aiTitle.offer(metadata.value, offset);
        break;
      case 'summary':
        this.summaryTitle.offer(metadata.value, offset);
        break;
      case 'permissionMode':
        this.permissionModeValue.offer(metadata.value, offset);
        break;
      case 'relocated':
        this.relocatedCwd.offer(metadata.value, offset);
        break;
      case 'continuedIn':
        this.continuedIn.offer(metadata.value, offset);
        break;
      case 'queueOperation':
        this.queueOperations.set(offset, {
          offset,
          operation: metadata.operation,
          content: metadata.content,
          timestamp: metadata.timestamp,
        });
        break;
      case 'other':
        if (!KNOWN_METADATA_TYPES.has(metadata.name)) this.unknownRecordTypes.add(metadata.name);
        break;
    }
  }

  get title(): string | null {
    return this.customTitle.value ?? this.aiTitle.value ?? this.summaryTitle.value;
  }

  get permissionMode(): string | null {
    return this.permissionModeValue.value;
  }

  get contextUsage(): AgentContextUsage | null {
    if (!this.contextSample) return null;
    const { tokens, model } = this.contextSample;
    return { usedTokens: tokens, windowTokens: claudeContextWindow(model, tokens) };
  }

  get links(): ChatTranscriptLinks {
    let continuedInSessionID = this.continuedIn.value;
    if (this.lastAssistantOffset !== null && this.lastAssistantOffset > this.continuedIn.offset) {
      continuedInSessionID = null;
    }
    return { relocatedCwd: this.relocatedCwd.value, continuedInSessionID };
  }

  get diagnostics(): ChatTranscriptDiagnostics {
    return {
      invalidLines: this.invalidOffsets.size,
      oversizedLines: this.oversizedOffsets.size,
      unknownRecordTypes: new Set(this.unknownRecordTypes),
    };
  }

  /** Records oldest first. */
  get recordsByPosition(): ClaudeRecord[] {
    return [...this.records.values()].sort((a, b) => a.byteOffset - b.byteOffset);
  }
}
