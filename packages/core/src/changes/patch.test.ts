import { describe, expect, it } from 'vitest';
import { encodeText } from './bytes';
import { NONCE, recording } from './fixtures';
import { filePatchRequest, parsePatch } from './patch';
import { parsePatchFiles } from './patch-parser';
import { Cap } from './script';
import { makeFile } from './status';
import { ChangesReadError, type DiffFile, type FilePatch, type FilePatchRequest } from './types';

const request = (over: Partial<FilePatchRequest> = {}): FilePatchRequest => ({
  topLevel: '/home/dev/app',
  path: 'a.txt',
  originalPath: null,
  isUntracked: false,
  limit: 'initial',
  ...over,
});

function patch(
  body: string,
  over: { rc?: number; req?: Partial<FilePatchRequest>; messages?: string } = {},
): FilePatch {
  return parsePatch(
    recording([{ name: 'patch', body, rc: over.rc ?? 0, messages: over.messages }]),
    NONCE,
    request(over.req),
  );
}

function only(file: FilePatch): DiffFile {
  expect(file.files).toHaveLength(1);
  return file.files[0] as DiffFile;
}

const MODIFIED = [
  'diff --git a/a.txt b/a.txt',
  'index 1111111..2222222 100644',
  '--- a/a.txt',
  '+++ b/a.txt',
  '@@ -1,3 +1,3 @@ func main()',
  ' one',
  '-two',
  '+TWO',
  ' three',
  '',
].join('\n');

describe('patch parsing', () => {
  it('a modified file carries old and new lines with numbers and stable ids', () => {
    const file = only(patch(MODIFIED));
    expect(file.oldPath).toBe('a.txt');
    expect(file.newPath).toBe('a.txt');
    const [hunk] = file.hunks;
    expect(hunk?.section).toBe('func main()');
    expect(hunk?.lines.map((l) => [l.id, l.kind, l.oldNumber, l.newNumber, l.text])).toEqual([
      [0, 'context', 1, 1, 'one'],
      [1, 'removed', 2, null, 'two'],
      [2, 'added', null, 2, 'TWO'],
      [3, 'context', 3, 3, 'three'],
    ]);
  });

  it('an empty line is a blank context line, keeping later numbers', () => {
    const body = 'diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1,3 +1,3 @@\n one\n\n+x\n-y\n';
    const lines = only(patch(body)).hunks[0]?.lines ?? [];
    expect(lines.map((l) => [l.kind, l.oldNumber, l.newNumber])).toEqual([
      ['context', 1, 1],
      ['context', 2, 2],
      ['added', null, 3],
      ['removed', 3, null],
    ]);
  });

  it('content that looks like a file header stays inside its hunk', () => {
    const body = 'diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n--- a/fake\n+++ b/fake\n';
    const file = only(patch(body));
    expect(file.hunks[0]?.lines.map((l) => l.text)).toEqual(['-- a/fake', '++ b/fake']);
    expect(file.newPath).toBe('a');
  });

  it('separate hunks restart numbers and continue identities', () => {
    const body = [
      'diff --git a/a b/a',
      '--- a/a',
      '+++ b/a',
      '@@ -1,1 +1,1 @@',
      '-a',
      '+b',
      '@@ -20 +20 @@',
      '-c',
      '+d',
      '',
    ].join('\n');
    const file = only(patch(body));
    expect(file.hunks.map((h) => [h.id, h.oldStart, h.oldCount, h.newCount])).toEqual([
      [0, 1, 1, 1],
      [1, 20, 1, 1],
    ]);
    expect(file.hunks[1]?.lines.map((l) => l.id)).toEqual([2, 3]);
    expect(file.hunks[1]?.lines[0]?.oldNumber).toBe(20);
  });

  it('new, deleted and untracked files have only the matching side', () => {
    const added = only(
      patch(
        'diff --git a/n b/n\nnew file mode 100644\n--- /dev/null\n+++ b/n\n@@ -0,0 +1,2 @@\n+a\n+b\n',
      ),
    );
    expect(added.oldPath).toBeNull();
    expect(added.hunks[0]?.lines.map((l) => [l.kind, l.oldNumber, l.newNumber])).toEqual([
      ['added', null, 1],
      ['added', null, 2],
    ]);
    const deleted = only(
      patch(
        'diff --git a/d b/d\ndeleted file mode 100644\n--- a/d\n+++ /dev/null\n@@ -1 +0,0 @@\n-a\n',
      ),
    );
    expect(deleted.newPath).toBeNull();
    const untracked = patch(
      'diff --git a/dev/null b/u.txt\nnew file mode 100644\n--- /dev/null\n+++ b/u.txt\n@@ -0,0 +1 @@\n+hi\n',
      { rc: 1, req: { isUntracked: true } },
    );
    expect(only(untracked).hunks[0]?.lines).toHaveLength(1);
  });

  it('pure renames and mode changes explain their metadata', () => {
    const renamed = only(
      patch('diff --git a/old b/new\nsimilarity index 100%\nrename from old\nrename to new\n'),
    );
    expect(renamed.hunks).toEqual([]);
    expect(renamed.notes).toContainEqual({ kind: 'renamed', from: 'old', to: 'new' });
    const mode = only(patch('diff --git a/s b/s\nold mode 100644\nnew mode 100755\n'));
    expect(mode.notes).toContainEqual({ kind: 'mode', from: '100644', to: '100755' });
  });

  it('missing newlines and CRLF stay separate display lines', () => {
    const body =
      'diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1,2 +1,2 @@\r\n one\r\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n';
    const lines = only(patch(body)).hunks[0]?.lines ?? [];
    expect(lines.map((l) => [l.text, l.missingNewline])).toEqual([
      ['one', false],
      ['old', true],
      ['new', true],
    ]);
  });

  it('conflict markers are ordinary added lines against HEAD', () => {
    const body =
      'diff --git a/c b/c\n--- a/c\n+++ b/c\n@@ -1 +1,5 @@\n+<<<<<<< HEAD\n+a\n+=======\n+b\n+>>>>>>> other\n';
    expect(only(patch(body)).hunks[0]?.lines.every((l) => l.kind === 'added')).toBe(true);
  });

  it('binary files are labelled and have no hunks', () => {
    const file = only(
      patch('diff --git a/b.bin b/b.bin\nBinary files a/b.bin and b/b.bin differ\n'),
    );
    expect(file.isBinary).toBe(true);
    expect(file.hunks).toEqual([]);
    expect(file.notes).toContainEqual({ kind: 'binary' });
  });

  it('non-UTF-8 content decodes lossily and C-quoted paths recover their bytes', () => {
    const body = encodeText(
      'diff --git "a/caf\\303\\251 \\"q\\".txt" "b/caf\\303\\251 \\"q\\".txt"\n--- "a/caf\\303\\251 \\"q\\".txt"\n+++ "b/caf\\303\\251 \\"q\\".txt"\n@@ -1 +1 @@\n-x\n',
    );
    const withBad = `${body}+ÿþ\n`;
    const file = only(patch(withBad));
    expect(file.newPath).toBe('café "q".txt');
    expect(file.hunks[0]?.lines[1]?.text).toBe('��');
  });

  it('header paths containing spaces and " b/" resolve to equal paths', () => {
    const files = parsePatchFiles('diff --git a/x b/y b/x b/y\n', false);
    expect(files[0]?.oldPath).toBe('x b/y');
    expect(files[0]?.newPath).toBe('x b/y');
  });

  it('two sections in one request (an edited rename below the similarity threshold)', () => {
    const body =
      'diff --git a/new b/new\nnew file mode 100644\n--- /dev/null\n+++ b/new\n@@ -0,0 +1 @@\n+a\n' +
      'diff --git a/old b/old\ndeleted file mode 100644\n--- a/old\n+++ /dev/null\n@@ -1 +0,0 @@\n-b\n';
    expect(patch(body).files.map((f) => f.id)).toEqual([0, 1]);
  });

  it('empty files, and files cut before their first hunk, are distinct', () => {
    const empty = only(patch('diff --git a/e b/e\nnew file mode 100644\nindex 0000000..e69de29\n'));
    expect(empty.notes).toContainEqual({ kind: 'newEmpty' });
    const cut = parsePatchFiles('diff --git a/e b/e\nnew file mode 100644\n', true)[0];
    expect(cut?.notes).not.toContainEqual({ kind: 'newEmpty' });
    expect(patch('').files).toEqual([]);
  });
});

describe('patch framing', () => {
  it('requires the framed status and the final marker', () => {
    const rec = recording([{ name: 'patch', body: MODIFIED }], { done: false });
    expect(() => parsePatch(rec, NONCE, request())).toThrowError(ChangesReadError);
    const other = recording([{ name: 'patch', body: MODIFIED }], { nonce: 'BEEF' });
    expect(() => parsePatch(other, NONCE, request())).toThrowError(ChangesReadError);
  });

  it('an untracked read succeeds with status 1 only when a patch header arrived', () => {
    expect(() => patch('', { rc: 1, req: { isUntracked: true } })).toThrowError(ChangesReadError);
    expect(() => patch(MODIFIED, { rc: 1, req: { isUntracked: false } })).toThrowError(
      ChangesReadError,
    );
  });

  it('a length overrun drops the partial line even with a zero exit status', () => {
    const lines = 'diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n';
    const long = `+${'x'.repeat(Cap.patch)}`;
    const result = patch(lines + long);
    expect(result.isTruncated).toBe(true);
    expect(result.files[0]?.hunks[0]?.lines).toEqual([]);
  });

  it('a cut before the first hunk does not claim the new file is empty', () => {
    const body = `diff --git a/n b/n\nnew file mode 100644\n${'#'.repeat(Cap.patch)}`;
    const result = patch(body);
    expect(result.isTruncated).toBe(true);
    expect(result.files[0]?.notes).not.toContainEqual({ kind: 'newEmpty' });
  });

  it('untracked directories have no file patch', () => {
    const checkout = { topLevel: '/r', isLinkedWorktree: false, displayPath: '~/r' };
    expect(filePatchRequest(makeFile('dir/', 'untracked'), checkout)).toBeNull();
    expect(filePatchRequest(makeFile('dir/a', 'untracked'), checkout)?.isUntracked).toBe(true);
  });
});
