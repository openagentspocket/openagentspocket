import { describe, expect, it } from 'vitest';
import { decodeBytes } from './bytes';
import {
  type ChangesSpec,
  changesRecording,
  conflict,
  headers,
  NONCE,
  ordinary,
  rename,
} from './fixtures';
import { parseChanges } from './parse-changes';
import { Cap } from './script';

const parse = (rec: { stdout: string; stderr: string }) => parseChanges(rec, NONCE);

describe('Changes parsing: line counts', () => {
  const counts = (spec: ChangesSpec) =>
    Object.fromEntries(
      parse(changesRecording(spec)).changes.files.map((f) => [decodeBytes(f.path), f.lineCounts]),
    );

  it('tracked counts use raw paths and keep untracked items separate', () => {
    const status = headers() + ordinary('.M', 'a.txt') + ordinary('.M', 'bin.dat') + '? new.txt\0';
    const numstat = '3\t1\ta.txt\0-\t-\tbin.dat\0';
    const read = parse(changesRecording({ status, numstat }));
    expect(counts({ status, numstat })).toEqual({
      'a.txt': { kind: 'lines', added: 3, removed: 1 },
      'bin.dat': { kind: 'binary' },
      'new.txt': null,
    });
    expect(read.changes.totals).toEqual({
      trackedFiles: 2,
      untrackedItems: 1,
      added: 3,
      removed: 1,
      linesAreComplete: true,
      linesAreAvailable: true,
    });
  });

  it('a rewritten staged rename combines its addition and deletion', () => {
    const status = headers() + rename('R.', 'new.txt', 'old.txt');
    const numstat = '5\t0\tnew.txt\0';
    expect(counts({ status, numstat })['new.txt']).toBeNull();
    const both = '5\t0\tnew.txt\x002\t7\told.txt\0';
    expect(counts({ status, numstat: both })['new.txt']).toEqual({
      kind: 'lines',
      added: 7,
      removed: 7,
    });
    const direct = '0\t0\t\0old.txt\0new.txt\0';
    expect(counts({ status, numstat: direct })['new.txt']).toEqual({
      kind: 'lines',
      added: 0,
      removed: 0,
    });
  });

  it('duplicate unmerged records neither double count nor erase the change', () => {
    const status = headers() + conflict('c.txt');
    const numstat = '0\t0\tc.txt\x004\t0\tc.txt\0';
    expect(counts({ status, numstat })['c.txt']).toEqual({ kind: 'lines', added: 4, removed: 0 });
    expect(counts({ status, numstat: '4\t0\tc.txt\x000\t0\tc.txt\0' })['c.txt']).toEqual({
      kind: 'lines',
      added: 4,
      removed: 0,
    });
    const read = parse(changesRecording({ status, numstat: '4\t0\tc.txt\x004\t0\tc.txt\0' }));
    expect(read.changes.totals.added).toBe(4);
  });

  it('malformed counts and an incomplete last record stay unknown', () => {
    const status = headers() + ordinary('.M', 'a.txt') + ordinary('.M', 'b.txt');
    const numstat = 'x\t1\ta.txt\x002\t3\tb.txt';
    const read = parse(changesRecording({ status, numstat }));
    expect(read.changes.totals.linesAreComplete).toBe(false);
    expect(counts({ status, numstat })['a.txt']).toBeNull();
  });

  it('a numstat that failed leaves lines unavailable only when it was not capped', () => {
    const read = parse(changesRecording({ numstatRc: 0, numstat: '' }));
    expect(read.changes.totals.linesAreAvailable).toBe(true);
  });

  it('formats a status capped among untracked items as a bound on those only', () => {
    const status = headers() + ordinary('.M', 'a.txt') + '? '.padEnd(Cap.status, 'u');
    const read = parse(changesRecording({ status }));
    expect(read.changes.isStatusTruncated).toBe(true);
    expect(read.changes.totals.trackedFiles).toBe(1);
    expect(read.changes.totals.untrackedItems).toBe(0);
  });
});
