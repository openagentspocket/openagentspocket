import { describe, expect, it } from 'vitest';
import { decodeBytes, encodeText } from './bytes';
import {
  type ChangesSpec,
  changesRecording,
  conflict,
  headers,
  NONCE,
  ordinary,
  type Recording,
  recording,
  rename,
  VERSION,
} from './fixtures';
import { parseChanges } from './parse-changes';
import { Cap } from './script';
import { ChangesReadError, type ChangesReadReason } from './types';

const parse = (rec: Recording, nonce = NONCE) => parseChanges(rec, nonce);

function reasonOf(rec: Recording, nonce = NONCE): ChangesReadReason | null {
  try {
    parse(rec, nonce);
    return null;
  } catch (thrown) {
    if (thrown instanceof ChangesReadError) return thrown.reason;
    throw thrown;
  }
}

const rows = (spec: ChangesSpec) =>
  parse(changesRecording(spec)).changes.files.map((file) => ({
    path: decodeBytes(file.path),
    kind: file.kind,
    staging: file.staging,
    original: file.originalPath === null ? undefined : decodeBytes(file.originalPath),
  }));

const HOSTILE_STATUS =
  headers() +
  ordinary('.M', '$HOME.txt') +
  ordinary('.M', '*.txt') +
  ordinary('.M', '-dash.txt') +
  ordinary('A.', 'added.txt') +
  ordinary('.M', 'bin.dat') +
  ordinary('.D', 'gone.txt') +
  ordinary('.M', 'line\nbreak.txt') +
  rename('R.', 'pkg/renamed.txt', 'old/name.txt') +
  ordinary('MM', 'sp ace.txt') +
  ordinary('M.', 'tab\tname.txt') +
  ordinary('.M', encodeText('ünï.txt')) +
  conflict('conflict.txt') +
  '? newdir/\0? untracked.txt\0';

describe('Changes parsing: status', () => {
  it('parses hostile names, renames, conflicts and untracked files exactly', () => {
    const read = parse(changesRecording({ status: HOSTILE_STATUS }));
    const { changes } = read;
    expect(changes.checkout.topLevel).toBe('/home/dev/src/app');
    expect(changes.checkout.displayPath).toBe('~/src/app');
    expect(changes.checkout.isLinkedWorktree).toBe(false);
    expect(read.directoryPrefix).toBe('');
    expect(changes.head.branch).toEqual({ kind: 'named', name: 'main' });
    expect(changes.head.commit).toBe('a7d75683c107bbe72aad2574b0ba0e6c47629e08');
    expect(changes.head.latestCommit).toEqual({
      subject: 'Main edit to "conflict.txt"',
      committedAt: 1_790_587_800_000,
    });
    // Conflicted first, then raw path byte order; untracked directories stay collapsed.
    expect(changes.files.map((f) => `${decodeBytes(f.path)}|${f.kind}|${f.staging}`)).toEqual([
      'conflict.txt|conflicted|null',
      '$HOME.txt|modified|unstaged',
      '*.txt|modified|unstaged',
      '-dash.txt|modified|unstaged',
      'added.txt|added|staged',
      'bin.dat|modified|unstaged',
      'gone.txt|deleted|unstaged',
      'line\nbreak.txt|modified|unstaged',
      'newdir/|untracked|null',
      'pkg/renamed.txt|renamed|staged',
      'sp ace.txt|modified|both',
      'tab\tname.txt|modified|staged',
      'untracked.txt|untracked|null',
      'ünï.txt|modified|unstaged',
    ]);
    const renamed = changes.files.find((f) => f.kind === 'renamed');
    expect(renamed?.originalPath).toBe('old/name.txt');
  });

  it('an intent-to-add move reads as a deletion plus an addition', () => {
    const status =
      headers() +
      `2 .R N... 100644 100644 100644 ${'a'.repeat(40)} ${'a'.repeat(40)} R100 new.txt\0old.txt\0`;
    expect(rows({ status })).toEqual([
      { path: 'new.txt', kind: 'added', staging: 'unstaged', original: undefined },
      { path: 'old.txt', kind: 'deleted', staging: 'unstaged', original: undefined },
    ]);
  });

  it('an intent-to-add move of a staged rename keeps the rename and gains the deletion', () => {
    const status =
      headers() +
      rename('R.', 'mid.txt', 'old.txt') +
      `2 .R N... 100644 100644 100644 ${'a'.repeat(40)} ${'a'.repeat(40)} R100 final.txt\0mid.txt\0`;
    expect(rows({ status })).toEqual([
      { path: 'final.txt', kind: 'added', staging: 'unstaged', original: undefined },
      { path: 'mid.txt', kind: 'renamed', staging: 'both', original: 'old.txt' },
    ]);
  });

  it('every directory in a Checkout reads the same Changes; the prefix stays outside', () => {
    const discover = {
      name: 'discover',
      body: '/home/dev/src/app\npkg/\n/home/dev/src/app/.git\n../.git\n',
    };
    const read = parse(changesRecording({ discover, status: HOSTILE_STATUS }));
    expect(read.directoryPrefix).toBe('pkg/');
    expect(read.changes.files).toEqual(
      parse(changesRecording({ status: HOSTILE_STATUS })).changes.files,
    );
  });

  it('names a linked worktree on a detached head', () => {
    const discover = {
      name: 'discover',
      body: '/home/dev/wt\n\n/home/dev/src/app/.git/worktrees/wt\n/home/dev/src/app/.git\n',
    };
    const status = '# branch.oid 1234567890abcdef\0# branch.head (detached)\0';
    const { changes } = parse(changesRecording({ discover, status }));
    expect(changes.checkout.isLinkedWorktree).toBe(true);
    expect(changes.head.branch).toEqual({ kind: 'detached' });
    expect(changes.head.commit).toBe('1234567890abcdef');
  });

  it('a clean checkout has no files', () => {
    const { changes } = parse(changesRecording());
    expect(changes.files).toEqual([]);
    expect(changes.isStatusTruncated).toBe(false);
  });

  it('an unborn head has no commit but still has changes', () => {
    const status = '# branch.oid (initial)\0# branch.head main\0? a.txt\0';
    const { changes } = parse(changesRecording({ status, head: '', headRc: 0 }));
    expect(changes.head.isUnborn).toBe(true);
    expect(changes.head.commit).toBeNull();
    expect(changes.head.latestCommit).toBeNull();
    expect(changes.files).toHaveLength(1);
  });

  it('sha256 object ids parse', () => {
    const oid = 'b'.repeat(64);
    const { changes } = parse(
      changesRecording({ status: `# branch.oid ${oid}\0# branch.head main\0` }),
    );
    expect(changes.head.commit).toBe(oid);
  });

  it('upstream headers tolerate ordering and do not mistake malformed counts for deletion', () => {
    const early =
      '# branch.upstream origin/main\0# branch.ab +2 -1\0# branch.oid abc\0# branch.head main\0';
    const late =
      '# branch.oid abc\0# branch.head main\0# branch.upstream origin/main\0# branch.ab +2 -1\0';
    const tracking = { name: 'origin/main', state: { kind: 'tracking', ahead: 2, behind: 1 } };
    expect(parse(changesRecording({ status: early })).changes.head.upstream).toEqual(tracking);
    expect(parse(changesRecording({ status: late })).changes.head.upstream).toEqual(tracking);
    const gone = '# branch.oid abc\0# branch.head main\0# branch.upstream origin/main\0';
    expect(parse(changesRecording({ status: gone })).changes.head.upstream?.state).toEqual({
      kind: 'deleted',
    });
    const bad = '# branch.oid abc\0# branch.head main\0# branch.upstream o/m\0# branch.ab +x -1\0';
    expect(parse(changesRecording({ status: bad })).changes.head.upstream?.state).toEqual({
      kind: 'unknown',
    });
  });

  it('an unborn head does not claim its upstream was deleted', () => {
    const status = '# branch.oid (initial)\0# branch.head main\0# branch.upstream o/main\0';
    expect(parse(changesRecording({ status })).changes.head.upstream?.state).toEqual({
      kind: 'unknown',
    });
  });

  it('changes inside a submodule produce one row', () => {
    const status = `${headers()}1 .M S.M. 160000 160000 160000 ${'a'.repeat(40)} ${'a'.repeat(40)} libs/sub\0`;
    expect(rows({ status })).toHaveLength(1);
  });
});

describe('Changes parsing: framing and failures', () => {
  it('ignores login-shell noise on both streams', () => {
    const rec = changesRecording({ status: HOSTILE_STATUS });
    const noisy = {
      stdout: `Last login: now\nwelcome\n${rec.stdout}bye\n`,
      stderr: `warn\n${rec.stderr}`,
    };
    expect(parse(noisy).changes.files).toHaveLength(14);
  });

  it.each(['version', 'home', 'discover', 'status', 'numstat', 'head'])(
    'a missing framed %s is incomplete',
    (name) => {
      const rec = changesRecording({ status: headers() });
      const cut = rec.stdout.replace(`${name} rc=0`, `${name} lost`);
      expect(reasonOf({ stdout: cut, stderr: rec.stderr })?.kind).toBe('incomplete');
    },
  );

  it('a status killed before its number is incomplete', () => {
    const rec = changesRecording();
    const cut = rec.stdout.replace(/status rc=0\n/, 'status rc=');
    expect(reasonOf({ stdout: cut, stderr: rec.stderr })?.kind).toBe('incomplete');
  });

  it('a missing final marker is incomplete even after successful commands', () => {
    expect(reasonOf(changesRecording({}, { done: false }))?.kind).toBe('incomplete');
  });

  it('markers carrying another request nonce are ignored', () => {
    expect(reasonOf(changesRecording(), 'BEEF')?.kind).toBe('incomplete');
  });

  it('output over its cap is cut and marked truncated by length alone', () => {
    const records = ordinary('.M', 'x'.repeat(1000)).repeat(Math.ceil(Cap.status / 1000) + 2);
    const read = parse(changesRecording({ status: headers() + records }));
    expect(read.changes.isStatusTruncated).toBe(true);
    // Only complete records survive the cut.
    expect(read.changes.files.every((f) => f.path.length === 1000)).toBe(true);
  });

  it('a status with no complete files is not a clean checkout', () => {
    const read = parse(changesRecording({ status: 'x'.repeat(Cap.status + 5) }));
    expect(read.changes.files).toEqual([]);
    expect(read.changes.isStatusTruncated).toBe(true);
  });

  it('a directory outside any working tree is not a git working tree', () => {
    const discover = {
      name: 'discover',
      body: '',
      rc: 128,
      messages: 'fatal: not a git repository (or any of the parent directories): .git\n',
    };
    expect(reasonOf(changesRecording({ discover }))).toEqual({ kind: 'notAGitWorkingTree' });
    const emptyTop = { name: 'discover', body: '\n\n/x/.git\n.\n' };
    expect(reasonOf(changesRecording({ discover: emptyTop }))).toEqual({
      kind: 'notAGitWorkingTree',
    });
  });

  it('classifies discovery failures by git first framed line', () => {
    const fail = (messages: string) =>
      reasonOf(changesRecording({ discover: { name: 'discover', body: '', rc: 128, messages } }));
    expect(fail('fatal: detected dubious ownership in repository at /x\n')).toEqual({
      kind: 'notOwnedByAccount',
    });
    expect(fail("fatal: cannot change to '/x': No such file or directory\n")).toEqual({
      kind: 'directoryMissing',
    });
    expect(fail("fatal: cannot change to '/x': Permission denied\n")).toEqual({
      kind: 'gitFailed',
      line: "fatal: cannot change to '/x': Permission denied",
    });
    expect(fail('')).toEqual({ kind: 'gitFailed', line: 'git exited with status 128.' });
    // Diagnostic words inside a path never change the classification.
    expect(fail("fatal: cannot change to '/not a git repository': Permission denied\n")?.kind).toBe(
      'gitFailed',
    );
  });

  it.each(['git version 2.16.9', 'git version 1.9.1', 'git version 0.99'])(
    'old version %s wins over later unknown-option errors',
    (line) => {
      const version = { name: 'version', body: `${line}\n` };
      const discover = {
        name: 'discover',
        body: '',
        rc: 129,
        messages: 'error: unknown option `show-prefix`\n',
      };
      expect(reasonOf(changesRecording({ version, discover }))?.kind).toBe('gitTooOld');
    },
  );

  it.each([
    'git version 2.17.0',
    'git version 2.54.0 (Apple Git-157)',
    'git version 3.0.1.windows.1',
  ])('supported version %s loads', (line) => {
    expect(
      reasonOf(changesRecording({ version: { name: 'version', body: `${line}\n` } })),
    ).toBeNull();
  });

  it('git missing has its own state, including developer-tools stubs', () => {
    const missing = { name: 'version', body: '', rc: 127, messages: 'sh: git: not found\n' };
    expect(reasonOf(changesRecording({ version: missing }))).toEqual({ kind: 'gitMissing' });
    const stub = {
      name: 'version',
      body: '',
      rc: 1,
      messages: 'xcode-select: note: No developer tools were found, requesting install.\n',
    };
    expect(reasonOf(changesRecording({ version: stub }))).toEqual({ kind: 'gitMissing' });
  });

  it('a failed count command reports the git failure; a capped one only marks metadata', () => {
    expect(reasonOf(changesRecording({ numstatRc: 128 }))?.kind).toBe('gitFailed');
    const big = `1\t0\t${'p'.repeat(Cap.numstat + 10)}\0`;
    const read = parse(changesRecording({ numstat: big, numstatRc: 141 }));
    expect(read.changes.isMetadataTruncated).toBe(true);
    expect(read.changes.totals.linesAreComplete).toBe(false);
  });

  it('a top level containing a line break cannot be read', () => {
    const discover = { name: 'discover', body: '/a\nb\n\n/a/.git\n.git\n' };
    expect(reasonOf(changesRecording({ discover }))).toEqual({ kind: 'lineBreakInPath' });
  });

  it('shortens the home directory only on a path boundary', () => {
    const at = (body: string) =>
      parse(changesRecording({ discover: { name: 'discover', body } })).changes.checkout
        .displayPath;
    expect(at('/home/dev\n\n/home/dev/.git\n.git\n')).toBe('~');
    expect(at('/home/devious/app\n\n/x/.git\n.git\n')).toBe('/home/devious/app');
  });
});

describe('recording helper', () => {
  it('frames sections the way the script prints them', () => {
    const rec = recording([{ name: 'version', body: VERSION }]);
    expect(rec.stdout).toContain(`\n__AGENTICO_GIT_${NONCE}__ version rc=0\n`);
  });
});
