import { describe, expect, it } from 'vitest';
import { utf8Encode } from '../pairing/bytes';
import { PASTE_PREVIEW_LIMIT, pasteLineCount } from './paste-preview';
import { PasteReviewer } from './paste-review';
import {
  containsOnlySafeScalars,
  encodePaste,
  isMultiline,
  normalizingNewlines,
} from './text-safety';

function live() {
  const writes: Uint8Array[] = [];
  const reviewer = new PasteReviewer();
  reviewer.bind({ write: (bytes) => writes.push(bytes) });
  return { reviewer, writes };
}
const text = (bytes: Uint8Array | undefined) =>
  bytes ? new TextDecoder().decode(bytes) : undefined;

describe('PasteReviewer', () => {
  it('inserts a single safe line immediately', () => {
    const { reviewer, writes } = live();
    expect(reviewer.request('git status')).toEqual({ kind: 'inserted' });
    expect(text(writes[0])).toBe('git status');
    expect(reviewer.pending).toBeNull();
  });

  it('holds multi-line text for review and confirms it as one write', () => {
    const { reviewer, writes } = live();
    const pasted = 'printf one\nprintf two\n';
    const result = reviewer.request(pasted);
    expect(result.kind).toBe('requiresReview');
    expect(reviewer.pending).toMatchObject({
      lineCount: 3,
      characterCount: pasted.length,
      preview: pasted,
    });
    expect(writes).toEqual([]);
    expect(reviewer.confirm()).toBe(true);
    expect(writes).toHaveLength(1);
    expect(text(writes[0])).toBe(pasted);
    expect(reviewer.pending).toBeNull();
    expect(reviewer.confirm()).toBe(false);
  });

  it('cancel is the safe default and writes nothing', () => {
    const { reviewer, writes } = live();
    reviewer.request('one\ntwo');
    reviewer.cancel();
    expect(reviewer.pending).toBeNull();
    expect(writes).toEqual([]);
  });

  it.each([
    'nul\u0000hidden',
    'escape\u001b[31m',
    'control\u001fhidden',
    'delete\u007fhidden',
    'c1\u0085hidden',
  ])('rejects control characters in %j', (unsafe) => {
    const { reviewer, writes } = live();
    expect(reviewer.request(unsafe)).toEqual({ kind: 'rejected' });
    expect(reviewer.blockedByUnsafeText).toBe(true);
    expect(reviewer.pending).toBeNull();
    expect(writes).toEqual([]);
    reviewer.clearBlocked();
    expect(reviewer.blockedByUnsafeText).toBe(false);
  });

  it('a rejected paste also drops a review that was waiting', () => {
    const { reviewer } = live();
    reviewer.request('one\ntwo');
    reviewer.request('bad\u001b');
    expect(reviewer.pending).toBeNull();
  });

  it('blocks while no session is live', () => {
    expect(new PasteReviewer().request('anything')).toEqual({ kind: 'blocked' });
  });

  it('frames a reviewed paste with the mode captured at request time', () => {
    const { reviewer, writes } = live();
    reviewer.request('a\nb', { bracketedPaste: true });
    reviewer.confirm();
    expect(text(writes[0])).toBe('\u001b[200~a\nb\u001b[201~');
  });

  it('a pending review survives a pipeline replacement and submits once on the new writer', () => {
    const { reviewer, writes } = live();
    reviewer.request('git status\ngit diff', { bracketedPaste: true });
    const review = reviewer.pending;
    reviewer.unbind({ preservingPendingPaste: true });
    expect(reviewer.canConfirm).toBe(false);
    expect(reviewer.confirm()).toBe(false);
    expect(reviewer.pending).toEqual(review);
    const replacement: Uint8Array[] = [];
    reviewer.bind({ write: (bytes) => replacement.push(bytes) });
    expect(reviewer.canConfirm).toBe(true);
    expect(reviewer.confirm()).toBe(true);
    expect(replacement).toHaveLength(1);
    expect(reviewer.confirm()).toBe(false);
    expect(writes).toEqual([]);
  });

  it('an ordinary session end cancels the review', () => {
    const { reviewer } = live();
    reviewer.request('a\nb');
    reviewer.unbind();
    expect(reviewer.pending).toBeNull();
    expect(reviewer.canConfirm).toBe(false);
  });

  it('bounds the preview without changing the confirmed content', () => {
    const { reviewer, writes } = live();
    const long = `${'x'.repeat(3000)}\nsecond`;
    reviewer.request(long);
    const preview = reviewer.pending?.preview ?? '';
    expect(preview.length).toBeLessThan(long.length);
    expect(preview.endsWith('…')).toBe(true);
    expect(Array.from(preview)).toHaveLength(PASTE_PREVIEW_LIMIT + 1);
    reviewer.confirm();
    expect(text(writes[0])).toBe(long);
  });
});

describe('text safety', () => {
  it('allows tab, LF and CR and rejects other controls', () => {
    expect(containsOnlySafeScalars('a\tb\r\nc')).toBe(true);
    expect(containsOnlySafeScalars('日本語 🙂')).toBe(true);
    expect(containsOnlySafeScalars('a\u0007b')).toBe(false);
  });

  it('normalises CRLF and lone CR to LF, and sees CRLF as multiline', () => {
    expect(normalizingNewlines('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
    expect(isMultiline('a\r\nb')).toBe(true);
    expect(isMultiline('single')).toBe(false);
  });

  it('counts lines with CRLF as one break', () => {
    expect(pasteLineCount('a\r\nb\rc\nd')).toBe(4);
    expect(pasteLineCount('one')).toBe(1);
  });

  it('frames bracketed paste only when asked', () => {
    expect(encodePaste('hi', false)).toEqual(utf8Encode('hi'));
    const framed = encodePaste('hi', true);
    expect(Array.from(framed.slice(0, 6))).toEqual([0x1b, 0x5b, 0x32, 0x30, 0x30, 0x7e]);
    expect(Array.from(framed.slice(-6))).toEqual([0x1b, 0x5b, 0x32, 0x30, 0x31, 0x7e]);
    expect(framed).toHaveLength(14);
  });
});
