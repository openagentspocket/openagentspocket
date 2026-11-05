// One decoded line of a Pi or Oh My Pi session file (Swift PiTranscriptReducer.Record).

import { decodeUtf8 } from '../../events/utf8';
import { repairedJsonPrefix } from '../model/json-prefix';
import { type ChatLine, isTruncatedLine } from '../model/lines';
import { asObject, asString, isoDate, type JsonObject } from '../model/reducer';

export interface PiRecord {
  offset: number;
  length: number;
  value: JsonObject;
  isTruncated: boolean;
  type: string;
  id: string | null;
  parent: string | null;
}

/** The line as a record, or null when it holds no JSON object with a `type`. */
export function decodePiLine(line: ChatLine): PiRecord | null {
  const truncated = isTruncatedLine(line);
  // Preserve ids/parents before a large text or image block. The shared structural prefix repair
  // never invents a partial string.
  const data = truncated ? repairedJsonPrefix(line.data) : line.data;
  if (!data) return null;
  let value: JsonObject | null;
  try {
    value = asObject(JSON.parse(decodeUtf8(data)));
  } catch {
    return null;
  }
  const type = asString(value?.type);
  if (!value || type === null) return null;
  return {
    offset: line.offset,
    length: line.length,
    value,
    isTruncated: truncated,
    type,
    id: asString(value.id),
    parent: asString(value.parentId),
  };
}

/** When the record was written, as epoch milliseconds and as ISO 8601; null when it names no time. */
export function writtenAt(record: PiRecord): { ms: number; iso: string } | null {
  const iso = isoDate(asString(record.value.timestamp));
  return iso === null ? null : { ms: Date.parse(iso), iso };
}
