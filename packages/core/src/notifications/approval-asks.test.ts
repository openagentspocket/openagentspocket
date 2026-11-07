import { describe, expect, it } from 'vitest';
import { approvalAsksScript, approvalAsksSource, parseApprovalAsks } from './approval-script';

const ENTRY = {
  pane: 'w1:p1',
  bid: 'abcdefghijk',
  ts: 1000,
  act: 1,
  q: 'Run ls?',
  opts: ['Yes', 'No'],
};
const output = (asks: unknown[]) => `${JSON.stringify({ v: 1, result: 'ok', asks })}\n`;

describe('approvalAsksScript', () => {
  it('runs the plugin reader with its own node, the config dir and the session socket', () => {
    const script = approvalAsksScript('/home/me/plugin', {
      socketPath: '/run/herdr/sessions/work/herdr.sock',
      executablePath: '/opt/launcher',
    });
    expect(script).toContain("export HERDR_SOCKET_PATH='/run/herdr/sessions/work/herdr.sock'");
    expect(script).toContain('export HERDR_PLUGIN_CONFIG_DIR="$config"');
    expect(script).toContain('< "$config/runtime-node"');
    expect(script).toContain(`"$node" '/home/me/plugin/src/approval-asks.js'`);
  });

  it('refuses a plugin root that is not absolute', () => {
    expect(() => approvalAsksScript('plugin', null)).toThrow(RangeError);
  });
});

describe('parseApprovalAsks', () => {
  it('maps the Host fields onto the activity ask, by pane', () => {
    const asks = parseApprovalAsks(`noise\n${output([{ ...ENTRY, act: 2 }])}`);
    expect(asks.get('w1:p1')).toEqual({
      episodeId: 'abcdefghijk',
      denyOnly: true,
      prompt: 'Run ls?',
      options: ['Yes', 'No'],
      timestamp: 1000,
    });
  });

  it('reads no asks before the hooks recorded the runtime', () => {
    expect(parseApprovalAsks('{"v":1,"result":"runtime_missing"}\n').size).toBe(0);
  });

  it.each([
    ['a bad episode', { bid: 'short' }],
    ['an unknown act', { act: 3 }],
    ['no prompt', { q: 7 }],
    ['no pane', { pane: '' }],
    ['a fractional second', { ts: 1.5 }],
    ['labels that are not text', { opts: ['Yes', 1] }],
    ['too many labels', { opts: ['a', 'b', 'c', 'd', 'e'] }],
  ])('drops an ask with %s and keeps the others', (_name, change) => {
    const asks = parseApprovalAsks(
      output([
        { ...ENTRY, ...change },
        { ...ENTRY, pane: 'w1:p2' },
      ]),
    );
    expect([...asks.keys()]).toEqual(['w1:p2']);
  });

  it.each([
    '',
    'not json',
    '{"v":1,"result":"failed"}',
    '{"v":2,"result":"ok","asks":[]}',
    '{"v":1,"result":"ok"}',
  ])('throws on %j: a failed read keeps the last good one', (text) => {
    expect(() => parseApprovalAsks(text)).toThrow();
  });
});

describe('approvalAsksSource', () => {
  it('is a refreshing Host data source over the script and the parser', () => {
    const source = approvalAsksSource('/p', null);
    expect(source.script).toBe(approvalAsksScript('/p', null));
    expect(source.refreshMs).toBeGreaterThan(0);
    expect(source.parse(output([ENTRY])).size).toBe(1);
  });
});
