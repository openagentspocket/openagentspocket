// Byte helpers the pairing code and ceremony need, in pure TS: the core
// package targets ES2022 only, so no Buffer, atob or TextDecoder.

const STANDARD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const URL_SAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function indexOf(alphabet: string): Map<string, number> {
  return new Map([...alphabet].map((char, index) => [char, index]));
}

const STANDARD_INDEX = indexOf(STANDARD);
const URL_SAFE_INDEX = indexOf(URL_SAFE);

/** Decodes unpadded base64 over one alphabet; null on any foreign character or a bad length. */
function decodeUnpadded(text: string, index: Map<string, number>): Uint8Array | null {
  if (text.length === 0 || text.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let written = 0;
  for (const char of text) {
    const value = index.get(char);
    if (value === undefined) return null;
    buffer = ((buffer << 6) | value) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[written++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

function encodeUnpadded(bytes: Uint8Array, alphabet: string): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const chunk = (a << 16) | (b << 8) | c;
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let k = 0; k < chars; k++) out += alphabet[(chunk >> (18 - 6 * k)) & 0x3f];
  }
  return out;
}

/** Unpadded base64url, as the Pairing Code body and seed use (`-`/`_`, no `=`). */
export function decodeBase64Url(text: string): Uint8Array | null {
  return decodeUnpadded(text, URL_SAFE_INDEX);
}

export function encodeBase64Url(bytes: Uint8Array): string {
  return encodeUnpadded(bytes, URL_SAFE);
}

/** Unpadded standard base64, as OpenSSH prints a SHA256 fingerprint. */
export function decodeBase64(text: string): Uint8Array | null {
  return decodeUnpadded(text, STANDARD_INDEX);
}

export function encodeBase64(bytes: Uint8Array): string {
  return encodeUnpadded(bytes, STANDARD);
}

/** UTF-8 encoding; a lone surrogate becomes U+FFFD, as TextEncoder does. */
export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (const char of text) {
    let code = char.codePointAt(0) ?? 0xfffd;
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000)
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
  }
  return Uint8Array.from(out);
}

export function utf8Length(text: string): number {
  return utf8Encode(text).length;
}

/** The scalar starting at `i` and its byte count, or null when the sequence is not valid UTF-8. */
function scalarAt(bytes: Uint8Array, i: number): [number, number] | null {
  const lead = bytes[i] ?? 0;
  if (lead < 0x80) return [lead, 1];
  const length = lead >= 0xf0 && lead <= 0xf4 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc2 ? 2 : 0;
  if (length === 0 || lead > 0xf4 || i + length > bytes.length) return null;
  let code = lead & (0xff >> (length + 1));
  for (let k = 1; k < length; k++) {
    const next = bytes[i + k] ?? 0;
    if ((next & 0xc0) !== 0x80) return null;
    code = (code << 6) | (next & 0x3f);
  }
  const minimum = [0, 0, 0x80, 0x800, 0x10000][length] ?? 0;
  if (code < minimum || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return null;
  return [code, length];
}

/**
 * Decodes UTF-8. Strict mode returns null on malformed input (the Pairing
 * Code body); lenient mode substitutes U+FFFD (a response line preview).
 */
export function utf8Decode(bytes: Uint8Array, strict: true): string | null;
export function utf8Decode(bytes: Uint8Array, strict?: false): string;
export function utf8Decode(bytes: Uint8Array, strict = false): string | null {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const scalar = scalarAt(bytes, i);
    if (scalar === null) {
      if (strict) return null;
      out += '�';
      i += 1;
      continue;
    }
    out += String.fromCodePoint(scalar[0]);
    i += scalar[1];
  }
  return out;
}
