// The lines Hermes Agent's store query prints, read leniently: a wrongly typed field reads as absent.

import { decodeUtf8 } from '../../events/utf8';
import { asArray, asInt, asObject, asString, type JsonObject } from '../model/reducer';

export interface HermesToolCall {
  id: string | null;
  name: string;
  /** JSON text as the model wrote it, possibly cut. */
  arguments: string;
}

export interface HermesRow {
  /** The display slot, which orders rows. */
  seq: number;
  role: string;
  text: string;
  /** The text's length as stored; more than `text` holds when the query cut it. */
  length: number | null;
  imageCount: number;
  toolCalls: HermesToolCall[];
  toolCallID: string | null;
  toolName: string | null;
  /** Seconds since the epoch. */
  timestamp: number | null;
  finishReason: string | null;
  reasoning: string | null;
  displayKind: string | null;
  isSummary: boolean;
}

export interface HermesSession {
  id: string | null;
  title: string | null;
}

export type HermesLine =
  | { kind: 'session'; session: HermesSession }
  | { kind: 'row'; row: HermesRow }
  | { kind: 'malformed' };

const MALFORMED: HermesLine = { kind: 'malformed' };

function toolCallOf(value: unknown): HermesToolCall | null {
  const call = asObject(value);
  const name = asString(call?.name);
  if (call === null || name === null) return null;
  return { id: asString(call.id), name, arguments: asString(call.args) ?? '' };
}

function rowOf(value: JsonObject): HermesLine {
  const seq = asInt(value.seq);
  const role = asString(value.role);
  if (seq === null || role === null) return MALFORMED;
  return {
    kind: 'row',
    row: {
      seq,
      role,
      text: asString(value.c) ?? '',
      length: asInt(value.n),
      imageCount: asInt(value.img) ?? 0,
      toolCalls: (asArray(value.tc) ?? []).flatMap((call) => toolCallOf(call) ?? []),
      toolCallID: asString(value.tid),
      toolName: asString(value.tool),
      timestamp: typeof value.ts === 'number' ? value.ts : null,
      finishReason: asString(value.fin),
      reasoning: asString(value.rs),
      displayKind: asString(value.kind),
      isSummary: asInt(value.sum) === 1,
    },
  };
}

export function readHermesLine(data: Uint8Array): HermesLine {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeUtf8(data));
  } catch {
    return MALFORMED;
  }
  const value = asObject(parsed);
  if (value?.k === 'row') return rowOf(value);
  if (value?.k === 'session') {
    return { kind: 'session', session: { id: asString(value.id), title: asString(value.title) } };
  }
  return MALFORMED;
}
