// Ported from Swift ClaudeProjectKeyTests and ClaudeTranscriptLocatorTests.

import { describe, expect, it } from 'vitest';
import { encodeUtf8 } from '../../events/utf8';
import { FakeHostFiles } from '../model/fake-host-files';
import {
  hashSuffix,
  isWorkflowRunID,
  longProjectKeyPrefix,
  projectKey,
  subagentTranscriptPath,
  unnormalizedProjectKey,
  workflowJournalPath,
} from './location';
import {
  acceptableConfigDirectory,
  byClosestName,
  ClaudeTranscriptLocator,
  headVerdict,
  isConfigDirectoryName,
  planLocation,
} from './locator';

describe('project key', () => {
  const short: [string, string][] = [
    ['/home/dev/project', '-home-dev-project'],
    ['/Users/dev/My Project.v2', '-Users-dev-My-Project-v2'],
    ['/home/dev/caf\u00e9', '-home-dev-caf-'],
    ['/home/dev/\u{1F600}', '-home-dev---'],
    ['C:\\Users\\dev\\proj', 'C--Users-dev-proj'],
  ];
  for (const [directory, key] of short) {
    it(`replaces every other unit with a dash: ${key}`, () => {
      expect(projectKey(directory)).toBe(key);
      expect(longProjectKeyPrefix(directory)).toBeNull();
    });
  }

  it('normalizes decomposed names first but keeps the raw form available', () => {
    const decomposed = '/home/dev/cafe\u0301';
    expect(projectKey(decomposed)).toBe('-home-dev-caf-');
    expect(unnormalizedProjectKey(decomposed)).toBe('-home-dev-cafe-');
  });

  it('long keys keep two hundred units and append the hash', () => {
    const ascii = `/home/dev/${'a'.repeat(250)}`;
    const key = projectKey(ascii);
    expect(key).toBe(`-home-dev-${'a'.repeat(190)}-u4xdh7`);
    expect(longProjectKeyPrefix(ascii)).toBe(key.slice(0, 201));
    const emoji = `/home/dev/${'\u{1F600}'.repeat(100)}bbbbbbbbbb`;
    expect(projectKey(emoji)).toBe(`-home-dev-${'-'.repeat(190)}-asy115`);
  });

  it('exactly two hundred units is still exact', () => {
    const directory = `/${'b'.repeat(199)}`;
    expect(projectKey(directory)).toBe(`-${'b'.repeat(199)}`);
    expect(longProjectKeyPrefix(directory)).toBeNull();
    expect(projectKey(`${directory}b`).length).toBeGreaterThan(201);
  });

  it('a hash of Int32.min uses its 64-bit magnitude', () => {
    const directory = `/home/dev/${'a'.repeat(255)}\u92f4\uffff\ufe71`;
    expect(projectKey(directory).endsWith('-zik0zk')).toBe(true);
    expect(
      hashSuffix(Array.from({ length: directory.length }, (_, i) => directory.charCodeAt(i))),
    ).toBe('zik0zk');
  });
});

describe('path safety', () => {
  it('subagent paths stay inside the session directory', () => {
    const session = '/h/.claude/projects/-p/abc.jsonl';
    expect(subagentTranscriptPath(session, 'a9985bf0')).toBe(
      '/h/.claude/projects/-p/abc/subagents/agent-a9985bf0.jsonl',
    );
    for (const bad of ['', '../x', 'a/b', 'a b', 'a.b'])
      expect(subagentTranscriptPath(session, bad)).toBeNull();
    expect(subagentTranscriptPath('/h/x.txt', 'abc')).toBeNull();
  });

  it('workflow journals sit inside the session directory', () => {
    const session = '/h/.claude/projects/-p/abc.jsonl';
    expect(workflowJournalPath(session, 'wf_2d6c7df2-dc3')).toBe(
      '/h/.claude/projects/-p/abc/subagents/workflows/wf_2d6c7df2-dc3/journal.jsonl',
    );
    expect(isWorkflowRunID(`wf_${'a'.repeat(61)}`)).toBe(true);
    for (const bad of ['wf_', `wf_${'a'.repeat(62)}`, 'wf_../x', 'x_abc', 'wf_a/b'])
      expect(isWorkflowRunID(bad)).toBe(false);
  });

  it('config directory names and hints cannot leave their folder', () => {
    expect(isConfigDirectoryName('.claude-work')).toBe(true);
    for (const bad of ['.claude/../x', '.claude\u0000', 'claude', `.claude${'a'.repeat(60)}`])
      expect(isConfigDirectoryName(bad)).toBe(false);
    expect(acceptableConfigDirectory('/home/dev/.claude/')).toBe('/home/dev/.claude');
    for (const bad of ['relative', '/a/../b', '/a/./b'])
      expect(acceptableConfigDirectory(bad)).toBeNull();
  });

  it('closest names come first, then by name', () => {
    expect(byClosestName(['-b', '-home-x', '-home-dev-p', '-a'], '-home-dev-q')).toEqual([
      '-home-dev-p',
      '-home-x',
      '-a',
      '-b',
    ]);
  });
});

const SESSION = '0f0e0d0c-aaaa-bbbb-cccc-1234567890ab';
const record = (extra = '') =>
  `{"type":"user","uuid":"u1","parentUuid":null,"sessionId":"${SESSION}"${extra},"message":{"role":"user","content":"hi"}}\n`;

describe('head verdict', () => {
  it('accepts this session and rejects another or a subagent', () => {
    expect(headVerdict(encodeUtf8(record()), SESSION)).toBe(true);
    expect(headVerdict(encodeUtf8(record()), 'other')).toBe(false);
    expect(headVerdict(encodeUtf8(record(',"isSidechain":true')), SESSION)).toBe(false);
    expect(headVerdict(encodeUtf8(record(',"agentId":"a1"')), SESSION)).toBe(false);
  });
  it('needs more bytes when the head names no session yet', () => {
    expect(headVerdict(encodeUtf8('{"type":"summary"'), SESSION)).toBeNull();
  });
});

describe('locator', () => {
  const home = '/home/dev';
  const dir = '/work/project';
  const key = projectKey(dir);
  const transcript = (config: string, projectDir: string) =>
    `${config}/projects/${projectDir}/${SESSION}.jsonl`;

  function host() {
    const files = new FakeHostFiles();
    files.homePath = home;
    return files;
  }

  it('finds the transcript under the working directory key', async () => {
    const files = host();
    files.write(transcript(`${home}/.claude`, key), record());
    const result = await new ClaudeTranscriptLocator(files).locate({
      sessionID: SESSION,
      directories: [dir],
    });
    expect(result).toEqual({
      ok: true,
      location: {
        projectDirectory: `${home}/.claude/projects/${key}`,
        transcriptPath: transcript(`${home}/.claude`, key),
        sessionID: SESSION,
      },
    });
  });

  it('tries the launch directory after the current one', async () => {
    const files = host();
    files.write(transcript(`${home}/.claude`, projectKey('/work/launch')), record());
    const result = await new ClaudeTranscriptLocator(files).locate({
      sessionID: SESSION,
      directories: [dir, '/work/launch'],
    });
    expect(result.ok).toBe(true);
  });

  it('a relocated session is found by scanning projects, closest name first', async () => {
    const files = host();
    files.write(transcript(`${home}/.claude`, '-work-elsewhere'), record());
    files.mkdir(`${home}/.claude/projects/-unrelated`);
    const result = await new ClaudeTranscriptLocator(files).locate({
      sessionID: SESSION,
      directories: [dir],
    });
    expect(result.ok && result.location.projectDirectory).toBe(
      `${home}/.claude/projects/-work-elsewhere`,
    );
  });

  it('empty files are not transcripts yet', async () => {
    const files = host();
    files.write(transcript(`${home}/.claude`, key), '');
    const result = await new ClaudeTranscriptLocator(files).locate({
      sessionID: SESSION,
      directories: [dir],
    });
    expect(result.ok).toBe(false);
  });

  it('a subagent transcript or another session under the name is rejected', async () => {
    const sub = host();
    sub.write(transcript(`${home}/.claude`, key), record(',"isSidechain":true'));
    expect(
      await new ClaudeTranscriptLocator(sub).locate({ sessionID: SESSION, directories: [dir] }),
    ).toEqual({ ok: false, reason: { type: 'mismatched' } });
    const other = host();
    other.write(transcript(`${home}/.claude`, key), record().replace(SESSION, 'ffffffff-0000'));
    expect(
      await new ClaudeTranscriptLocator(other).locate({ sessionID: SESSION, directories: [dir] }),
    ).toEqual({ ok: false, reason: { type: 'mismatched' } });
  });

  it('a started session with no file yet is not written; otherwise not found', async () => {
    const started = host();
    started.mkdir(`${home}/.claude/projects`);
    started.mkdir(`${home}/.claude/session-env/${SESSION}`);
    expect(
      await new ClaudeTranscriptLocator(started).locate({ sessionID: SESSION, directories: [dir] }),
    ).toEqual({ ok: false, reason: { type: 'notWritten' } });
    const none = host();
    none.mkdir(`${home}/.claude/projects`);
    const result = await new ClaudeTranscriptLocator(none).locate({
      sessionID: SESSION,
      directories: [dir],
    });
    expect(result).toEqual({ ok: false, reason: { type: 'notFound', searchedAll: true } });
  });

  it('the stat budget ends the scan without claiming absence', async () => {
    const files = host();
    for (let i = 0; i < 6; i += 1) files.mkdir(`${home}/.claude/projects/-p${i}`);
    const result = await new ClaudeTranscriptLocator(files, { statBudget: 3 }).locate({
      sessionID: SESSION,
      directories: [dir],
    });
    expect(result).toEqual({ ok: false, reason: { type: 'notFound', searchedAll: false } });
  });

  it('searching the Agent directories alone lists nothing', async () => {
    const files = host();
    files.write(transcript(`${home}/.claude`, '-elsewhere'), record());
    const result = await new ClaudeTranscriptLocator(files).locate({
      sessionID: SESSION,
      directories: [dir],
      searchesEveryProject: false,
    });
    expect(result).toEqual({ ok: false, reason: { type: 'notFound', searchedAll: false } });
  });

  it('finds the session under another config directory, the Agent own directory winning an ambiguity', async () => {
    const files = host();
    files.write(transcript(`${home}/.claude`, key), record(), 5);
    files.write(transcript(`${home}/.claude-work`, key), record(), 9);
    const own = await new ClaudeTranscriptLocator(files).locate({
      sessionID: SESSION,
      directories: [dir],
      configDirectory: `${home}/.claude-work`,
    });
    expect(own.ok && own.location.transcriptPath).toBe(transcript(`${home}/.claude-work`, key));
    const byDefault = await new ClaudeTranscriptLocator(files).locate({
      sessionID: SESSION,
      directories: [dir],
    });
    expect(byDefault.ok && byDefault.location.transcriptPath).toBe(
      transcript(`${home}/.claude`, key),
    );
  });

  it('searches an account directory outside the home', async () => {
    const files = host();
    files.write(transcript('/opt/accounts/claude-a', key), record());
    const result = await new ClaudeTranscriptLocator(files).locate({
      sessionID: SESSION,
      directories: [dir],
      accountDirectories: ['/opt/accounts/claude-a'],
    });
    expect(result.ok && result.location.projectDirectory).toBe(
      `/opt/accounts/claude-a/projects/${key}`,
    );
  });

  it('plans exact keys and long-key prefixes', () => {
    const long = `/home/dev/${'a'.repeat(250)}`;
    const plan = planLocation(['/a/b', long, 'relative']);
    expect(plan.exactKeys).toContain('-a-b');
    expect(plan.longKeyPrefixes).toHaveLength(1);
  });
});
