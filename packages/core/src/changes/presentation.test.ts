import { describe, expect, it } from 'vitest';
import { displayText } from './bytes';
import { sideBySideRows, unchangedLinesBefore } from './diff-layout';
import {
  branchTitle,
  checkoutName,
  commitAge,
  fileDetail,
  fileDirectory,
  fileGroup,
  fileName,
  fileRowDetail,
  kindSymbol,
  limitNoticeText,
  listedSections,
  listLimitNotice,
  readFailureTitle,
  spokenFiles,
  spokenUntracked,
} from './presentation';
import { sourceSay } from './say';
import { makeFile } from './status';
import type {
  ChangedFile,
  ChangesTotals,
  CheckoutChanges,
  DiffFile,
  DiffHunk,
  DiffLine,
} from './types';
import { pairRanges, wordChangeRanges } from './word-changes';

const changes = (files: ChangedFile[], truncated = false): CheckoutChanges => ({
  checkout: { topLevel: '/r', isLinkedWorktree: false, displayPath: '~/work/storefront' },
  head: {
    branch: { kind: 'named', name: 'main' },
    commit: 'abc',
    latestCommit: null,
    upstream: null,
    isUnborn: false,
  },
  files,
  totals: {
    trackedFiles: 0,
    untrackedItems: 0,
    added: 0,
    removed: 0,
    linesAreComplete: true,
    linesAreAvailable: true,
  },
  isStatusTruncated: truncated,
  isMetadataTruncated: false,
});

describe('display text', () => {
  it('shows control characters as visible symbols and decodes lossily', () => {
    expect(displayText('a\nb\tc\u007f')).toBe('a␊b␉c␡');
    expect(displayText('ÿ')).toBe('�');
  });
});

describe('groups and notices', () => {
  const files = [
    makeFile('c', 'conflicted'),
    makeFile('s', 'modified', { staging: 'staged' }),
    makeFile('m', 'modified', { staging: 'unstaged' }),
    makeFile('p', 'modified', { staging: 'both' }),
    makeFile('u', 'untracked'),
  ];

  it('sorts files into Source Control groups; a partly staged file is under Changes', () => {
    expect(files.map(fileGroup)).toEqual([
      'conflicts',
      'staged',
      'changes',
      'changes',
      'untracked',
    ]);
    expect(listedSections(changes(files)).map((s) => [s.group, s.files.length])).toEqual([
      ['conflicts', 1],
      ['staged', 1],
      ['changes', 2],
      ['untracked', 1],
    ]);
  });

  it('the display limit preserves the model; a notice names the exact total', () => {
    const many = Array.from({ length: 2005 }, (_, i) =>
      makeFile(`f${String(i).padStart(4, '0')}`, 'modified'),
    );
    const model = changes(many);
    expect(listedSections(model).flatMap((s) => s.files)).toHaveLength(2000);
    expect(model.files).toHaveLength(2005);
    const notice = listLimitNotice(model);
    expect(notice && limitNoticeText(notice, sourceSay)).toBe(
      'Showing 2000 of 2005 changed files.',
    );
  });

  it('a complete list within the limit needs no notice; a capped one is a lower bound', () => {
    expect(listLimitNotice(changes(files))).toBeNull();
    const capped = listLimitNotice(changes(files, true));
    expect(capped && limitNoticeText(capped, sourceSay)).toBe(
      'Showing 5 of more than 5 changed files.',
    );
    const none = listLimitNotice(changes([], true));
    expect(none && limitNoticeText(none, sourceSay)).toContain('truncated');
  });

  it('a capped status makes the spoken counts lower bounds on the right side', () => {
    const totals = (tracked: number, untracked: number): ChangesTotals => ({
      trackedFiles: tracked,
      untrackedItems: untracked,
      added: 0,
      removed: 0,
      linesAreComplete: true,
      linesAreAvailable: true,
    });
    expect(spokenFiles(totals(3, 0), true, sourceSay)).toBe('more than 3 files changed');
    expect(spokenFiles(totals(3, 2), true, sourceSay)).toBe('3 files changed');
    expect(spokenUntracked(totals(3, 2), true, sourceSay)).toBe('more than 2 untracked items');
    expect(spokenUntracked(totals(3, 0), true, sourceSay)).toBe('untracked items not counted');
    expect(spokenFiles(totals(1, 0), false, sourceSay)).toBe('1 file changed');
  });
});

describe('rows', () => {
  it('splits name and directory; a directory keeps its trailing slash', () => {
    const file = makeFile('Sources/Checkout/Cart.swift', 'modified');
    expect([fileName(file), fileDirectory(file)]).toEqual(['Cart.swift', 'Sources/Checkout']);
    const dir = makeFile('build/out/', 'untracked');
    expect([fileName(dir), fileDirectory(dir)]).toEqual(['out/', 'build']);
    expect(fileRowDetail(makeFile('top.txt', 'modified'), sourceSay)).toBeNull();
  });

  it('a rename reads as where it came from', () => {
    const same = makeFile('b/x.txt', 'renamed', { originalPath: 'a/x.txt', staging: 'staged' });
    expect(fileRowDetail(same, sourceSay)).toBe('a → b');
    const moved = makeFile('b/y.txt', 'renamed', { originalPath: 'b/x.txt', staging: 'staged' });
    expect(fileRowDetail(moved, sourceSay)).toBe('From x.txt · b');
    expect(fileDetail(moved, sourceSay)).toBe('Renamed from b/x.txt · Staged');
  });

  it('letters follow Tide for untracked and conflicted', () => {
    expect(
      ['modified', 'added', 'deleted', 'renamed', 'untracked', 'conflicted'].map((k) =>
        kindSymbol(k as ChangedFile['kind']),
      ),
    ).toEqual(['M', 'A', 'D', 'R', '?', '~']);
  });

  it('names the branch, the detached commit and the checkout', () => {
    const base = changes([]).head;
    expect(branchTitle(base, sourceSay)).toBe('main');
    expect(branchTitle({ ...base, branch: { kind: 'detached' } }, sourceSay)).toBe(
      'Detached at abc',
    );
    expect(checkoutName(changes([]).checkout)).toBe('storefront');
  });

  it('the latest commit age is relative and never in the future', () => {
    const now = 1_000_000_000;
    expect(commitAge(now + 5_000, now)).toBeNull();
    expect(commitAge(now - 30_000, now)).toBeNull();
    expect(commitAge(now - 5 * 60_000, now)).toEqual({ unit: 'minute', count: 5 });
    expect(commitAge(now - 3 * 3_600_000, now)).toEqual({ unit: 'hour', count: 3 });
    expect(commitAge(now - 2 * 86_400_000, now)).toEqual({ unit: 'day', count: 2 });
  });

  it('failure titles distinguish git states', () => {
    expect(readFailureTitle({ kind: 'gitMissing' }, sourceSay)).toBe('Git Not Found');
    expect(readFailureTitle({ kind: 'gitFailed', line: 'x' }, sourceSay)).toBe(
      "Couldn't Read Changes",
    );
  });
});

const line = (id: number, kind: DiffLine['kind'], text = String(id)): DiffLine => ({
  id,
  kind,
  oldNumber: null,
  newNumber: null,
  text,
  missingNewline: false,
});
const hunk = (lines: DiffLine[], over: Partial<DiffHunk> = {}): DiffHunk => ({
  id: 0,
  oldStart: 1,
  oldCount: 1,
  newStart: 1,
  newCount: 1,
  section: '',
  lines,
  ...over,
});

describe('side by side', () => {
  it('pairs a removal run with the additions that follow; context sits on both sides', () => {
    const rows = sideBySideRows(
      hunk([
        line(0, 'context'),
        line(1, 'removed'),
        line(2, 'removed'),
        line(3, 'added'),
        line(4, 'context'),
        line(5, 'added'),
      ]),
    );
    expect(rows.map((r) => [r.id, r.left?.id ?? null, r.right?.id ?? null])).toEqual([
      [0, 0, 0],
      [1, 1, 3],
      [2, 2, null],
      [4, 4, 4],
      [5, null, 5],
    ]);
  });

  it('an added run followed by a removal starts a new block', () => {
    const rows = sideBySideRows(hunk([line(0, 'added'), line(1, 'removed'), line(2, 'added')]));
    expect(rows.map((r) => [r.left?.id ?? null, r.right?.id ?? null])).toEqual([
      [null, 0],
      [1, 2],
    ]);
  });

  it('counts unchanged lines between hunks from the headers', () => {
    const file: DiffFile = {
      id: 0,
      oldPath: 'a',
      newPath: 'a',
      notes: [],
      isBinary: false,
      hunks: [
        hunk([], { oldStart: 10, oldCount: 3 }),
        hunk([], { id: 1, oldStart: 20, oldCount: 0 }),
        hunk([], { id: 2, oldStart: 21, oldCount: 2 }),
      ],
    };
    expect([0, 1, 2, 3].map((i) => unchangedLinesBefore(file, i))).toEqual([9, 8, null, null]);
  });
});

describe('word changes', () => {
  it('highlights the changed word when most tokens are unchanged', () => {
    const result = pairRanges('let total = price * count;', 'let total = cost * count;');
    expect(result).toEqual({ old: [{ start: 12, end: 17 }], new: [{ start: 12, end: 16 }] });
  });

  it('does not highlight unrelated lines, whitespace-only changes or very long lines', () => {
    expect(pairRanges('alpha beta gamma delta', 'one two three four five')).toBeNull();
    expect(pairRanges('  x = 1', '    x = 1')?.new).toEqual([]);
    const long = Array.from({ length: 500 }, (_, i) => `w${i}`).join(' ');
    expect(pairRanges(long, `${long}!`)).toBeNull();
  });

  it('pairs removed and added lines in order within a hunk, up to a maximum', () => {
    const ranges = wordChangeRanges(
      hunk([
        line(0, 'removed', 'a = one'),
        line(1, 'added', 'a = two'),
        line(2, 'context', 'same'),
      ]),
    );
    expect([...ranges.keys()].sort()).toEqual([0, 1]);
    const many = Array.from({ length: 30 }, (_, i) => line(i, 'removed', `x = ${i}a`)).concat(
      Array.from({ length: 30 }, (_, i) => line(100 + i, 'added', `x = ${i}b`)),
    );
    expect(wordChangeRanges(hunk(many)).size).toBe(40);
  });
});
