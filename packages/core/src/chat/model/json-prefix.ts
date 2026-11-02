// Structural reads of a line's raw bytes without decoding it (Swift CodexJSONPrefix). A line longer
// than the framer keeps arrives as a prefix no decoder accepts; cut back to its last complete value
// and closed, it still yields the fields that precede the large one.

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const OPEN_BRACE = 0x7b;
const CLOSE_BRACE = 0x7d;
const OPEN_BRACKET = 0x5b;
const CLOSE_BRACKET = 0x5d;
const COMMA = 0x2c;
const COLON = 0x3a;

function isWhitespace(byte: number): boolean {
  return byte === 0x20 || byte === 0x0a || byte === 0x0d || byte === 0x09;
}

/** The index just past the closing quote of the string starting at `quote`; null if it never ends. */
function stringEnd(bytes: Uint8Array, quote: number): number | null {
  let index = quote + 1;
  while (index < bytes.length) {
    const byte = bytes[index];
    if (byte === BACKSLASH) index += 2;
    else if (byte === QUOTE) return index + 1;
    else index += 1;
  }
  return null;
}

/** Where a token that is not a string or container ends; null when the bytes end first. */
function tokenEnd(bytes: Uint8Array, start: number): number | null {
  for (let index = start; index < bytes.length; index += 1) {
    const byte = bytes[index] as number;
    if (byte === COMMA || byte === CLOSE_BRACE || byte === CLOSE_BRACKET || isWhitespace(byte)) {
      return index > start ? index : null;
    }
  }
  return null;
}

/** A literal or a number, checked loosely: the decoder that reads the repaired bytes decides. */
function isScalarToken(bytes: Uint8Array, start: number, end: number): boolean {
  let token = '';
  for (let i = start; i < end; i += 1) token += String.fromCharCode(bytes[i] as number);
  return token === 'true' || token === 'false' || token === 'null' || /^[0-9+\-.eE]*$/.test(token);
}

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

type Outcome =
  | { type: 'complete' }
  | { type: 'malformed' }
  | { type: 'truncated'; cut: number; openContainers: number[] };

function scan(bytes: Uint8Array): Outcome {
  const stack: number[] = [];
  const state: { expectation: Expectation } = { expectation: 'root' };
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
      state.expectation = 'done';
    } else {
      state.expectation = 'separatorOrEnd';
      markSafe(position);
    }
  };
  const cutShort = (): Outcome =>
    safeCut === null || safeDepth > stack.length
      ? { type: 'malformed' }
      : { type: 'truncated', cut: safeCut, openContainers: stack.slice(0, safeDepth) };

  while (index < bytes.length) {
    const byte = bytes[index] as number;
    if (isWhitespace(byte)) {
      index += 1;
      continue;
    }
    switch (state.expectation) {
      case 'done':
        return { type: 'malformed' };
      case 'root':
        if (byte !== OPEN_BRACE) return { type: 'malformed' };
        stack.push(byte);
        index += 1;
        state.expectation = 'keyOrEnd';
        markSafe(index);
        break;
      case 'keyOrEnd':
      case 'key': {
        if (state.expectation === 'keyOrEnd' && byte === CLOSE_BRACE) {
          stack.pop();
          index += 1;
          finishValue(index);
          break;
        }
        if (byte !== QUOTE) return { type: 'malformed' };
        const end = stringEnd(bytes, index);
        if (end === null) return cutShort();
        index = end;
        state.expectation = 'colon';
        break;
      }
      case 'colon':
        if (byte !== COLON) return { type: 'malformed' };
        index += 1;
        state.expectation = 'objectValue';
        break;
      case 'objectValue':
      case 'arrayValue':
      case 'arrayValueOrEnd': {
        if (state.expectation === 'arrayValueOrEnd' && byte === CLOSE_BRACKET) {
          stack.pop();
          index += 1;
          finishValue(index);
          break;
        }
        if (byte === OPEN_BRACE || byte === OPEN_BRACKET) {
          stack.push(byte);
          index += 1;
          state.expectation = byte === OPEN_BRACE ? 'keyOrEnd' : 'arrayValueOrEnd';
          markSafe(index);
        } else if (byte === QUOTE) {
          const end = stringEnd(bytes, index);
          if (end === null) return cutShort();
          index = end;
          finishValue(index);
        } else {
          const end = tokenEnd(bytes, index);
          if (end === null) return cutShort();
          if (!isScalarToken(bytes, index, end)) return { type: 'malformed' };
          index = end;
          finishValue(index);
        }
        break;
      }
      case 'separatorOrEnd': {
        const open = stack[stack.length - 1];
        if (open === undefined) return { type: 'malformed' };
        if (byte === COMMA) {
          index += 1;
          state.expectation = open === OPEN_BRACE ? 'key' : 'arrayValue';
        } else if (
          (byte === CLOSE_BRACE && open === OPEN_BRACE) ||
          (byte === CLOSE_BRACKET && open === OPEN_BRACKET)
        ) {
          stack.pop();
          index += 1;
          finishValue(index);
        } else {
          return { type: 'malformed' };
        }
        break;
      }
    }
  }
  return state.expectation === 'done' ? { type: 'complete' } : cutShort();
}

/** True when `data` holds exactly one complete JSON object, surrounded by whitespace at most. */
export function isCompleteJsonObject(data: Uint8Array): boolean {
  return scan(data).type === 'complete';
}

/**
 * `data`, a prefix of one JSON object, cut back to its last complete value and closed so it parses.
 * Null when the prefix is not the start of an object or has no complete value at all.
 */
export function repairedJsonPrefix(data: Uint8Array): Uint8Array | null {
  const outcome = scan(data);
  if (outcome.type === 'complete') return data;
  if (outcome.type === 'malformed') return null;
  const closers = [...outcome.openContainers]
    .reverse()
    .map((open) => (open === OPEN_BRACE ? CLOSE_BRACE : CLOSE_BRACKET));
  const out = new Uint8Array(outcome.cut + closers.length);
  out.set(data.subarray(0, outcome.cut), 0);
  out.set(closers, outcome.cut);
  return out;
}
