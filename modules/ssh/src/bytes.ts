/**
 * Byte helpers for the bridge: bytes cross to and from native code as base64,
 * and herdr speaks UTF-8 JSON lines. Pure, so they behave the same in Hermes
 * and in Node (no reliance on Buffer, atob or TextDecoder).
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

const sextet = (n: number, shift: number) => ALPHABET.charAt((n >> shift) & 63);

export function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    parts.push(sextet(n, 18) + sextet(n, 12) + sextet(n, 6) + sextet(n, 0));
  }
  const rest = bytes.length - i;
  if (rest > 0) {
    const n = ((bytes[i] ?? 0) << 16) | (rest === 2 ? (bytes[i + 1] ?? 0) << 8 : 0);
    parts.push(sextet(n, 18) + sextet(n, 12) + (rest === 2 ? `${sextet(n, 6)}=` : '=='));
  }
  return parts.join('');
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[=\s]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    const digit = code < 128 ? (LOOKUP[code] ?? -1) : -1;
    if (digit < 0) throw new Error('invalid base64');
    value = (value << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (value >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

/** Decodes UTF-8, replacing malformed sequences with U+FFFD (like TextDecoder). */
export function utf8Decode(bytes: Uint8Array): string {
  const codes: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i] ?? 0;
    const need =
      b < 0x80
        ? 0
        : b >= 0xc2 && b < 0xe0
          ? 1
          : b >= 0xe0 && b < 0xf0
            ? 2
            : b < 0xf5 && b >= 0xf0
              ? 3
              : -1;
    if (need < 0) {
      codes.push(0xfffd);
      i++;
      continue;
    }
    let c = need === 0 ? b : b & (0x3f >> need);
    let ok = i + need < bytes.length;
    for (let k = 1; ok && k <= need; k++) {
      const next = bytes[i + k] ?? 0;
      if ((next & 0xc0) !== 0x80) ok = false;
      else c = (c << 6) | (next & 63);
    }
    const min = need === 1 ? 0x80 : need === 2 ? 0x800 : 0x10000;
    if (!ok || (need > 0 && c < min) || c > 0x10ffff || (c >= 0xd800 && c <= 0xdfff)) {
      codes.push(0xfffd);
      i++;
      continue;
    }
    codes.push(c);
    i += need + 1;
  }
  let out = '';
  for (let j = 0; j < codes.length; j += 4096) {
    out += String.fromCodePoint(...codes.slice(j, j + 4096));
  }
  return out;
}
