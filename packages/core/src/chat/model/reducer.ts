// The contract every program's transcript reducer meets (Swift ChatTranscriptReducer), plus the
// lenient JSON reading the reducers share: a wrongly typed field reads as absent, never throws.

import type { ChatLine } from './lines';
import type {
  ChatFileChanges,
  ChatProjectionContext,
  ChatToolActivity,
  ChatToolPreview,
  ChatTranscript,
} from './types';

export type ChatToolOutput =
  | { type: 'preview'; preview: ChatToolPreview | null; fileChanges: ChatFileChanges | null }
  | {
      type: 'file';
      path: string;
      fallback: ChatToolPreview | null;
      fileChanges: ChatFileChanges | null;
    };

/** Turns one program's transcript lines into program-neutral chat entries. */
export interface ChatTranscriptReducer {
  /** Lines that follow everything fed so far, in file order. */
  append(lines: readonly ChatLine[]): void;
  /** Lines that precede everything fed so far, in file order: an older history page. */
  prepend(lines: readonly ChatLine[]): void;
  /** Pure over the fed lines: a caller may project as often as the Agent's activity changes. */
  transcript(context: ChatProjectionContext): ChatTranscript;
  /** Names a format this reducer does not read; Chat then explains instead of showing a partial view. */
  readonly unsupportedFormat: string | null;
  /** The output `line` holds for `tool`, decoded again for an expanded row. */
  output(line: ChatLine, tool: ChatToolActivity): ChatToolOutput | null;
}

export type JsonObject = { readonly [key: string]: unknown };

export function asObject(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function asBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function asInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

export function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

/** Compact ISO 8601 with milliseconds, or null when the timestamp does not parse. */
export function isoDate(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}
