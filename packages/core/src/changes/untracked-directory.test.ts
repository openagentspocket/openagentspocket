import { describe, expect, it } from 'vitest';
import { NONCE, recording } from './fixtures';
import { limitNoticeText } from './presentation';
import { sourceSay } from './say';
import { Cap } from './script';
import { ChangesReadError } from './types';
import { parseUntrackedDirectory } from './untracked-directory';

const listing = (
  body: string,
  options: { rc?: number; messages?: string; directory?: string; limit?: number } = {},
) =>
  parseUntrackedDirectory(
    recording([{ name: 'untracked', body, rc: options.rc, messages: options.messages }]),
    NONCE,
    options.directory ?? 'newdir/',
    options.limit,
  );

const reason = (run: () => unknown) => {
  try {
    run();
  } catch (thrown) {
    if (thrown instanceof ChangesReadError) return thrown.reason;
  }
  return null;
};

describe('untracked directory listing', () => {
  it('keeps untracked bytes, drops tracked rows, sorts by raw path', () => {
    const body = '? newdir/b.txt\0? newdir/a.txt\0? newdir/ü.txt\x001 .M N... 1 1 1 a a x.txt\0';
    const result = listing(body);
    expect(result.entries.map((e) => e.path)).toEqual([
      'newdir/a.txt',
      'newdir/b.txt',
      'newdir/ü.txt',
    ]);
    expect(result.entries.every((e) => e.kind === 'untracked' && e.lineCounts === null)).toBe(true);
    expect(result.total).toBe(3);
    expect(result.limitNotice).toBeNull();
  });

  it('a rename original path is not an untracked file', () => {
    const body = '2 R. N... 1 1 1 a a R100 newdir/new\0newdir/orig\0? newdir/x\0';
    expect(listing(body).entries.map((e) => e.path)).toEqual(['newdir/x']);
  });

  it('a rename cut off before its original path is dropped', () => {
    expect(listing('? newdir/x\x002 R. N... 1 1 1 a a R100 newdir/new\0').entries).toHaveLength(1);
  });

  it('a directory that is its own repository is not a child row', () => {
    const result = listing('? newdir/\0');
    expect(result.entries).toEqual([]);
    expect(result.isSeparateRepository).toBe(true);
  });

  it('an empty status is an empty listing', () => {
    const result = listing('');
    expect(result).toMatchObject({
      entries: [],
      total: 0,
      isSeparateRepository: false,
      limitNotice: null,
    });
  });

  it('the display limit keeps the first entries and reports the total', () => {
    const body = ['c', 'a', 'b', 'd'].map((n) => `? newdir/${n}\0`).join('');
    const result = listing(body, { limit: 2 });
    expect(result.entries.map((e) => e.path)).toEqual(['newdir/a', 'newdir/b']);
    expect(result.total).toBe(4);
    expect(result.limitNotice && limitNoticeText(result.limitNotice, sourceSay)).toBe(
      'Showing 2 of 4 files.',
    );
  });

  it('output over the cap drops the partial record and reports a lower bound', () => {
    const body = `? newdir/ok\0? newdir/${'p'.repeat(Cap.status)}`;
    const result = listing(body);
    expect(result.isTruncated).toBe(true);
    expect(result.entries.map((e) => e.path)).toEqual(['newdir/ok']);
    expect(result.limitNotice?.isLowerBound).toBe(true);
  });

  it('requires the final marker and the framed status; other nonces are ignored', () => {
    const noEnd = recording([{ name: 'untracked', body: '' }], { done: false });
    expect(reason(() => parseUntrackedDirectory(noEnd, NONCE, 'd/'))).toEqual({
      kind: 'incomplete',
    });
    const other = recording([{ name: 'untracked', body: '' }], { nonce: 'BEEF' });
    expect(reason(() => parseUntrackedDirectory(other, NONCE, 'd/'))).toEqual({
      kind: 'incomplete',
    });
    const noSection = recording([]);
    expect(reason(() => parseUntrackedDirectory(noSection, NONCE, 'd/'))).toEqual({
      kind: 'incomplete',
    });
  });

  it('classifies a failed status like a Changes read', () => {
    const missing = reason(() =>
      listing('', {
        rc: 128,
        messages: "fatal: cannot change to '/x': No such file or directory\n",
      }),
    );
    expect(missing).toEqual({ kind: 'directoryMissing' });
    expect(reason(() => listing('', { rc: 2, messages: 'boom\n' }))).toEqual({
      kind: 'gitFailed',
      line: 'boom',
    });
  });
});
