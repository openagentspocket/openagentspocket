import '../programs';
import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../../events/utf8';
import type { LocateState } from '../engine/locate';
import { FakeHostFiles } from '../model/fake-host-files';
import { relativeToDirectory } from '../model/preview';
import { piAdapter } from './adapter';
import { numberedHunks, patchPaths } from './file-changes';
import { locatePiTranscript } from './locate';
import { PiTranscriptLocator, piProjectKey, piSessionIDInHead } from './locator';

const ID = 'f3c2a481-54ed-4c7e-a240-6d036157dc80';
const PATH = `/home/test/.pi/agent/sessions/--project--/2026-10-15_${ID}.jsonl`;
const HEADER = `{"type":"session","version":3,"id":"${ID}","cwd":"/project"}`;

const filesWith = (path: string, content: string) => {
  const files = new FakeHostFiles();
  files.homePath = '/home/test';
  files.write(path, content);
  return files;
};

describe('PiTranscriptLocator', () => {
  it('verifies the OMP title slot and the session header', async () => {
    const files = filesWith(PATH, `{"type":"title","v":1,"title":"sample"}\n${HEADER}\n`);
    expect(
      await new PiTranscriptLocator(files).locate({ program: 'omp', sessionID: PATH }, []),
    ).toEqual({
      ok: true,
      path: PATH,
    });
  });

  it('verifies identity instead of picking the newest file by UUID', async () => {
    const files = filesWith(PATH, `${HEADER}\n`);
    const reference = { program: 'pi', sessionID: ID } as const;
    expect(await new PiTranscriptLocator(files).locate(reference, ['/project'])).toEqual({
      ok: true,
      path: PATH,
    });
    const wrong = filesWith(
      PATH,
      `${HEADER.replace(ID, '11111111-1111-4111-8111-111111111111')}\n`,
    );
    expect(await new PiTranscriptLocator(wrong).locate(reference, ['/project'])).toEqual({
      ok: false,
      reason: { type: 'mismatched' },
    });
  });

  it('does not silently misread newer session versions', async () => {
    const files = filesWith(PATH, `${HEADER.replace('"version":3', '"version":9')}\n`);
    expect(
      await new PiTranscriptLocator(files).locate({ program: 'pi', sessionID: PATH }, []),
    ).toEqual({ ok: false, reason: { type: 'unsupportedVersion', version: 9 } });
  });

  it('reports a reported path that is missing or empty as not written yet', async () => {
    const reference = { program: 'omp', sessionID: PATH } as const;
    expect(
      await new PiTranscriptLocator(new FakeHostFiles()).locate(reference, ['/project']),
    ).toEqual({
      ok: false,
      reason: { type: 'notWritten' },
    });
    expect(await new PiTranscriptLocator(filesWith(PATH, '')).locate(reference, [])).toEqual({
      ok: false,
      reason: { type: 'notWritten' },
    });
    // A UUID names no file to wait for: one not found is missing.
    expect(
      await new PiTranscriptLocator(filesWith(PATH, '')).locate({ program: 'pi', sessionID: ID }, [
        '/project',
      ]),
    ).toEqual({ ok: false, reason: { type: 'notFound', searchedAll: true } });
  });

  it('refuses unsafe paths and other programs', async () => {
    const locator = new PiTranscriptLocator(new FakeHostFiles());
    for (const sessionID of ['/tmp/../other.jsonl', '/tmp/x.txt', '/tmp/./x.jsonl']) {
      expect(await locator.locate({ program: 'pi', sessionID }, [])).toEqual({
        ok: false,
        reason: { type: 'mismatched' },
      });
    }
    expect(await locator.locate({ program: 'claude', sessionID: PATH }, [])).toEqual({
      ok: false,
      reason: { type: 'mismatched' },
    });
  });

  it('keys a project directory as Pi does', () => {
    expect(piProjectKey('/home/dev/my:proj')).toBe('--home-dev-my-proj--');
  });

  it('names a conversation by its header, past the OMP title slot', () => {
    const head = encodeUtf8(`{"type":"title","v":1,"title":"x"}\n${HEADER}\n`);
    expect(piSessionIDInHead(head)).toBe(ID);
    expect(piSessionIDInHead(encodeUtf8('{"type":"message"}\n'))).toBeNull();
    expect(piSessionIDInHead(encodeUtf8('{not json'))).toBeNull();
  });
});

describe('locatePiTranscript', () => {
  const state = (files: FakeHostFiles, reference: LocateState['reference'], hasHistory = false) =>
    ({
      reference,
      files,
      now: () => 0,
      directories: ['/project'],
      relocatedDirectory: null,
      lostAMessage: false,
      awaitingFirstMessage: false,
      activity: 'idle',
      newConversationActivity: null,
      accountDirectories: [],
      hasHistory,
    }) satisfies LocateState;

  it('explains each way a session file may be unavailable', async () => {
    const empty = new FakeHostFiles();
    const reference = { program: 'omp', sessionID: PATH } as const;
    expect(await locatePiTranscript(state(empty, reference))).toMatchObject({
      reason: { kind: 'awaitingFirstMessage', program: 'omp' },
    });
    // A file shown before that is gone now is not a conversation still to start.
    expect(await locatePiTranscript(state(empty, reference, true))).toMatchObject({
      reason: { kind: 'notFound', searchedAll: true },
    });
    const newer = filesWith(PATH, `${HEADER.replace('"version":3', '"version":9')}\n`);
    expect(await locatePiTranscript(state(newer, reference))).toMatchObject({
      reason: { kind: 'unsupportedFormat', format: 'Oh My Pi session version 9' },
    });
    expect(
      await locatePiTranscript(state(newer, { program: 'pi', sessionID: PATH })),
    ).toMatchObject({ reason: { format: 'Pi session version 9' } });
    const found = await locatePiTranscript(state(filesWith(PATH, `${HEADER}\n`), reference));
    expect(found).toMatchObject({ type: 'found', path: PATH, segments: [] });
  });
});

describe('Pi adapter', () => {
  it('names the conversation by header, reads the first line and never joins cached history', () => {
    const adapter = piAdapter('omp');
    expect([adapter.program, adapter.wantsFirstLine, adapter.joinsCachedHistory]).toEqual([
      'omp',
      true,
      false,
    ]);
    expect(adapter.echoKey('  hello \n')).toBe('hello');
    expect(adapter.identity?.(encodeUtf8(`${HEADER}\n`))).toBe(ID);
  });
});

describe('paths and patches', () => {
  it('reads paths relative through the private alias', () => {
    expect(relativeToDirectory('/tmp/p/a.txt', '/private/tmp/p')).toBe('a.txt');
    expect(relativeToDirectory('/private/var/p/a.txt', '/var/p/')).toBe('a.txt');
    expect(relativeToDirectory('/tmp/q/a.txt', '/private/tmp/p')).toBe('/tmp/q/a.txt');
    expect(relativeToDirectory('/private/data/p/a.txt', '/data/p')).toBe('/private/data/p/a.txt');
    expect(relativeToDirectory('/private/tmpfiles/a.txt', '/tmpfiles')).toBe(
      '/private/tmpfiles/a.txt',
    );
  });

  it('names the files of an OMP patch in either header form', () => {
    const patch = [
      '*** Begin Patch',
      '*** Add File: hello.txt',
      '+Hello world',
      '*** Update File: src/app.py',
      '*** Move to: src/main.py',
      '@@ def greet():',
      '*** Delete File: obsolete.txt',
      '*** End Patch',
    ];
    expect(patchPaths(patch.join('\n'))).toEqual(['hello.txt', 'src/app.py', 'obsolete.txt']);
    const hashline = [
      '*** Begin Patch',
      '[notes.txt#B6C1]',
      'PUT 2.=2:',
      '+[fake.txt#AAAA]',
      '[src/a b.swift#1F]',
      'CUT 3',
      '[notes.txt#C2D3]',
      '*** End Patch',
    ];
    expect(patchPaths(hashline.join('\n'))).toEqual(['notes.txt', 'src/a b.swift']);
    expect(patchPaths('*** Begin Patch\n[not a header]\n[x#]\n*** End Patch')).toEqual([]);
  });

  it('never reads a context line as a patch header', () => {
    const patch = [
      '*** Begin Patch',
      '*** Update File: config.ini',
      '@@ [server]',
      ' [server#1]',
      '-port = 1',
      '+port = 2',
      '  *** Delete File: kept.txt',
      '*** End Patch',
    ];
    expect(patchPaths(patch.join('\r\n'))).toEqual(['config.ini']);
    expect(patchPaths('[notes.txt#B6C1]  \r\nPUT 2.=2:')).toEqual(['notes.txt']);
  });

  it('splits an OMP numbered diff into hunks', () => {
    const diff = [
      ' 1|a',
      '-2|b',
      '+2|B',
      '+3|B2',
      ' 3|c',
      ' 40|x',
      '-41|y',
      ' 42|z',
      '',
      '+60|tail',
    ].join('\n');
    expect(numberedHunks(diff)).toEqual([
      {
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 4,
        lines: [' a', '-b', '+B', '+B2', ' c'],
      },
      { oldStart: 40, oldLines: 3, newStart: 41, newLines: 2, lines: [' x', '-y', ' z'] },
      { oldStart: 59, oldLines: 0, newStart: 60, newLines: 1, lines: ['+tail'] },
    ]);
    expect(numberedHunks(' 1|a\n@@ -1 +1 @@')).toBeNull();
  });
});
