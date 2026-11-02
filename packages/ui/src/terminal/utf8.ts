/**
 * A UTF-8 decoder that keeps an incomplete trailing character for the next chunk, so a
 * multi-byte character split across two PTY reads decodes whole. Malformed bytes become U+FFFD.
 */
export function decodeUtf8Stream(): (bytes: Uint8Array) => string {
  let pending: number[] = [];
  return (bytes) => {
    const data = pending.length ? Uint8Array.from([...pending, ...bytes]) : bytes;
    let end = data.length;
    // Hold back a trailing lead byte and its continuation bytes when the sequence is incomplete.
    for (let back = 1; back <= Math.min(3, data.length); back++) {
      const byte = data[data.length - back] ?? 0;
      if ((byte & 0xc0) === 0x80) continue;
      const need = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
      if (need > back) end = data.length - back;
      break;
    }
    pending = Array.from(data.subarray(end));
    return decode(data, end);
  };
}

function sequenceLength(lead: number): number {
  if (lead < 0x80) return 1;
  if (lead >= 0xf0) return 4;
  if (lead >= 0xe0) return 3;
  return lead >= 0xc2 ? 2 : 0;
}

function decode(data: Uint8Array, end: number): string {
  let out = '';
  let i = 0;
  while (i < end) {
    const lead = data[i] ?? 0;
    const need = sequenceLength(lead);
    let code = need === 1 ? lead : lead & (0xff >> (need + 1));
    let ok = need > 0 && i + need <= end;
    for (let k = 1; ok && k < need; k++) {
      const next = data[i + k] ?? 0;
      if ((next & 0xc0) !== 0x80) ok = false;
      else code = (code << 6) | (next & 0x3f);
    }
    if (!ok || code > 0x10ffff) {
      out += '�';
      i += 1;
    } else {
      out += String.fromCodePoint(code);
      i += need;
    }
  }
  return out;
}
