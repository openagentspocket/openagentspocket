import { describe, expect, it } from 'vitest';
import { fromBase64, toBase64, utf8Decode, utf8Encode } from './bytes';

const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));
const pattern = (length: number) => Uint8Array.from({ length }, (_, i) => (i * 131 + 7) % 256);

describe('base64', () => {
  it('encodes the RFC 4648 vectors', () => {
    const vectors: [string, string][] = [
      ['', ''],
      ['f', 'Zg=='],
      ['fo', 'Zm8='],
      ['foo', 'Zm9v'],
      ['foob', 'Zm9vYg=='],
      ['fooba', 'Zm9vYmE='],
      ['foobar', 'Zm9vYmFy'],
    ];
    for (const [plain, encoded] of vectors) {
      expect(toBase64(ascii(plain))).toBe(encoded);
      expect([...fromBase64(encoded)]).toEqual([...ascii(plain)]);
    }
  });

  it('round-trips every byte value and large payloads', () => {
    for (const length of [256, 1000, 65_537, 1_048_576]) {
      const bytes = pattern(length);
      expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    }
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => fromBase64('ab$d')).toThrow();
  });
});

describe('utf8', () => {
  it('encodes 1-4 byte sequences', () => {
    expect([...utf8Encode('a')]).toEqual([0x61]);
    expect([...utf8Encode('ñ')]).toEqual([0xc3, 0xb1]);
    expect([...utf8Encode('你')]).toEqual([0xe4, 0xbd, 0xa0]);
    expect([...utf8Encode('🦝')]).toEqual([0xf0, 0x9f, 0xa6, 0x9d]);
  });

  it('round-trips mixed text', () => {
    const text = 'herdr {"id":"1"} ñandú 你好 🦝 \u0000';
    expect(utf8Decode(utf8Encode(text))).toBe(text);
  });

  it('replaces malformed sequences instead of throwing', () => {
    const decoded = utf8Decode(Uint8Array.from([0x61, 0xff, 0x62, 0xc0, 0xaf, 0xe2, 0x82]));
    expect(decoded.startsWith('a�b')).toBe(true);
    expect(decoded).not.toContain('/');
  });

  it('decodes a 1 MiB payload', () => {
    const big = new Uint8Array(1_048_576).fill(0x61);
    expect(utf8Decode(big).length).toBe(1_048_576);
  });
});
