// Byte-level JSON helpers shared by the line classifier and the prefix repair (Swift JSONBytes).
// Rollout lines reach megabytes, so structure is read without decoding them whole.

import { decodeUtf8, encodeUtf8 } from '../../events/utf8';

export const QUOTE = 0x22;
export const BACKSLASH = 0x5c;
export const OPEN_BRACE = 0x7b;
export const CLOSE_BRACE = 0x7d;
export const OPEN_BRACKET = 0x5b;
export const CLOSE_BRACKET = 0x5d;
export const COMMA = 0x2c;
export const COLON = 0x3a;

export function isJsonWhitespace(byte: number): boolean {
  return byte === 0x20 || byte === 0x0a || byte === 0x0d || byte === 0x09;
}

/** True when `needle` (text, encoded as UTF-8) occurs in `bytes`. */
export function includesBytes(bytes: Uint8Array, needle: string): boolean {
  const pattern = encodeUtf8(needle);
  const first = pattern[0];
  if (first === undefined) return true;
  let at = bytes.indexOf(first);
  while (at >= 0 && at + pattern.length <= bytes.length) {
    let match = true;
    for (let i = 1; i < pattern.length; i += 1) {
      if (bytes[at + i] !== pattern[i]) {
        match = false;
        break;
      }
    }
    if (match) return true;
    at = bytes.indexOf(first, at + 1);
  }
  return false;
}

/** Where a token that is not a string or container ends: at the next delimiter, else null. */
export function tokenEnd(bytes: Uint8Array, start: number): number | null {
  for (let index = start; index < bytes.length; index += 1) {
    const byte = bytes[index] as number;
    if (
      byte === COMMA ||
      byte === CLOSE_BRACE ||
      byte === CLOSE_BRACKET ||
      isJsonWhitespace(byte)
    ) {
      return index > start ? index : null;
    }
  }
  return null;
}

/** The index just past the closing quote of the string starting at `quote`, or null. */
export function stringEnd(bytes: Uint8Array, quote: number): number | null {
  let index = quote + 1;
  while (index < bytes.length) {
    const byte = bytes[index];
    if (byte === BACKSLASH) index += 2;
    else if (byte === QUOTE) return index + 1;
    else index += 1;
  }
  return null;
}

/** The index just past the value starting at `start`, or null when it does not end in the bytes. */
export function valueEnd(bytes: Uint8Array, start: number): number | null {
  if (start >= bytes.length) return null;
  const lead = bytes[start];
  if (lead === QUOTE) return stringEnd(bytes, start);
  if (lead !== OPEN_BRACE && lead !== OPEN_BRACKET) return tokenEnd(bytes, start);
  let depth = 0;
  let index = start;
  while (index < bytes.length) {
    const byte = bytes[index];
    if (byte === QUOTE) {
      const end = stringEnd(bytes, index);
      if (end === null) return null;
      index = end;
      continue;
    }
    if (byte === OPEN_BRACE || byte === OPEN_BRACKET) depth += 1;
    else if (byte === CLOSE_BRACE || byte === CLOSE_BRACKET) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  return null;
}

/** Decodes the string starting at `quote` (escapes included) and the index past its closing quote. */
export function decodeString(bytes: Uint8Array, quote: number): [string, number] | null {
  const end = stringEnd(bytes, quote);
  if (end === null) return null;
  const raw = decodeUtf8(bytes.subarray(quote + 1, end - 1));
  if (!raw.includes('\\')) return [raw, end];
  try {
    return [JSON.parse(`"${raw}"`) as string, end];
  } catch {
    return [raw, end];
  }
}
