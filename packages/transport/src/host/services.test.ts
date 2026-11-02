import {
  HERDR_PATH_EXPORT,
  type JsonObject,
  pluginVersion,
  TransportFailure,
} from '@openagentspocket/core';
import type { FakeSession } from 'agentico-ssh';
import { describe, expect, it, vi } from 'vitest';
import { connected, methodOf, paramsOf, reply } from '../test-helpers';
import {
  agentDiscoveryCommand,
  agentModelContextWindow,
  availableAgentKinds,
  discoveredAgentKinds,
  listSessions,
} from './commands';
import {
  installOrUpgradePlugin,
  manifestVersion,
  PluginNotReplaceableError,
  pluginBranchManifestCommand,
  readPlugin,
  readPluginBranchVersion,
  runPluginStep,
} from './plugin';
import { PluginStepError, pluginStepCommand } from './plugin-step';
import { cLocale, wrappingBareHerdr } from './shell';

const ok = (stdout: string, exitCode = 0) => ({ exitCode, stdout, stderr: '' });
const bare = (command: string) => cLocale(wrappingBareHerdr(command));

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a failure');
}

function plugins(entries: JsonObject[]) {
  return (_socket: string, request: Uint8Array) => {
    expect(methodOf(request)).toBe('plugin.list');
    return reply(request, { type: 'plugin_list', plugins: entries });
  };
}

const github = (version: string, repo = 'OWNER/agentico-app'): JsonObject => {
  const [owner, name] = repo.split('/');
  return {
    plugin_id: 'agentico',
    version,
    enabled: true,
    source: { kind: 'github', owner: owner ?? '', repo: name ?? '' },
  };
};

describe('commands', () => {
  it('lists sessions through the PATH-wrapped herdr and validates names', async () => {
    const list = JSON.stringify({ sessions: [{ name: 'work', default: false, running: true }] });
    const { transport } = await connected(
      () => new Uint8Array(),
      {},
      {
        exec: { [bare('herdr session list --json')]: ok(list) },
      },
    );
    expect(await listSessions(transport)).toEqual([
      { name: 'work', isDefault: false, isRunning: true },
    ]);
  });

  it('rejects an invalid session name and invalid JSON as malformed', async () => {
    for (const body of [JSON.stringify({ sessions: [{ name: '../x' }] }), 'nope']) {
      const { transport } = await connected(
        () => new Uint8Array(),
        {},
        {
          exec: { [bare('herdr session list --json')]: ok(body) },
        },
      );
      const thrown = await failure(listSessions(transport));
      expect(thrown).toBeInstanceOf(TransportFailure);
      expect((thrown as TransportFailure).error.kind).toBe('malformedResponse');
    }
  });

  it('maps exit 127 of a bare herdr to herdrBinaryNotFound', async () => {
    const { transport } = await connected(() => new Uint8Array());
    const thrown = (await failure(listSessions(transport))) as TransportFailure;
    expect(thrown.error.kind).toBe('herdrBinaryNotFound');
  });

  it('discovers agent kinds from marker lines in catalog order', async () => {
    const output =
      '__AGENTICO_AGENT_KIND__=codex\nnoise\n__AGENTICO_AGENT_KIND__=claude\n__AGENTICO_AGENT_KIND__=nope\n__AGENTICO_AGENT_KIND__=codex';
    expect(discoveredAgentKinds(output)).toEqual(['claude', 'codex']);
    expect(agentDiscoveryCommand().startsWith(`/bin/sh -c '${HERDR_PATH_EXPORT}; `)).toBe(true);
    expect(agentDiscoveryCommand()).toContain('command -v cursor-agent');
    const { transport } = await connected(
      () => new Uint8Array(),
      {},
      {
        exec: { [cLocale(agentDiscoveryCommand())]: ok(output) },
      },
    );
    expect(await availableAgentKinds(transport)).toEqual(['claude', 'codex']);
  });

  it('reads a model window, and treats a missing omp as unknown', async () => {
    const command = cLocale(`/bin/sh -c '${HERDR_PATH_EXPORT}; exec omp models ls a/b --json'`);
    const body = JSON.stringify({ models: [{ selector: 'a/b', contextWindow: 128000 }] });
    const { transport } = await connected(
      () => new Uint8Array(),
      {},
      {
        exec: { [command]: ok(body) },
      },
    );
    expect(await agentModelContextWindow(transport, 'a/b')).toBe(128000);
    expect(await agentModelContextWindow(transport, 'c/d')).toBeNull();
    expect(await agentModelContextWindow(transport, 'bad selector')).toBeNull();
  });

  it('refuses commands on a native Windows Host', async () => {
    const { transport, ssh } = await connected(() => new Uint8Array());
    Object.defineProperty(ssh.sessions[0] as FakeSession, 'serverIdentification', {
      value: 'SSH-2.0-OpenSSH_for_Windows_9.5',
    });
    expect(((await failure(listSessions(transport))) as TransportFailure).error.kind).toBe(
      'hostFeatureUnavailable',
    );
    expect(await agentModelContextWindow(transport, 'a/b')).toBeNull();
  });
});

describe('plugin', () => {
  it('reads the installation from plugin.list', async () => {
    const { transport } = await connected(plugins([github('0.6.0')]));
    const installation = await readPlugin(transport);
    expect(installation?.version).toBe('0.6.0');
    expect(installation?.repository).toBe('OWNER/agentico-app');
    const none = await connected(plugins([]));
    expect(await readPlugin(none.transport)).toBeNull();
  });

  it('builds step commands: bare, with the node probe, session-scoped, and via a launcher', () => {
    const install = ['plugin', 'install', 'OWNER/agentico-app', '--ref', 'plugin', '--yes'];
    const command = pluginStepCommand(install, { session: '', endpoint: null, findsNode: true });
    expect(
      command.startsWith(`/bin/sh -c '${HERDR_PATH_EXPORT}; __h_herdr=$(command -v herdr)`),
    ).toBe(true);
    expect(command).toContain(
      String.raw`exec "$__h_herdr" plugin install '\''OWNER/agentico-app'\'' --ref plugin --yes`,
    );
    expect(
      pluginStepCommand(['plugin', 'uninstall', 'herdr-mobile.pairing'], {
        session: 'work',
        endpoint: null,
        findsNode: false,
      }),
    ).toBe(
      `/bin/sh -c '${HERDR_PATH_EXPORT}; exec herdr --session work plugin uninstall herdr-mobile.pairing'`,
    );
  });

  it('completes a step only on exit 0, and reports a missing herdr', async () => {
    const command = cLocale(
      pluginStepCommand(['plugin', 'uninstall', 'herdr-mobile.pairing'], {
        session: '',
        endpoint: null,
        findsNode: false,
      }),
    );
    const step = { kind: 'uninstall', pluginId: 'herdr-mobile.pairing' } as const;
    const exec = vi.fn();
    const { transport, ssh } = await connected(
      () => new Uint8Array(),
      {},
      { exec: { [command]: ok('') } },
    );
    await runPluginStep(transport, step);
    const session = ssh.sessions[0] as FakeSession;
    vi.spyOn(session, 'exec').mockImplementation(async (...args) => {
      exec(...args);
      return { exitCode: 1, stdout: '', stderr: 'error: plugin not found' };
    });
    const thrown = await failure(runPluginStep(transport, step));
    expect(thrown).toBeInstanceOf(PluginStepError);
    expect((thrown as PluginStepError).detail()).toBe('error: plugin not found');
    session.exec = async () => ({ exitCode: 127, stdout: '', stderr: '' });
    expect(((await failure(runPluginStep(transport, step))) as TransportFailure).error.kind).toBe(
      'herdrBinaryNotFound',
    );
  });

  it('keeps herdr words without the install preview', () => {
    const output = [
      'mise WARN /home/u/.config/mise/config.toml is not trusted',
      'Plugin install preview:',
      '  id: agentico',
      '  build commands: 1',
      'error: plugin build failed',
      '  command: npm ci',
      '',
      '',
      'Plugin was not installed.',
    ].join('\n');
    const error = new PluginStepError({ kind: 'install' }, 1, output, '');
    expect(error.isBuildFailure).toBe(true);
    expect(error.isDownloadFailure).toBe(false);
    expect(error.detail()).toBe(
      'error: plugin build failed\n  command: npm ci\nPlugin was not installed.',
    );
    expect(error.detail(1)).toBe('Plugin was not installed.');
    expect(error.detail(10, 9)).toBe('…stalled.');
    const stdoutOnly = new PluginStepError({ kind: 'install' }, 1, '\n', 'note\nerror: x\n');
    expect(stdoutOnly.detail()).toBe('error: x');
    expect(new PluginStepError({ kind: 'install' }, 101, 'a\nb\n', '').detail()).toBe('a\nb');
    expect(
      new PluginStepError(
        { kind: 'install' },
        1,
        'client protocol 22 is newer; restart the Herdr server',
        '',
      ).needsServerRestart,
    ).toBe(true);
    expect(
      new PluginStepError({ kind: 'install' }, 3, '__AGENTICO_NODE_NOT_FOUND__', '').nodeProblem,
    ).toEqual({
      kind: 'missing',
    });
  });

  it('reads the branch manifest version', () => {
    const manifest = 'id = "agentico"\nversion = "0.6.2" # bumped\n\n[[build]]\nversion = "9.9.9"';
    expect(manifestVersion(manifest)).toEqual(pluginVersion(0, 6, 2));
    expect(manifestVersion('version="1.2.3"\r\n')).toEqual(pluginVersion(1, 2, 3));
    expect(manifestVersion('[[build]]\nversion = "9.9.9"')).toBeNull();
    expect(manifestVersion('versions = "1.0.0"')).toBeNull();
    expect(manifestVersion('version = 1.0.0')).toBeNull();
    expect(manifestVersion('')).toBeNull();
    const command = pluginBranchManifestCommand();
    expect(command).toContain('export GIT_TERMINAL_PROMPT=0');
    expect(command).toContain(
      'fetch -q --depth 1 https://github.com/OWNER/agentico-app.git plugin',
    );
    expect(command).toContain('git show FETCH_HEAD:herdr-plugin.toml');
    expect(command.slice("/bin/sh -c '".length, -1)).not.toContain("'");
  });

  it('fetches the branch version through the Host', async () => {
    const { transport } = await connected(
      () => new Uint8Array(),
      {},
      {
        exec: { [cLocale(pluginBranchManifestCommand())]: ok('version = "0.7.1"\n') },
      },
    );
    expect(await readPluginBranchVersion(transport)).toEqual(pluginVersion(0, 7, 1));
  });

  it('installs when absent, upgrades an older own install, leaves a current or foreign one', async () => {
    const installArgs = ['plugin', 'install', 'OWNER/agentico-app', '--ref', 'plugin', '--yes'];
    const command = cLocale(
      pluginStepCommand(installArgs, { session: '', endpoint: null, findsNode: true }),
    );
    const target = pluginVersion(0, 6, 0);
    const run = async (entries: JsonObject[]) => {
      const { transport, ssh } = await connected(
        plugins(entries),
        {},
        { exec: { [command]: ok('') } },
      );
      const spy = vi.spyOn(ssh.sessions[0] as FakeSession, 'exec');
      const outcome = await installOrUpgradePlugin(transport, target).catch((e: unknown) => e);
      return { outcome, installs: spy.mock.calls.length };
    };
    expect(await run([])).toEqual({ outcome: 'installed', installs: 1 });
    expect(await run([github('0.5.0')])).toEqual({ outcome: 'upgraded', installs: 1 });
    expect(await run([github('0.6.0')])).toEqual({ outcome: 'current', installs: 0 });
    const fork = await run([github('0.5.0', 'someone/Agentico')]);
    expect(fork.outcome).toBeInstanceOf(PluginNotReplaceableError);
    expect(fork.installs).toBe(0);
    const linked = await run([
      { plugin_id: 'agentico', version: '0.5.0', enabled: true, source: { kind: 'local' } },
    ]);
    expect(linked.outcome).toBeInstanceOf(PluginNotReplaceableError);
  });

  it('enables through plugin.enable without an exec', async () => {
    const calls: string[] = [];
    const { transport } = await connected((_s, request) => {
      calls.push(methodOf(request));
      expect(paramsOf(request)).toEqual({ plugin_id: 'agentico' });
      return reply(request, { type: 'plugin_enabled', plugin: { plugin_id: 'agentico' } });
    });
    await runPluginStep(transport, { kind: 'enable', pluginId: 'agentico' });
    expect(calls).toEqual(['plugin.enable']);
  });
});
