import { describe, expect, it } from 'vitest';
import { utf8Encode } from '../pairing/bytes';
import { AttachLinkIndex, MAXIMUM_ATTACH_LINKS } from './link-index';
import { isOpenableLink } from './link-policy';

function indexOf(...chunks: string[]): AttachLinkIndex {
  const index = new AttachLinkIndex();
  for (const chunk of chunks) index.receive(utf8Encode(chunk));
  index.finishOutput();
  return index;
}
const targets = (index: AttachLinkIndex) => index.links.map((l) => l.target);

describe('link policy', () => {
  it('opens only http(s) links with a host', () => {
    expect(isOpenableLink('https://example.com/a')).toBe(true);
    expect(isOpenableLink('HTTP://localhost:3000')).toBe(true);
    expect(isOpenableLink('https://user@[::1]:8080/x')).toBe(true);
    for (const bad of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'ssh://host',
      'https://',
      'http://:80',
      'https://a b',
    ]) {
      expect(isOpenableLink(bad)).toBe(false);
    }
  });
});

describe('AttachLinkIndex stream discovery', () => {
  it('finds a link split across chunks', () => {
    expect(targets(indexOf('see https://exa', 'mple.com/pa', 'th now'))).toEqual([
      'https://example.com/path',
    ]);
  });

  it('strips sentence punctuation and unbalanced closing brackets only', () => {
    expect(targets(indexOf('(https://a.dev/x). '))).toEqual(['https://a.dev/x']);
    expect(targets(indexOf('https://a.dev/wiki/F_(x), '))).toEqual(['https://a.dev/wiki/F_(x)']);
    expect(targets(indexOf('go to https://a.dev/x!!! '))).toEqual(['https://a.dev/x']);
  });

  it('ends a candidate at quotes and angle brackets', () => {
    expect(targets(indexOf('<a href="https://a.dev/q">x</a>'))).toEqual(['https://a.dev/q']);
  });

  it('is transparent to SGR styling but ends at other CSI controls', () => {
    expect(targets(indexOf('\x1b[34mhttps://a.dev/\x1b[0mpath '))).toEqual(['https://a.dev/path']);
    expect(targets(indexOf('https://a.dev/\x1b[2Kpath '))).toEqual(['https://a.dev/']);
  });

  it('recognises schemes case-insensitively and ignores other schemes', () => {
    expect(targets(indexOf('HTTPS://A.dev/x file:///etc/passwd ftp://x.dev '))).toEqual([
      'HTTPS://A.dev/x',
    ]);
  });

  it('reads the real destination of an OSC 8 hyperlink, not its label', () => {
    const osc = '\x1b]8;;https://real.dev/target\x1b\\https://fake.dev/label\x1b]8;;\x1b\\ ';
    expect(targets(indexOf(osc))).toEqual(['https://real.dev/target']);
    expect(targets(indexOf('\x1b]8;id=1;https://bel.dev/\x07label\x1b]8;;\x07'))).toEqual([
      'https://bel.dev/',
    ]);
  });

  it('drops an OSC 8 target that is not an openable link', () => {
    expect(targets(indexOf('\x1b]8;;file:///etc/passwd\x1b\\click\x1b]8;;\x1b\\'))).toEqual([]);
  });

  it('keeps a multi-byte character inside a link instead of reading its bytes as C1 controls', () => {
    expect(targets(indexOf('https://a.dev/€uro '))).toEqual(['https://a.dev/€uro']);
  });

  it('flushes an open candidate at the end of output', () => {
    expect(targets(indexOf('tail https://a.dev/end'))).toEqual(['https://a.dev/end']);
  });

  it('lists newest first, moves a repeat to the front and caps the list', () => {
    const index = indexOf('https://a.dev/1 https://a.dev/2 https://a.dev/1 ');
    expect(targets(index)).toEqual(['https://a.dev/1', 'https://a.dev/2']);
    const many = indexOf(...Array.from({ length: 25 }, (_, i) => `https://a.dev/${i} `));
    expect(many.links).toHaveLength(MAXIMUM_ATTACH_LINKS);
    expect(many.links[0]?.target).toBe('https://a.dev/24');
  });

  it('reports the host and clears everything', () => {
    const index = indexOf('https://docs.example.org/x ');
    expect(index.links[0]?.host).toBe('docs.example.org');
    index.clear();
    expect(index.links).toEqual([]);
  });
});

describe('AttachLinkIndex viewport discovery', () => {
  it('adds viewport links without reordering an existing one', () => {
    const index = indexOf('https://a.dev/1 https://a.dev/2 ');
    index.receiveViewportText('https://a.dev/1\nhttps://a.dev/3');
    expect(targets(index)).toEqual(['https://a.dev/3', 'https://a.dev/2', 'https://a.dev/1']);
  });

  it('keeps only the longest of a viewport prefix family', () => {
    const index = new AttachLinkIndex();
    index.receiveViewportText('https://a.dev/lo');
    index.receiveViewportText('https://a.dev/long/path');
    expect(targets(index)).toEqual(['https://a.dev/long/path']);
    index.receiveViewportText('https://a.dev/lo');
    expect(targets(index)).toEqual(['https://a.dev/long/path']);
  });

  it('keeps a shorter target the stream actually observed', () => {
    const index = indexOf('https://a.dev/lo ');
    index.receiveViewportText('https://a.dev/long/path');
    expect(targets(index)).toEqual(['https://a.dev/long/path', 'https://a.dev/lo']);
  });

  it('treats newlines in a snapshot as hard boundaries', () => {
    const index = new AttachLinkIndex();
    index.receiveViewportText('https://a.dev/very-lo\nng-path');
    expect(targets(index)).toEqual(['https://a.dev/very-lo']);
  });
});
