import {
  HERDR_PATH_EXPORT,
  type JsonObject,
  LiveUsageSource,
  MemoryStorage,
  shellWord,
  TransportFailure,
  UsageReportError,
  usageProbeScript,
} from '@openagentspocket/core';
import { type ExecResult, utf8Encode } from 'agentico-ssh';
import { describe, expect, it } from 'vitest';
import { systemClock } from './clock';
import { connected, methodOf, reply } from './test-helpers';
import { ACCOUNT_FILE_NAME, usageHostPort } from './usage-port';

const NONCE = 'n0nce-1';
const ROOT = '/plugins/agentico';
const CONFIG = '/config/agentico';
const REPORT = JSON.stringify({
  version: 1,
  runtime: 'recorded',
  generatedAt: '2026-10-31T12:00:00.000Z',
  timeZone: 'UTC',
  refreshing: false,
  scan: { state: 'complete', skippedArchives: 0 },
  programs: [],
});
const framed = (body: string, status = 0) =>
  `__AGENTICO_USAGE_BEGIN_${NONCE}\n${body}\n__AGENTICO_USAGE_END_${NONCE}:${status}\n`;
const sh = (script: string) => `/bin/sh -c ${shellWord(script)}`;

const queryCommand = (claudeLimits: boolean) =>
  sh(
    usageProbeScript({
      pluginRoot: ROOT,
      timeZone: 'UTC',
      claudeLimits,
      nonce: NONCE,
      endpoint: null,
    }),
  );
const configCommand = (id = 'agentico') =>
  sh(`${HERDR_PATH_EXPORT}; herdr plugin config-dir ${id}`);

const plugins = (entries: JsonObject[]) => (_socket: string, request: Uint8Array) => {
  if (methodOf(request) !== 'plugin.list') throw new Error('unexpected method');
  return reply(request, { type: 'plugin_list', plugins: entries });
};
const INSTALLED = [{ plugin_id: 'agentico', version: '0.12.0', plugin_root: ROOT, enabled: true }];

async function setup(entries: JsonObject[] = INSTALLED, exec: Record<string, ExecResult> = {}) {
  const { transport, ssh } = await connected(
    plugins(entries),
    {},
    {
      exec,
      files: { [`${CONFIG}/${ACCOUNT_FILE_NAME}`]: utf8Encode('{"version":1}') },
      directories: [CONFIG],
    },
  );
  return { transport, ssh, port: usageHostPort(transport, { nonce: () => NONCE }) };
}

describe('usageHostPort', () => {
  it('lists the plugin through the herdr API', async () => {
    const { port } = await setup();
    expect(await port.readPlugin()).toMatchObject({ version: '0.12.0', pluginRoot: ROOT });
    const none = await setup([]);
    expect(await none.port.readPlugin()).toBeNull();
  });

  it('runs the framed probe over exec and decodes the report', async () => {
    const { port } = await setup(INSTALLED, {
      [queryCommand(false)]: { exitCode: 0, stdout: framed(REPORT), stderr: '' },
    });
    const report = await port.query({ pluginRoot: ROOT, timeZone: 'UTC', claudeLimits: false });
    expect(report.version).toBe(1);
  });

  it('a truncated or failed probe never reads as success', async () => {
    const cut = await setup(INSTALLED, {
      [queryCommand(true)]: {
        exitCode: 0,
        stdout: `__AGENTICO_USAGE_BEGIN_${NONCE}\n${REPORT}`,
        stderr: '',
      },
    });
    await expect(
      cut.port.query({ pluginRoot: ROOT, timeZone: 'UTC', claudeLimits: true }),
    ).rejects.toBeInstanceOf(TransportFailure);
    const newer = await setup(INSTALLED, {
      [queryCommand(true)]: { exitCode: 0, stdout: framed('{"version":2}'), stderr: '' },
    });
    await expect(
      newer.port.query({ pluginRoot: ROOT, timeZone: 'UTC', claudeLimits: true }),
    ).rejects.toBeInstanceOf(UsageReportError);
  });

  it('reads and atomically replaces the Accounts file in the plugin config dir', async () => {
    const { port } = await setup(INSTALLED, {
      [configCommand()]: { exitCode: 0, stdout: `welcome\n${CONFIG}\n`, stderr: '' },
    });
    expect(await port.readAccountFile()).toBe('{"version":1}');
    await port.replaceAccountFile('{"version":1,"accounts":[]}');
    expect(await port.readAccountFile()).toBe('{"version":1,"accounts":[]}');
  });

  it('refuses the file when the plugin is not installed', async () => {
    const { port } = await setup([]);
    await expect(port.readAccountFile()).rejects.toBeInstanceOf(TransportFailure);
  });

  it('drives a LiveUsageSource end to end', async () => {
    const { port } = await setup(INSTALLED, {
      [queryCommand(false)]: { exitCode: 0, stdout: framed(REPORT), stderr: '' },
    });
    const source = new LiveUsageSource({
      clock: systemClock,
      storage: new MemoryStorage(),
      timeZone: () => 'UTC',
    });
    source.setHosts([{ id: 'h', name: 'Host', port }]);
    await source.refresh();
    expect((await source.readings())[0]?.state.kind).toBe('available');
  });
});
