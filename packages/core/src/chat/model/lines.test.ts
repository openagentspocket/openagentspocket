// Ported from Swift ChatLineFramerTests.

import { describe, expect, it } from 'vitest';
import { decodeUtf8, encodeUtf8 } from '../../events/utf8';
import { frameLines, isTruncatedLine, JsonlLineFramer } from './lines';

const text = (lines: ReturnType<typeof frameLines>) => lines.map((line) => decodeUtf8(line.data));

describe('JsonlLineFramer', () => {
  const sample = '{"a":1}\n{"b":"é"}\n\n{"c":3}\n';

  it('yields the same lines whatever the read size', () => {
    const bytes = encodeUtf8(sample);
    const whole = frameLines(bytes);
    for (const size of [1, 2, 3, 7, 64, 4096]) {
      const framer = new JsonlLineFramer({ startOffset: 0 });
      const lines = [];
      for (let at = 0; at < bytes.length; at += size)
        lines.push(...framer.append(bytes.subarray(at, at + size)));
      expect(lines).toEqual(whole);
    }
  });

  it('carries file offsets and skips empty lines', () => {
    const lines = frameLines(encodeUtf8(sample));
    expect(text(lines)).toEqual(['{"a":1}', '{"b":"é"}', '{"c":3}']);
    expect(lines.map((line) => line.offset)).toEqual([0, 8, 20]);
    expect(lines.map((line) => line.length)).toEqual([7, 10, 7]);
  });

  it('holds a partial last line until its newline arrives', () => {
    const framer = new JsonlLineFramer({ startOffset: 0 });
    expect(text(framer.append(encodeUtf8('{"a":1}\n{"b"')))).toEqual(['{"a":1}']);
    expect(framer.pendingByteCount).toBe(4);
    expect(text(framer.append(encodeUtf8(':2}\n')))).toEqual(['{"b":2}']);
    expect(framer.processedEnd).toBe(16);
  });

  it('a tail window skips its leading fragment, a head window does not', () => {
    const bytes = encodeUtf8('0123456789\nabc\n');
    const tail = new JsonlLineFramer({ startOffset: 4, dropsLeadingFragment: true });
    expect(text(tail.append(bytes.subarray(4)))).toEqual(['abc']);
    expect(tail.deliveryStart).toBe(11);
    const head = new JsonlLineFramer({ startOffset: 0, dropsLeadingFragment: true });
    expect(text(head.append(bytes))).toEqual(['0123456789', 'abc']);
    expect(head.deliveryStart).toBe(0);
  });

  it('a line over the cap keeps only its prefix and its true length', () => {
    const long = 'x'.repeat(100);
    const lines = frameLines(encodeUtf8(`ok\n${long}\nafter\n`), { lineCap: 40, prefixCap: 8 });
    expect(lines).toHaveLength(3);
    const cut = lines[1];
    expect(cut?.length).toBe(100);
    expect(decodeUtf8(cut?.data ?? new Uint8Array())).toBe('xxxxxxxx');
    expect(cut && isTruncatedLine(cut)).toBe(true);
    expect(lines[2]?.offset).toBe(3 + 101);
  });
});
