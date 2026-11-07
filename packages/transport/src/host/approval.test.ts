import { describe, expect, it } from 'vitest';
import { connected, reply } from '../test-helpers';
import { applyApproval, approvalAsksSourceOf, readApprovalAsks } from './approval';
import { SCRIPT_SHELL } from './bounded-script';

const ASKS = JSON.stringify({
  v: 1,
  result: 'ok',
  asks: [{ pane: 'w1:p1', bid: 'abcdefghijk', ts: 1000, act: 1, q: 'Run?', opts: ['Yes', 'No'] }],
});

const plugin = (fields: object) => (_socket: string, request: Uint8Array) =>
  reply(request, {
    type: 'plugin_list',
    plugins: [
      {
        plugin_id: 'agentico',
        version: '0.12.0',
        enabled: true,
        source: { kind: 'github', owner: 'o', repo: 'r' },
        ...fields,
      },
    ],
  });

describe('readApprovalAsks', () => {
  it('runs the plugin reader at its real root and reads its asks', async () => {
    const { transport } = await connected(
      plugin({ plugin_root: '/home/me/plugin' }),
      {},
      { exec: { [SCRIPT_SHELL]: { exitCode: 0, stdout: `${ASKS}\n`, stderr: '' } } },
    );
    const source = await approvalAsksSourceOf(transport, null);
    expect(source?.script).toContain('/home/me/plugin/src/approval-asks.js');
    const reading = await readApprovalAsks(transport, null);
    expect(reading.kind === 'read' && reading.asks.get('w1:p1')?.episodeId).toBe('abcdefghijk');
  });

  it.each([
    ['a disabled plugin', { plugin_root: '/p', enabled: false }],
    ['no plugin root', {}],
  ])('says the plugin cannot answer with %s', async (_name, fields) => {
    const { transport } = await connected(plugin(fields));
    expect(await approvalAsksSourceOf(transport, null)).toBeNull();
    expect((await readApprovalAsks(transport, null)).kind).toBe('pluginUnavailable');
  });
});

describe('applyApproval', () => {
  const REQUEST = {
    pane: 'w1:p1',
    episodeId: 'abcdefghijk',
    timestamp: 1000,
    decision: 'deny',
    option: 2,
    prompt: 'Run?',
    label: 'No',
  } as const;

  it('gives the result the Host printed', async () => {
    const stdout = '{"v":1,"result":"sent","keys":["2"]}\n';
    const { transport } = await connected(
      plugin({ plugin_root: '/p' }),
      {},
      { exec: { [SCRIPT_SHELL]: { exitCode: 0, stdout, stderr: '' } } },
    );
    expect(await applyApproval(transport, REQUEST, null)).toBe('sent');
  });

  it('a script that ran and broke reads failed: the key may have gone', async () => {
    const stdout = '{"v":1,"result":"failed"}\n';
    const { transport } = await connected(
      plugin({ plugin_root: '/p' }),
      {},
      { exec: { [SCRIPT_SHELL]: { exitCode: 1, stdout, stderr: '' } } },
    );
    expect(await applyApproval(transport, REQUEST, null)).toBe('failed');
  });

  it('throws only before the script starts', async () => {
    const { transport } = await connected(() => {
      throw new Error('the socket is gone');
    });
    await expect(applyApproval(transport, REQUEST, null)).rejects.toThrow();
  });
});
