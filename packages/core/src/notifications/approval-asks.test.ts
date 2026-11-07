import { describe, expect, it } from 'vitest';
import {
  type ApprovalAskReading,
  approvalAsksScript,
  approvalAsksSource,
  parseApprovalAskReading,
} from './approval-script';

const ENTRY = {
  pane: 'w1:p1',
  bid: 'abcdefghijk',
  ts: 1000,
  act: 1,
  q: 'Run ls?',
  opts: ['Yes', 'No'],
};
const output = (asks: unknown[], extra = {}) =>
  `${JSON.stringify({ v: 1, result: 'ok', asks, ...extra })}\n`;

function asksOf(reading: ApprovalAskReading) {
  if (reading.kind !== 'read') throw new Error('not read');
  return reading.asks;
}

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

describe('parseApprovalAskReading', () => {
  it('maps the Host fields onto the activity ask, by pane', () => {
    const asks = asksOf(parseApprovalAskReading(`noise\n${output([{ ...ENTRY, act: 2 }])}`));
    expect(asks.get('w1:p1')).toEqual({
      episodeId: 'abcdefghijk',
      denyOnly: true,
      prompt: 'Run ls?',
      options: ['Yes', 'No'],
      timestamp: 1000,
    });
  });

  it('a Host whose hooks never recorded the runtime is a plugin problem, not an empty screen', () => {
    expect(parseApprovalAskReading('{"v":1,"result":"runtime_missing"}\n').kind).toBe(
      'pluginUnavailable',
    );
  });

  it('tells a pane it could not read from one with no ask', () => {
    const reading = parseApprovalAskReading(output([ENTRY], { unread: ['w1:p9', 7, ''] }));
    expect(reading).toMatchObject({ kind: 'read', unread: ['w1:p9'] });
  });

  it('an older plugin reports no unread panes', () => {
    expect(parseApprovalAskReading(output([ENTRY]))).toMatchObject({ unread: [] });
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
    const asks = asksOf(
      parseApprovalAskReading(
        output([
          { ...ENTRY, ...change },
          { ...ENTRY, pane: 'w1:p2' },
        ]),
      ),
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
    expect(() => parseApprovalAskReading(text)).toThrow();
  });
});

describe('approvalAsksSource', () => {
  it('is a refreshing Host data source over the script and the parser', () => {
    const source = approvalAsksSource('/p', null);
    expect(source.script).toBe(approvalAsksScript('/p', null));
    expect(source.refreshMs).toBeGreaterThan(0);
    expect(asksOf(source.parse(output([ENTRY]))).size).toBe(1);
  });
});
