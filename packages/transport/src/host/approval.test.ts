import { describe, expect, it } from 'vitest';
import { connected, reply } from '../test-helpers';
import { approvalAsksSourceOf, readApprovalAsks } from './approval';
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
    const asks = await readApprovalAsks(transport, null);
    expect(asks.get('w1:p1')?.episodeId).toBe('abcdefghijk');
  });

  it.each([
    ['a disabled plugin', { plugin_root: '/p', enabled: false }],
    ['no plugin root', {}],
  ])('reads nothing with %s', async (_name, fields) => {
    const { transport } = await connected(plugin(fields));
    expect(await approvalAsksSourceOf(transport, null)).toBeNull();
    expect((await readApprovalAsks(transport, null)).size).toBe(0);
  });
});
