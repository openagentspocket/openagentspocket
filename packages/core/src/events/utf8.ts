/**
 * UTF-8 for NDJSON lines, without relying on platform TextEncoder/Decoder
 * (core targets plain ES2022). Invalid input decodes to U+FFFD.
 */
export function encodeUtf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0xfffd;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      // Lone surrogates encode as U+FFFD, like TextEncoder.
      const unit = code >= 0xd800 && code <= 0xdfff ? 0xfffd : code;
      bytes.push(0xe0 | (unit >> 12), 0x80 | ((unit >> 6) & 0x3f), 0x80 | (unit & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

const REPLACEMENT = 0xfffd;

/** Sequence length and minimum code point by lead byte; 0 means invalid. */
function sequence(lead: number): [length: number, min: number, bits: number] {
  if (lead >= 0xc2 && lead <= 0xdf) return [2, 0x80, lead & 0x1f];
  if (lead >= 0xe0 && lead <= 0xef) return [3, 0x800, lead & 0x0f];
  if (lead >= 0xf0 && lead <= 0xf4) return [4, 0x10000, lead & 0x07];
  return [0, 0, 0];
}

export function decodeUtf8(bytes: Uint8Array): string {
  const codes: number[] = [];
  let index = 0;
  while (index < bytes.length) {
    const lead = bytes[index] as number;
    if (lead < 0x80) {
      codes.push(lead);
      index += 1;
      continue;
    }
    const [length, min, bits] = sequence(lead);
    let code = bits;
    let used = 1;
    while (used < length) {
      const next = bytes[index + used];
      if (next === undefined || (next & 0xc0) !== 0x80) break;
      code = (code << 6) | (next & 0x3f);
      used += 1;
    }
    const valid = length > 0 && used === length && code >= min && code <= 0x10ffff;
    const surrogate = code >= 0xd800 && code <= 0xdfff;
    codes.push(valid && !surrogate ? code : REPLACEMENT);
    index += Math.max(used, 1);
  }
  let text = '';
  for (let start = 0; start < codes.length; start += 8192) {
    text += String.fromCodePoint(...codes.slice(start, start + 8192));
  }
  return text;
}
