// A rollout file's share of the conversation and the session header it declares (Swift
// CodexSegment, CodexSessionMeta, CodexFirstLine).

import { decodeUtf8 } from '../../events/utf8';
import { type ChatLine, isTruncatedLine } from '../model/lines';
import { asObject, asString, type JsonObject } from '../model/reducer';
import { classifyLine } from './classifier';
import { repairedPrefix } from './json-prefix';
import type { CodexRolloutDialect, CodexStoredLine } from './record';

export interface CodexHistoryBase {
  /** The base file's rollout id (`history_base.thread_id`). */
  baseRolloutID: string;
  endOrdinalExclusive: number;
  endByteOffset: number;
}

export interface CodexSessionMeta {
  id: string | null;
  cwd: string | null;
  cliVersion: string | null;
  /** Null when the key is absent: rollouts from before paginated history. */
  historyMode: string | null;
  /** True when `history_mode` is present but not a string. */
  hasMalformedHistoryMode: boolean;
  historyBase: CodexHistoryBase | null;
  hasMalformedHistoryBase: boolean;
  subagentHistoryStartOrdinal: number | null;
}

function wholeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function readHistoryBase(value: unknown): CodexHistoryBase | null {
  const o = asObject(value);
  if (!o) return null;
  const id = asString(o.thread_id);
  const end = wholeNumber(o.end_ordinal_exclusive);
  const offset = wholeNumber(o.end_byte_offset);
  return id === null || end === null || offset === null
    ? null
    : { baseRolloutID: id, endOrdinalExclusive: end, endByteOffset: offset };
}

export function readSessionMeta(o: JsonObject): CodexSessionMeta {
  const historyMode = asString(o.history_mode);
  const historyBase = readHistoryBase(o.history_base);
  return {
    id: asString(o.id),
    cwd: asString(o.cwd),
    cliVersion: asString(o.cli_version),
    historyMode,
    hasMalformedHistoryMode: 'history_mode' in o && historyMode === null,
    historyBase,
    hasMalformedHistoryBase: 'history_base' in o && historyBase === null && o.history_base !== null,
    subagentHistoryStartOrdinal: wholeNumber(o.subagent_history_start_ordinal),
  };
}

export interface CodexSegment {
  rolloutID: string;
  /** The file, or null for the live rollout. */
  path: string | null;
  meta: CodexSessionMeta;
  lines: CodexStoredLine[];
  /** For a base segment: ordinals from here on belong to the rollout that continues it. */
  endOrdinalExclusive: number | null;
}

/** Line 1 of a rollout, read loosely enough to tell an envelope from the pre-envelope format. */
export interface CodexFirstLine {
  type: string | null;
  payload: CodexSessionMeta | null;
  isPreEnvelope: boolean;
  preEnvelopeID: string | null;
  /** The thread the line names. */
  threadID: string | null;
}

export function readFirstLine(data: Uint8Array): CodexFirstLine | null {
  let root: unknown;
  try {
    root = JSON.parse(decodeUtf8(data));
  } catch {
    return null;
  }
  const o = asObject(root);
  if (!o) return null;
  const type = asString(o.type);
  const payloadObject = asObject(o.payload);
  const payload = payloadObject ? readSessionMeta(payloadObject) : null;
  const isPreEnvelope = type === null && 'id' in o && 'instructions' in o;
  const preEnvelopeID = isPreEnvelope ? asString(o.id) : null;
  return {
    type,
    payload,
    isPreEnvelope,
    preEnvelopeID,
    threadID: isPreEnvelope
      ? preEnvelopeID
      : type === 'session_meta'
        ? (payload?.id ?? null)
        : null,
  };
}

export type CodexUnsupportedReason = 'preEnvelope' | 'noSessionMeta' | 'unknownHistoryMode';

export type CodexRolloutSupport =
  | { type: 'pending' }
  | { type: 'supported'; dialect: CodexRolloutDialect }
  | { type: 'unsupported'; reason: CodexUnsupportedReason };

/** The dialect line 1 declares. */
export function detectSupport(line: ChatLine): {
  support: CodexRolloutSupport;
  meta: CodexSessionMeta | null;
} {
  const truncated = isTruncatedLine(line);
  const data = truncated ? repairedPrefix(line.data) : line.data;
  const first = data === null ? null : readFirstLine(data);
  const unsupported = (reason: CodexUnsupportedReason, meta: CodexSessionMeta | null = null) => ({
    support: { type: 'unsupported', reason } as const,
    meta,
  });
  if (!first) return unsupported('noSessionMeta');
  if (first.isPreEnvelope) return unsupported('preEnvelope');
  const meta = first.payload;
  if (first.type !== 'session_meta' || !meta) return unsupported('noSessionMeta');
  if (meta.hasMalformedHistoryMode) return unsupported('unknownHistoryMode', meta);
  const supported = (dialect: CodexRolloutDialect) => ({
    support: { type: 'supported', dialect } as const,
    meta,
  });
  switch (meta.historyMode) {
    case 'paginated':
      return supported('paginated');
    case 'legacy':
      return supported('legacy');
    case null:
      // `history_mode` follows the large base instructions, so a cut line may have lost it; only
      // paginated lines carry ordinals.
      return truncated && classifyLine(line.data).ordinal !== null
        ? supported('paginated')
        : supported('legacy');
    default:
      return unsupported('unknownHistoryMode', meta);
  }
}
