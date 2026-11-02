import type { TransportFailure } from '@openagentspocket/core';
import type { FakeSession } from 'agentico-ssh';
import { describe, expect, it } from 'vitest';
import { connected } from '../test-helpers';
import { boundedScript, ExecLane, runBoundedScript } from './bounded-script';
import { pluginConfigFiles } from './config-files';
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

describe('bounded script', () => {
  it('wraps the script in the watchdog exactly', () => {
    expect(boundedScript("printf 'body'\n", 10, '__AGENTICO_GIT_TIMEOUT_F00D__')).toBe(
      [
        '{',
        '(',
        '    sleep 10 3>&-',
        "    printf '\\n%s\\n' '__AGENTICO_GIT_TIMEOUT_F00D__' >&3",
        '    kill -KILL 0',
        ') </dev/null >/dev/null 3>&2 2>/dev/null &',
        '__agentico_git_watchdog=$!',
        '(',
        "printf 'body'",
        '',
        ') </dev/null',
        '__agentico_git_status=$?',
        '{',
        '    kill -KILL "$__agentico_git_watchdog"',
        '    wait "$__agentico_git_watchdog"',
        '} >/dev/null 2>&1',
        'exit "$__agentico_git_status"',
        '} </dev/null',
        '',
      ].join('\n'),
    );
  });

  it('reports the feature timeout when the watchdog marker appears', async () => {
    const { transport, ssh } = await connected(() => new Uint8Array());
    const session = ssh.sessions[0] as FakeSession;
    session.exec = async () => ({
      exitCode: 137,
      stdout: '',
      stderr: '\n__AGENTICO_OC_TIMEOUT_ab__\n',
    });
    const thrown = (await failure(
      runBoundedScript(transport, 'true', {
        feature: 'Chat',
        deadlineMs: 5000,
        remoteSeconds: 3,
        timeoutMarkerPrefix: '__AGENTICO_OC_TIMEOUT_',
        timedOut: { kind: 'hostFileTimedOut' },
        nonce: () => 'ab',
      }),
    )) as TransportFailure;
    expect(thrown.error.kind).toBe('hostFileTimedOut');
  });

  it('runs one script at a time in a lane', async () => {
    const lane = new ExecLane();
    const log: string[] = [];
    let open: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const signal = { aborted: false, addEventListener() {}, removeEventListener() {} };
    const first = lane.run(async () => {
      await gate;
      log.push('first');
    }, signal);
    const second = lane.run(async () => {
      log.push('second');
    }, signal);
    await new Promise((resolve) => setImmediate(resolve));
    expect(log).toEqual([]);
    open();
    await Promise.all([first, second]);
    expect(log).toEqual(['first', 'second']);
  });
});

describe('plugin config files', () => {
  const list = JSON.stringify({ result: { plugins: [{ plugin_id: 'agentico', enabled: true }] } });
  const exec = {
    [bare('herdr plugin list --json')]: ok(list),
    [bare('herdr plugin config-dir agentico')]: ok(
      'noise\n/home/dev/.config/herdr/plugins/agentico\n',
    ),
  };
  const dir = '/home/dev/.config/herdr/plugins/agentico';

  it('reads and replaces the registration file in the plugin config dir', async () => {
    const { transport, ssh } = await connected(
      () => new Uint8Array(),
      {},
      {
        exec,
        directories: [dir],
        files: { [`${dir}/notifications.json`]: new Uint8Array([1, 2]) },
      },
    );
    const files = pluginConfigFiles(transport);
    expect(await files.readRegistration()).toEqual(new Uint8Array([1, 2]));
    expect(await files.readConfig()).toBeNull();
    await files.replaceConfig(new Uint8Array([9]));
    await files.replaceRegistration(new Uint8Array([3]));
    const session = ssh.sessions[0] as FakeSession;
    expect(session.files.get(`${dir}/notify.json`)).toEqual(new Uint8Array([9]));
    expect(session.files.get(`${dir}/notifications.json`)).toEqual(new Uint8Array([3]));
    expect(await files.readSidebarLayout()).toBeNull();
  });

  it('reports a plugin that is not installed', async () => {
    const { transport } = await connected(
      () => new Uint8Array(),
      {},
      {
        exec: {
          [bare('herdr plugin list --json')]: ok(JSON.stringify({ result: { plugins: [] } })),
        },
      },
    );
    const thrown = (await failure(pluginConfigFiles(transport).readRegistration())) as {
      failure: { kind: string };
    };
    expect(thrown.failure.kind).toBe('pluginNotInstalled');
  });
});
