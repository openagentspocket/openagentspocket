// Small text helpers shared by the hosts module. Core has no DOM lib, so no
// TextEncoder or btoa: these stay dependency-free.

const EDGE_SPACES = /^[\t\p{Zs}]+|[\t\p{Zs}]+$/gu;

/**
 * Trims spaces and tabs (Unicode Zs + U+0009) from both ends, as Swift's
 * `trimmingCharacters(in: .whitespaces)` does. Newlines are kept on purpose.
 */
export function trimSpaces(text: string): string {
  return text.replace(EDGE_SPACES, '');
}

/** UTF-8 byte length of `text`; a lone surrogate counts as U+FFFD (3 bytes). */
export function utf8Length(text: string): number {
  let length = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    length += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return length;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Standard base64 with `=` padding. */
export function encodeBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    out += BASE64_ALPHABET[(triple >> 18) & 63];
    out += BASE64_ALPHABET[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[(triple >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? BASE64_ALPHABET[triple & 63] : '=';
  }
  return out;
}

/** Strict standard base64 (padding required); null for anything else. */
export function decodeBase64(text: string): Uint8Array | null {
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null;
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((text.length / 4) * 3 - padding);
  let byte = 0;
  for (let i = 0; i < text.length; i += 4) {
    let triple = 0;
    for (let j = 0; j < 4; j++) {
      const char = text[i + j] ?? '=';
      triple = (triple << 6) | (char === '=' ? 0 : BASE64_ALPHABET.indexOf(char));
    }
    for (const shift of [16, 8, 0]) {
      if (byte < bytes.length) bytes[byte++] = (triple >> shift) & 0xff;
    }
  }
  return bytes;
}
