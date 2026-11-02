import { decodeUtf8, encodeUtf8 } from '../events/utf8';

/**
 * A "byte string": a JS string whose every UTF-16 unit is one byte (0-255). Paths and patch
 * bytes are bytes, not text: this keeps them usable as Map keys, comparable with `<` in byte
 * order, searchable with `indexOf`, and lossless until they are shown. The Swift app used `Data`.
 */
export type ByteString = string;

export function fromBytes(bytes: Uint8Array): ByteString {
  let out = '';
  for (let start = 0; start < bytes.length; start += 8192) {
    out += String.fromCharCode(...bytes.subarray(start, start + 8192));
  }
  return out;
}

export function toBytes(bytes: ByteString): Uint8Array {
  const out = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index++) out[index] = bytes.charCodeAt(index) & 0xff;
  return out;
}

/** Text as the UTF-8 bytes a Host would hold for it. */
export function encodeText(text: string): ByteString {
  return fromBytes(encodeUtf8(text));
}

/** Bytes as text, malformed UTF-8 replaced by U+FFFD. */
export function decodeBytes(bytes: ByteString): string {
  return decodeUtf8(toBytes(bytes));
}

/**
 * Bytes as one line of display text: lossy UTF-8 with control characters shown as visible
 * symbols (Control Pictures, U+2400 plus the C0 code point), so a newline or tab in a name stays
 * on one row and remains identifiable.
 */
export function displayText(bytes: ByteString): string {
  let out = '';
  for (const char of decodeBytes(bytes)) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x1f) out += String.fromCodePoint(0x2400 + code);
    else if (code === 0x7f) out += String.fromCodePoint(0x2421);
    else out += char;
  }
  return out;
}
