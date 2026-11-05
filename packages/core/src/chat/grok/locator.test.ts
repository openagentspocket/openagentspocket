import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../../events/utf8';
import { FakeHostFiles } from '../model/fake-host-files';
import type {
  HostFileKind,
  HostFileListing,
  HostFileListingRequest,
  HostFileRange,
  HostFileSlice,
  HostFileStatus,
} from '../model/host-files';
import { frameLines } from '../model/lines';
import { GrokTranscriptLocator, groupName, sessionIDInHead, slugForDirectory } from './locator';
import { groupDirectoryOfTranscript } from './locator-paths';

const SESSION = '01900000-0000-7000-8000-000000000010';
const OTHER = '01900000-0000-7000-8000-000000000011';
/** The ids in `grok/fork-head.jsonl`: the fork, and the session whose records it copied. */
const FORK = '01900000-0000-7000-8000-000000000002';
const PARENT = '01900000-0000-7000-8000-000000000001';
const CWD = '/home/dev/proj';
const ROOT = '/home/dev/.grok/sessions';
const GROUP = '%2Fhome%2Fdev%2Fproj';
/** A directory whose group name would run past 255 bytes. */
const LONG_DIRECTORY = `/home/dev/${'深层目录/'.repeat(8)}My App`;

/** The Host's files, recording what the locator asked of it. */
class RecordingFiles extends FakeHostFiles {
  override homePath = '/home/dev';
  statuses: string[] = [];
  listings: HostFileListingRequest[] = [];
  reads: string[] = [];

  override async status(path: string): Promise<HostFileStatus | null> {
    this.statuses.push(path);
    return super.status(path);
  }

  override async list(request: HostFileListingRequest): Promise<HostFileListing | null> {
    this.listings.push(request);
    return super.list(request);
  }

  override async read(range: HostFileRange): Promise<HostFileSlice> {
    this.reads.push(range.path);
    return super.read(range);
  }
}

const transcriptPath = (group = GROUP, sessionID = SESSION) =>
  `${ROOT}/${group}/${sessionID}/updates.jsonl`;

/** Grok Build's first record: `sessionId` names the session, and `eventId` the session that first wrote it. */
const record = (sessionID: string, eventPrefix = sessionID) =>
  `{"timestamp":1792422477,"method":"_x.ai/session/update","params":{"sessionId":"${sessionID}","update":{"sessionUpdate":"hook_execution","event_name":"session_start","runs":[]},"_meta":{"eventId":"${eventPrefix}-1","agentTimestampMs":1792421871074}}}\n`;

/** The record as a reader sees it while Grok writes it: cut `count` bytes into the session id. */
const recordCutInsideID = (count: number) => {
  const text = record(SESSION);
  return text.slice(0, text.indexOf(SESSION)) + SESSION.slice(0, count);
};

const locate = (
  files: RecordingFiles,
  options: { sessionID?: string; directories?: string[]; groupBudget?: number } = {},
) => {
  const locator = new GrokTranscriptLocator(files);
  if (options.groupBudget !== undefined) locator.groupBudget = options.groupBudget;
  return locator.locate(options.sessionID ?? SESSION, options.directories ?? [CWD]);
};

describe('Grok Build transcript locator', () => {
  it("finds the session in the pane directory's group", async () => {
    const files = new RecordingFiles();
    const path = transcriptPath();
    files.write(path, record(SESSION));

    expect(await locate(files)).toEqual({ ok: true, path });
    // The session's folder, then its file; no listing.
    expect(files.statuses).toEqual([`${ROOT}/${GROUP}/${SESSION}`, path]);
    expect(files.listings).toEqual([]);
    expect(groupDirectoryOfTranscript(path)).toBe(`${ROOT}/${GROUP}`);
  });

  it.each([
    ['/home/dev/My Project', '%2Fhome%2Fdev%2FMy%20Project'],
    ['/home/dev/café', '%2Fhome%2Fdev%2Fcaf%C3%A9'],
    ['/home/dev/a-b_c.d~e', '%2Fhome%2Fdev%2Fa-b_c.d~e'],
    ['/srv/x+y:z%', '%2Fsrv%2Fx%2By%3Az%25'],
    [`/${'a'.repeat(252)}`, `%2F${'a'.repeat(252)}`],
    [`/${'a'.repeat(253)}`, null],
  ])('encodes the group name of %s like Grok', (directory, expected) => {
    // Every byte outside A-Z a-z 0-9 - _ . ~ as uppercase %XX, at most 255 bytes in all.
    expect(groupName(directory)).toBe(expected);
  });

  it('tries the foreground directory first', async () => {
    const files = new RecordingFiles();
    const path = transcriptPath();
    files.write(path, record(SESSION));

    expect(await locate(files, { directories: ['/home/dev/proj/web', CWD] })).toEqual({
      ok: true,
      path,
    });
    expect(files.statuses).toEqual([
      `${ROOT}/%2Fhome%2Fdev%2Fproj%2Fweb/${SESSION}`,
      `${ROOT}/${GROUP}/${SESSION}`,
      path,
    ]);
    expect(files.listings).toEqual([]);
  });

  it('finds a long directory by its slug and `.cwd` file', async () => {
    const files = new RecordingFiles();
    const group = 'my-app-0123456789abcdef';
    files.write(`${ROOT}/${group}/.cwd`, LONG_DIRECTORY);
    // Named like the slug, but not `<slug>-<16 hex>`: never read.
    files.write(`${ROOT}/my-app-0000/.cwd`, LONG_DIRECTORY);
    const path = transcriptPath(group);
    files.write(path, record(SESSION));

    expect(groupName(LONG_DIRECTORY)).toBeNull();
    expect(await locate(files, { directories: [LONG_DIRECTORY] })).toEqual({ ok: true, path });
    expect(files.listings.map((request) => request.namePrefix)).toEqual(['my-app-']);
    expect(files.listings[0]?.kinds).toEqual(['directory' satisfies HostFileKind]);
    expect(files.reads).not.toContain(`${ROOT}/my-app-0000/.cwd`);
  });

  it.each([
    ['My App', 'my-app'],
    ['__init__', 'init'],
    ['深层目录', 'workspace'],
    ['Café Ünïcode', 'caf-n-code'],
    [`${'a'.repeat(39)} bcdef`, `${'a'.repeat(39)}-`],
    ['v2.0-RC1', 'v2-0-rc1'],
  ])('slugs %s like Grok', (name, expected) => {
    // Lowercased; each run of anything but ASCII letters and digits one `-`; trimmed of `-`, then
    // cut to 40, so a cut can end on `-`.
    expect(slugForDirectory(`/home/dev/${name}`)).toBe(expected);
  });

  it('skips a slug group whose `.cwd` file names another directory', async () => {
    const files = new RecordingFiles();
    const other = `/home/dev/${'其他目录/'.repeat(8)}My App`;
    const otherGroup = 'my-app-0000000000000001';
    files.write(`${ROOT}/${otherGroup}/.cwd`, other);
    files.mkdir(`${ROOT}/${otherGroup}/${OTHER}`);
    const group = 'my-app-fedcba9876543210';
    files.write(`${ROOT}/${group}/.cwd`, LONG_DIRECTORY);
    const path = transcriptPath(group);
    files.write(path, record(SESSION));

    expect(await locate(files, { directories: [LONG_DIRECTORY] })).toEqual({ ok: true, path });
    // Listed first and read, but nothing in it was looked at.
    expect(files.reads).toContain(`${ROOT}/${otherGroup}/.cwd`);
    expect(files.statuses.every((status) => !status.startsWith(`${ROOT}/${otherGroup}/`))).toBe(
      true,
    );
  });

  it('searches worktree groups before the rest', async () => {
    const files = new RecordingFiles();
    const worktree = '%2Fhome%2Fdev%2F.grok%2Fworktrees%2Fproj%2F2026-10-19-8f50828d';
    for (const group of ['%2Fapp', GROUP, worktree, '%2Fsrv%2Fdata'])
      files.mkdir(`${ROOT}/${group}`);
    const path = transcriptPath(worktree);
    files.write(path, record(SESSION));

    expect(await locate(files)).toEqual({ ok: true, path });
    // The pane's group, then the worktree's, ahead of `%2Fapp`, which lists first.
    expect(files.statuses).toEqual([
      `${ROOT}/${GROUP}/${SESSION}`,
      `${ROOT}/${worktree}/${SESSION}`,
      path,
    ]);
  });

  it('reports a partial search when the budget runs out', async () => {
    const files = new RecordingFiles();
    for (let index = 0; index < 6; index += 1) files.mkdir(`${ROOT}/%2Fsrv%2Fp${index}`);
    const path = transcriptPath('%2Fsrv%2Fp5');
    files.write(path, record(SESSION));

    expect(await locate(files, { groupBudget: 3 })).toEqual({
      ok: false,
      reason: { type: 'notFound', searchedAll: false },
    });
    expect(await locate(files, { groupBudget: 20 })).toEqual({ ok: true, path });

    // Without the file, or its folder, every group was searched.
    const without = new RecordingFiles();
    for (let index = 0; index < 6; index += 1) without.mkdir(`${ROOT}/%2Fsrv%2Fp${index}`);
    expect(await locate(without, { groupBudget: 20 })).toEqual({
      ok: false,
      reason: { type: 'notFound', searchedAll: true },
    });
  });

  it('treats a session folder without updates as not found yet', async () => {
    const files = new RecordingFiles();
    files.write(`${ROOT}/${GROUP}/${SESSION}/summary.json`, '{}');
    const path = transcriptPath();
    const notYet = { ok: false, reason: { type: 'notFound', searchedAll: false } };

    expect(await locate(files)).toEqual(notYet);
    // The session's folder is here, so no other group is searched.
    expect(files.listings).toEqual([]);

    // Grok writes the file next, then its first record.
    files.write(path, new Uint8Array(0));
    expect(await locate(files)).toEqual(notYet);
    files.write(path, recordCutInsideID(8));
    expect(await locate(files)).toEqual(notYet);

    files.write(path, record(SESSION));
    expect(await locate(files)).toEqual({ ok: true, path });
  });

  it('rejects a head that names another session', async () => {
    const files = new RecordingFiles();
    files.write(transcriptPath(), record(OTHER));
    expect(await locate(files)).toEqual({ ok: false, reason: { type: 'mismatched' } });
  });

  it("accepts a fork whose copied records keep the parent's event ids", async () => {
    const fixture = join(__dirname, '../../../goldens/grok/transcripts/fork-head.jsonl');
    const head = new Uint8Array(readFileSync(fixture));
    const first = frameLines(head)[0];
    const text = new TextDecoder().decode(first?.data);
    expect(text).toContain(`"sessionId":"${FORK}"`);
    expect(text).toContain(`"eventId":"${PARENT}-`);
    const files = new RecordingFiles();
    const fork = transcriptPath(GROUP, FORK);
    files.write(fork, head);
    // A copy under the parent's name is not the parent's.
    files.write(transcriptPath(GROUP, PARENT), head);

    expect(await locate(files, { sessionID: FORK })).toEqual({ ok: true, path: fork });
    expect(await locate(files, { sessionID: PARENT })).toEqual({
      ok: false,
      reason: { type: 'mismatched' },
    });
  });

  it('reads the first session id in the head', () => {
    const bytes = (text: string) => encodeUtf8(text);
    expect(sessionIDInHead(bytes(record(SESSION) + record(OTHER)))).toBe(SESSION);
    expect(sessionIDInHead(bytes(record(SESSION, OTHER)))).toBe(SESSION);
    // Nothing yet: an empty head, or one cut before the id ends.
    expect(sessionIDInHead(new Uint8Array(0))).toBeNull();
    expect(sessionIDInHead(bytes(recordCutInsideID(35)))).toBeNull();
    // A slice of a larger read reads the same.
    expect(sessionIDInHead(bytes(`\n${record(OTHER)}`).subarray(1))).toBe(OTHER);
  });
});
