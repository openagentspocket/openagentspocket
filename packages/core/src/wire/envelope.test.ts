import { describe, expect, it } from 'vitest';
import { HerdrApiError } from '../errors/herdr-api-error';
import { type TransportError, TransportFailure } from '../errors/transport-error';
import { decodeResult, requestLine } from './envelope';
import { jsonField, jsonString, parseJson } from './json';

// Pure wire-format cases ported from the Swift HerdrWireTests, GeneratedWireTypesTests (params)
// and JSONValueTests. No sockets.

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected a throw');
}

function transportKind(run: () => unknown): TransportError['kind'] {
  const error = thrown(run);
  expect(error).toBeInstanceOf(TransportFailure);
  return (error as TransportFailure).error.kind;
}

const pong = (id: string) =>
  `{"id":"${id}","result":{"type":"pong","version":"0.8.0","protocol":19}}`;

describe('requestLine', () => {
  it('is one envelope line with id, method and empty params, newline-terminated', () => {
    const line = requestLine('req-1', 'agent.list');
    expect(line.endsWith('\n')).toBe(true);
    expect(line.slice(0, -1)).not.toContain('\n');
    expect(JSON.parse(line)).toEqual({ id: 'req-1', method: 'agent.list', params: {} });
  });

  it('carries params and omits fields left undefined instead of sending null', () => {
    // Omitting `name` clears a custom name back to the detected kind (verified live).
    const cleared = JSON.parse(
      requestLine('r', 'agent.rename', { target: 'w1:p1', name: undefined }),
    );
    expect(Object.keys(cleared.params)).toEqual(['target']);
    const named = JSON.parse(
      requestLine('r', 'agent.rename', { target: 'w1:p1', name: 'reviewer' }),
    );
    expect(named.params).toEqual({ target: 'w1:p1', name: 'reviewer' });
  });

  it('keeps only provided optional fields for every params shape the app sends', () => {
    const keys = (line: string) => Object.keys(JSON.parse(line).params).sort();
    expect(keys(requestLine('r', 'pane.read', { pane_id: 'w1:p1', source: 'visible' }))).toEqual([
      'pane_id',
      'source',
    ]);
    expect(keys(requestLine('r', 'agent.prompt', { target: 'w1:p1', text: 'Continue' }))).toEqual([
      'target',
      'text',
    ]);
    expect(keys(requestLine('r', 'worktree.create', { focus: false, workspace_id: 'w1' }))).toEqual(
      ['focus', 'workspace_id'],
    );
    expect(keys(requestLine('r', 'worktree.list', { workspace_id: 'w1' }))).toEqual([
      'workspace_id',
    ]);
    expect(
      keys(requestLine('r', 'workspace.create', { cwd: '/home/you/src/app', focus: false })),
    ).toEqual(['cwd', 'focus']);
    expect(keys(requestLine('r', 'workspace.close', { workspace_id: 'wN' }))).toEqual([
      'workspace_id',
    ]);
    const start = requestLine('r', 'agent.start', {
      kind: 'claude',
      name: 'reviewer',
      pane_id: 'w1:p1',
      args: ['--continue'],
      timeout_ms: 5000,
    });
    expect(keys(start)).toEqual(['args', 'kind', 'name', 'pane_id', 'timeout_ms']);
    const sendKeys = JSON.parse(
      requestLine('r', 'agent.send_keys', { keys: ['ctrl+c', 'enter'], target: 'w1:p1' }),
    );
    expect(sendKeys.params).toEqual({ keys: ['ctrl+c', 'enter'], target: 'w1:p1' });
  });

  it('turns an unencodable payload into malformedResponse', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(transportKind(() => requestLine('r', 'pane.close', cyclic as never))).toBe(
      'malformedResponse',
    );
  });
});

describe('decodeResult', () => {
  it('decodes a matched success and ignores unknown fields', () => {
    const line =
      '{"id":"req-1","result":{"type":"pong","version":"0.7.5","protocol":17,"capabilities":{"live_handoff":true}},"extra":1}';
    const result = decodeResult(line, 'req-1', 'pong');
    expect(result.version).toBe('0.7.5');
    expect(result.protocol).toBe(17);
  });

  it('reads only the first line', () => {
    expect(decodeResult(`${pong('req-1')}\ntrailing junk`, 'req-1', 'pong').protocol).toBe(19);
  });

  it('throws the server error with an integer code normalized to a string', () => {
    const error = thrown(() =>
      decodeResult(
        '{"id":"req-1","error":{"code":404,"message":"no such method"}}',
        'req-1',
        'pong',
      ),
    );
    expect(error).toBeInstanceOf(HerdrApiError);
    expect(error).toMatchObject({ code: '404', message: 'no such method' });
  });

  it('accepts a string error code', () => {
    const error = thrown(() =>
      decodeResult('{"id":"req-1","error":{"code":"not_found","message":"gone"}}', 'req-1', 'pong'),
    );
    expect(error).toMatchObject({ code: 'not_found', message: 'gone' });
  });

  it('surfaces an error with an empty id as the server rejection, never an id mismatch', () => {
    const line =
      '{"id":"","error":{"code":"invalid_request","message":"invalid request: missing field `source` at line 1 column 123"}}';
    const error = thrown(() => decodeResult(line, 'req-1', 'pong'));
    expect(error).toBeInstanceOf(HerdrApiError);
    expect(error).toMatchObject({ code: 'invalid_request' });
  });

  it('surfaces an error under a derived subscribe-probe id as the server rejection', () => {
    const line =
      '{"id":"req-1:sub:0:probe","error":{"code":"pane_not_found","message":"pane not found"}}';
    expect(thrown(() => decodeResult(line, 'req-1', 'subscription_started'))).toMatchObject({
      code: 'pane_not_found',
      message: 'pane not found',
    });
  });

  it('throws a correlated error unchanged', () => {
    const line = '{"id":"req-1","error":{"code":"agent_not_found","message":"no such agent"}}';
    expect(thrown(() => decodeResult(line, 'req-1', 'agent_info'))).toMatchObject({
      code: 'agent_not_found',
    });
  });

  it('rejects a success with an empty or foreign id', () => {
    expect(transportKind(() => decodeResult(pong(''), 'req-1', 'pong'))).toBe('malformedResponse');
    expect(transportKind(() => decodeResult(pong('someone-else'), 'req-1', 'pong'))).toBe(
      'malformedResponse',
    );
  });

  it('rejects an envelope with neither result nor error', () => {
    expect(transportKind(() => decodeResult('{"id":"req-1"}', 'req-1', 'ok'))).toBe(
      'malformedResponse',
    );
    expect(transportKind(() => decodeResult('{"id":"req-1","result":null}', 'req-1', 'ok'))).toBe(
      'malformedResponse',
    );
  });

  it('rejects non-JSON, non-object and badly typed envelopes', () => {
    for (const line of [
      'bash: line 1: herdr: command not found',
      '',
      '[1,2]',
      '{"id":7,"result":{"type":"ok"}}',
      '{"id":"req-1","error":{"code":true,"message":"x"}}',
      '{"id":"req-1","error":{"code":"x"}}',
    ]) {
      expect(transportKind(() => decodeResult(line, 'req-1', 'ok'))).toBe('malformedResponse');
    }
  });

  it('rejects a result missing a required field or holding one of the wrong type', () => {
    for (const result of ['{"version":"0.8.0"}', '{"version":"0.8.0","protocol":"19"}', '[]']) {
      const line = `{"id":"req-1","result":${result}}`;
      expect(transportKind(() => decodeResult(line, 'req-1', 'pong'))).toBe('malformedResponse');
    }
  });

  it('decodes a result whose type tag is absent', () => {
    const result = decodeResult(
      '{"id":"r","result":{"version":"older","protocol":16}}',
      'r',
      'pong',
    );
    expect(result.protocol).toBe(16);
  });
});

describe('JSON values', () => {
  it('decodes every JSON shape and reads fields by key', () => {
    const value = parseJson(
      '{"s":"x","n":1.5,"i":3,"b":true,"z":null,"a":[1,"two"],"o":{"k":"v"}}',
    );
    expect(jsonField(value, 's')).toBe('x');
    expect(jsonField(value, 'n')).toBe(1.5);
    expect(jsonField(value, 'i')).toBe(3);
    expect(jsonField(value, 'b')).toBe(true);
    expect(jsonField(value, 'z')).toBeNull();
    expect(jsonField(value, 'a')).toEqual([1, 'two']);
    expect(jsonField(value, 'o')).toEqual({ k: 'v' });
    expect(parseJson(JSON.stringify(value))).toEqual(value);
  });

  it('reads nothing from non-objects or inherited keys', () => {
    expect(jsonField('x', 'key')).toBeUndefined();
    expect(jsonField(null, 'key')).toBeUndefined();
    expect(jsonField({}, 'constructor')).toBeUndefined();
    expect(parseJson('not json')).toBeUndefined();
  });

  it('unwraps only strings', () => {
    expect(jsonString('x')).toBe('x');
    expect(jsonString(1)).toBeUndefined();
  });
});
