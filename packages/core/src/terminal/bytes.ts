/** The first index at which `needle` occurs in `hay`, or -1. */
export function indexOfBytes(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  const last = hay.length - needle.length;
  outer: for (let start = from; start <= last; start += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (hay[start + offset] !== needle[offset]) continue outer;
    }
    return start;
  }
  return -1;
}

/** ASCII text as bytes (the control sequences here are all ASCII). */
export function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) out[index] = text.charCodeAt(index);
  return out;
}
