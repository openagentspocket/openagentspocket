import { HERDR_PATH_EXPORT, MemoryStorage, makeHerdrEndpoint } from '@openagentspocket/core';
import { describe, expect, it } from 'vitest';
import { isValidModelSelector, modelContextWindow, modelProbeCommand } from './agent-model-probe';
import {
  NODE_MISSING_MARKER,
  NODE_PROBE_SCRIPT,
  NODE_TOO_OLD_MARKER,
  NPM_MISSING_MARKER,
  nodeToolchainProblem,
  wrappingBareHerdrWithNode,
} from './node-toolchain';
import {
  mergeRecentDirectories,
  parseRecentDirectories,
  RecentDirectoryHistory,
  recentDirectoriesCommand,
  recentDirectoryEntries,
  shortenedDirectory,
} from './recent-directories';
import {
  isBareHerdrCommand,
  launcherCommand,
  missingBinaryError,
  wrappingBareHerdr,
} from './shell';

describe('bare herdr commands', () => {
  it('is only the command word, skipping leading assignments', () => {
    for (const command of [
      'herdr session list --json',
      '  herdr remote-client-bridge',
      'HERDR_X=1 herdr session list --json',
      'FOO=bar BAZ=qux herdr plugin list --json',
      "herdr --config '/tmp/x y' session list",
    ]) {
      expect(isBareHerdrCommand(command), command).toBe(true);
    }
    for (const command of [
      '/opt/herdr-wake --foreground',
      '/nonexistent/herdr plugin list --json',
      "ENV=herdr /bin/sh -c 'true'",
      'herdr=1 session list --json',
      "printf '%s' 'herdr: not json'",
    ]) {
      expect(isBareHerdrCommand(command), command).toBe(false);
    }
  });

  it('wraps in POSIX sh with the PATH export and leaves other commands alone', () => {
    expect(wrappingBareHerdr('herdr session list --json')).toBe(
      `/bin/sh -c '${HERDR_PATH_EXPORT}; exec herdr session list --json'`,
    );
    expect(wrappingBareHerdr("herdr --config '/tmp/x y' session list")).toContain(
      String.raw`exec herdr --config '\''/tmp/x y'\'' session list`,
    );
    expect(wrappingBareHerdr('HERDR_X=1 herdr plugin list')).toContain('exec HERDR_X=1 herdr');
    expect(wrappingBareHerdr('/opt/herdr-wake --foreground')).toBe('/opt/herdr-wake --foreground');
  });

  it('reports a missing binary only for a bare herdr exiting 127, or a launcher exiting 126/127', () => {
    expect(missingBinaryError(127, 'herdr session list --json', null)).toEqual({
      kind: 'herdrBinaryNotFound',
    });
    expect(missingBinaryError(127, '/nonexistent/herdr plugin list', null)).toBeNull();
    expect(missingBinaryError(1, 'herdr session list --json', null)).toBeNull();
    const endpoint = makeHerdrEndpoint('/tmp/h/herdr/herdr.sock', '/opt/herdr/launch');
    if (!endpoint) throw new Error('endpoint');
    expect(missingBinaryError(126, 'whatever', endpoint)).toEqual({
      kind: 'herdrLauncherNotFound',
      path: '/opt/herdr/launch',
    });
    expect(missingBinaryError(1, 'whatever', endpoint)).toBeNull();
  });

  it('runs a launcher with its socket exported', () => {
    const endpoint = makeHerdrEndpoint('/tmp/h/herdr/herdr.sock', '/opt/herdr/launch');
    if (!endpoint) throw new Error('endpoint');
    expect(launcherCommand(endpoint, 'plugin list --json')).toBe(
      `/bin/sh -c 'export HERDR_SOCKET_PATH="$2"; exec "$1" plugin list --json' herdr '/opt/herdr/launch' '/tmp/h/herdr/herdr.sock'`,
    );
  });
});

describe('node toolchain probe', () => {
  it('fits inside a single-quoted sh body', () => {
    expect(NODE_PROBE_SCRIPT).not.toContain("'");
  });

  it('resolves herdr before the probe changes PATH', () => {
    expect(wrappingBareHerdrWithNode('herdr plugin install x --yes')).toBe(
      `/bin/sh -c '${HERDR_PATH_EXPORT}; __h_herdr=$(command -v herdr) || exit 127; ${NODE_PROBE_SCRIPT}exec "$__h_herdr" plugin install x --yes'`,
    );
    expect(wrappingBareHerdrWithNode('/x/herdr plugin list')).toBe('/x/herdr plugin list');
  });

  it('reads its markers only under its own exit status', () => {
    expect(nodeToolchainProblem(3, `mise WARN noise\n${NODE_MISSING_MARKER}\n`)).toEqual({
      kind: 'missing',
    });
    expect(nodeToolchainProblem(3, `${NODE_TOO_OLD_MARKER}18.19.0\n`)).toEqual({
      kind: 'tooOld',
      version: '18.19.0',
    });
    expect(nodeToolchainProblem(3, `${NPM_MISSING_MARKER}20.19.2\n`)).toEqual({
      kind: 'npmMissing',
      nodeVersion: '20.19.2',
    });
    expect(nodeToolchainProblem(1, NODE_MISSING_MARKER)).toBeNull();
    expect(nodeToolchainProblem(3, 'error: plugin build failed')).toBeNull();
  });
});

describe('agent model probe', () => {
  it('accepts only provider/model selectors', () => {
    expect(isValidModelSelector('devin/gpt-6-astra')).toBe(true);
    expect(isValidModelSelector('gpt-6')).toBe(false);
    expect(isValidModelSelector('a/b; rm -rf /')).toBe(false);
    expect(modelProbeCommand("a/b'c")).toBeNull();
    expect(modelProbeCommand('a/b')).toBe(
      `/bin/sh -c '${HERDR_PATH_EXPORT}; exec omp models ls a/b --json'`,
    );
  });

  it('takes the window of the exactly matching selector', () => {
    const output = JSON.stringify({
      models: [
        { selector: 'devin/gpt-6-astra', contextWindow: 1000 },
        { selector: 'gpt-6-astra', contextWindow: 200000 },
      ],
    });
    expect(modelContextWindow(output, 'gpt-6-astra')).toBe(200000);
    expect(modelContextWindow(output, 'other/model')).toBeNull();
    expect(modelContextWindow('not json', 'a/b')).toBeNull();
    expect(
      modelContextWindow(
        JSON.stringify({ models: [{ selector: 'a/b', contextWindow: 0 }] }),
        'a/b',
      ),
    ).toBeNull();
    expect(
      modelContextWindow(
        JSON.stringify({ models: [{ selector: 'a/b', contextWindow: 3e9 }] }),
        'a/b',
      ),
    ).toBeNull();
  });
});

describe('recent directories', () => {
  it('merges history, then live, then discovered, deduping and capping', () => {
    expect(
      mergeRecentDirectories({
        history: ['/a', '/b'],
        live: ['/b', '/c/'],
        discovered: ['/c', '/d', '/a'],
        verified: null,
      }),
    ).toEqual(['/a', '/b', '/c', '/d']);
    const many = Array.from({ length: 25 }, (_, i) => `/p/${i}`);
    expect(
      mergeRecentDirectories({ history: [], live: [], discovered: many, verified: null }),
    ).toHaveLength(10);
    expect(
      mergeRecentDirectories({
        history: ['/a', '/b', '/c'],
        live: [],
        discovered: [],
        verified: null,
        limit: 2,
      }),
    ).toEqual(['/a', '/b']);
  });

  it('drops app-known entries the Host does not have, and relative paths and the root', () => {
    expect(
      mergeRecentDirectories({
        history: ['/gone', '/kept'],
        live: ['/also-gone'],
        discovered: ['/found'],
        verified: new Set(['/kept']),
      }),
    ).toEqual(['/kept', '/found']);
    expect(
      mergeRecentDirectories({
        history: ['relative', '/', ''],
        live: [],
        discovered: ['/ok'],
        verified: null,
      }),
    ).toEqual(['/ok']);
  });

  it('shortens to ~ only inside home', () => {
    expect(shortenedDirectory('/home/me/app', '/home/me')).toBe('~/app');
    expect(shortenedDirectory('/home/me', '/home/me/')).toBe('~');
    expect(shortenedDirectory('/home/mellow/app', '/home/me')).toBe('/home/mellow/app');
    expect(shortenedDirectory('/srv/app', null)).toBe('/srv/app');
    expect(recentDirectoryEntries(['/home/me/app'], '/home/me')).toEqual([
      { path: '/home/me/app', displayPath: '~/app', name: 'app' },
    ]);
  });

  it('parses marked lines, skipping noise, malformed lines and duplicates', () => {
    const output = [
      'Welcome to the Host',
      '__AGENTICO_RECENT_HOME__=/home/me',
      '__AGENTICO_RECENT_CANDIDATE__=/home/me/known',
      '__AGENTICO_RECENT_DIR__=/home/me/one',
      '__AGENTICO_RECENT_DIR__=relative/path',
      '__AGENTICO_RECENT_DIR__=',
      '__AGENTICO_RECENT_DIR__=/home/me/one',
      "__AGENTICO_RECENT_DIR__=/home/me/it's",
      '__AGENTICO_RECENT_DIR__=/home/me/two',
      '__AGENTICO_RECENT_CANDIDATE__=not-absolute',
      'garbage __AGENTICO_RECENT_DIR__=/mid-line',
    ].join('\n');
    const result = parseRecentDirectories(output);
    expect(result.home).toBe('/home/me');
    expect([...result.existingCandidates]).toEqual(['/home/me/known']);
    expect(result.discovered).toEqual(['/home/me/one', '/home/me/two']);
    expect(parseRecentDirectories('')).toEqual({
      existingCandidates: new Set(),
      discovered: [],
      home: null,
    });
  });

  it('passes candidates as quoted arguments and skips unquotable ones', () => {
    const command = recentDirectoriesCommand(['/a b', "/it's", 'rel']);
    expect(command.startsWith("/bin/sh -c '")).toBe(true);
    expect(command.endsWith(" herdr-recent-dirs '/a b'")).toBe(true);
  });

  it('keeps per-Host history newest first, capped, and forgets one Host', () => {
    const history = new RecentDirectoryHistory(new MemoryStorage());
    history.remember('/a', 'h1');
    history.remember('/b', 'h1');
    history.remember('/a/', 'h1');
    expect(history.directories('h1')).toEqual(['/a', '/b']);
    history.remember('relative', 'h1');
    expect(history.directories('h1')).toEqual(['/a', '/b']);
    for (let i = 0; i < 15; i += 1) history.remember(`/p/${i}`, 'h2');
    expect(history.directories('h2')).toHaveLength(10);
    expect(history.directories('h2')[0]).toBe('/p/14');
    history.forget('h2');
    expect(history.directories('h2')).toEqual([]);
    expect(history.directories('h1')).toEqual(['/a', '/b']);
  });
});
