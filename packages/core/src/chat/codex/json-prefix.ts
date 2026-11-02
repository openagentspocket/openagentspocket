// Structural reads of a rollout line's raw bytes, without decoding it (Swift CodexJSONPrefix).
// A line Chat never shows must still be a whole record before it may take an ordinal, and a line
// longer than the framer keeps arrives as a prefix that, cut back to its last complete value and
// closed, still yields the fields that precede the large one.

import {
  CLOSE_BRACE,
  CLOSE_BRACKET,
  COLON,
  COMMA,
  isJsonWhitespace,
  OPEN_BRACE,
  OPEN_BRACKET,
  QUOTE,
  stringEnd,
  tokenEnd,
} from './json-bytes';

type Outcome =
  | { type: 'complete' }
  | { type: 'truncated'; cut: number; openContainers: number[] }
  | { type: 'malformed' };

type Expectation =
  | 'root'
  | 'keyOrEnd'
  | 'key'
  | 'colon'
  | 'objectValue'
  | 'arrayValueOrEnd'
  | 'arrayValue'
  | 'separatorOrEnd'
  | 'done';

const MALFORMED: Outcome = { type: 'malformed' };

function isScalarToken(token: string): boolean {
  return token === 'true' || token === 'false' || token === 'null' || /^[0-9+\-.eE]*$/.test(token);
}

function truncatedAt(cut: number | null, stack: number[], depth: number): Outcome {
  if (cut === null || depth > stack.length) return MALFORMED;
  return { type: 'truncated', cut, openContainers: stack.slice(0, depth) };
}

function scan(bytes: Uint8Array): Outcome {
  const stack: number[] = [];
  let expectation = 'root' as Expectation;
  // The last point where the prefix could end, and how deep the containers were there.
  let safeCut: number | null = null;
  let safeDepth = 0;
  let index = 0;
  const markSafe = (position: number): void => {
    safeCut = position;
    safeDepth = stack.length;
  };
  const finishValue = (position: number): void => {
    if (stack.length === 0) {
      expectation = 'done';
    } else {
      expectation = 'separatorOrEnd';
      markSafe(position);
    }
  };
  const truncated = (): Outcome => truncatedAt(safeCut, stack, safeDepth);

  while (index < bytes.length) {
    const byte = bytes[index] as number;
    if (isJsonWhitespace(byte)) {
      index += 1;
      continue;
    }
    switch (expectation) {
      case 'done':
        return MALFORMED;
      case 'root':
        if (byte !== OPEN_BRACE) return MALFORMED;
        stack.push(byte);
        index += 1;
        expectation = 'keyOrEnd';
        markSafe(index);
        break;
      case 'keyOrEnd':
      case 'key': {
        if (expectation === 'keyOrEnd' && byte === CLOSE_BRACE) {
          stack.pop();
          index += 1;
          finishValue(index);
          break;
        }
        if (byte !== QUOTE) return MALFORMED;
        const end = stringEnd(bytes, index);
        if (end === null) return truncated();
        index = end;
        expectation = 'colon';
        break;
      }
      case 'colon':
        if (byte !== COLON) return MALFORMED;
        index += 1;
        expectation = 'objectValue';
        break;
      case 'objectValue':
      case 'arrayValue':
      case 'arrayValueOrEnd': {
        if (expectation === 'arrayValueOrEnd' && byte === CLOSE_BRACKET) {
          stack.pop();
          index += 1;
          finishValue(index);
          break;
        }
        if (byte === OPEN_BRACE) {
          stack.push(byte);
          index += 1;
          expectation = 'keyOrEnd';
          markSafe(index);
        } else if (byte === OPEN_BRACKET) {
          stack.push(byte);
          index += 1;
          expectation = 'arrayValueOrEnd';
          markSafe(index);
        } else if (byte === QUOTE) {
          const end = stringEnd(bytes, index);
          if (end === null) return truncated();
          index = end;
          finishValue(index);
        } else {
          const end = tokenEnd(bytes, index);
          if (end === null) return truncated();
          let token = '';
          for (let i = index; i < end; i += 1) token += String.fromCharCode(bytes[i] as number);
          if (!isScalarToken(token)) return MALFORMED;
          index = end;
          finishValue(index);
        }
        break;
      }
      case 'separatorOrEnd': {
        const open = stack[stack.length - 1];
        if (open === undefined) return MALFORMED;
        if (byte === COMMA) {
          index += 1;
          expectation = open === OPEN_BRACE ? 'key' : 'arrayValue';
        } else if (
          (byte === CLOSE_BRACE && open === OPEN_BRACE) ||
          (byte === CLOSE_BRACKET && open === OPEN_BRACKET)
        ) {
          stack.pop();
          index += 1;
          finishValue(index);
        } else {
          return MALFORMED;
        }
        break;
      }
    }
  }
  return expectation === 'done' ? { type: 'complete' } : truncated();
}

/** True when `data` holds exactly one complete JSON object, surrounded by whitespace at most. */
export function isCompleteObject(data: Uint8Array): boolean {
  return scan(data).type === 'complete';
}

/**
 * `data`, a prefix of one JSON object, cut back to its last complete value and closed so it
 * parses. Null when the prefix is not the start of an object or has no complete value at all.
 */
export function repairedPrefix(data: Uint8Array): Uint8Array | null {
  const outcome = scan(data);
  if (outcome.type === 'complete') return data;
  if (outcome.type === 'malformed') return null;
  const closers = [...outcome.openContainers]
    .reverse()
    .map((opener) => (opener === OPEN_BRACE ? CLOSE_BRACE : CLOSE_BRACKET));
  const out = new Uint8Array(outcome.cut + closers.length);
  out.set(data.subarray(0, outcome.cut), 0);
  out.set(closers, outcome.cut);
  return out;
}
