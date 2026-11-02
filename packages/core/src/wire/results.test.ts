import { describe, expect, it } from 'vitest';
import schema from '../../schema/herdr-schema.json';
import { decodeResult } from './envelope';
import fixtures from './fixtures/results.json';
import {
  type FieldKind,
  METHOD_RESULT,
  RESULT_FIELDS,
  RESULT_TAGS,
  type ResultTag,
  WIRE_METHODS,
} from './methods';

// Every RESULT tag decodes from captured JSON and survives a round trip (decode, re-encode,
// decode again, compare by value: key order and dropped fields make bytes meaningless).

type SchemaProperty = { type?: string; $ref?: string; anyOf?: unknown };
type ResultVariant = {
  properties: Record<string, SchemaProperty> & { type: { const: string } };
  required: string[];
};

const variants = (
  schema.schemas.success_response.$defs.ResponseResult as unknown as { oneOf: ResultVariant[] }
).oneOf;
const captures = fixtures as unknown as Record<string, unknown>;

function line(id: string, result: unknown): string {
  return `${JSON.stringify({ id, result })}\n`;
}

function roundTrip<T extends ResultTag>(tag: T, result: unknown) {
  const first = decodeResult(line('fix-1', result), 'fix-1', tag);
  const second = decodeResult(line('fix-2', JSON.parse(JSON.stringify(first))), 'fix-2', tag);
  expect(second).toEqual(first);
  return first;
}

function schemaKind(property: SchemaProperty | boolean | undefined): FieldKind {
  if (property === true || property === undefined || typeof property === 'boolean') return 'any';
  if (property.$ref) return 'object';
  switch (property.type) {
    case 'integer':
      return 'integer';
    case 'string':
    case 'boolean':
    case 'array':
    case 'object':
      return property.type;
    default:
      return 'any';
  }
}

describe('result tags', () => {
  it.each(RESULT_TAGS)('%s decodes from its capture and round-trips', (tag) => {
    const capture = captures[tag];
    expect(capture).toBeDefined();
    const decoded = roundTrip(tag, capture);
    expect(decoded.type).toBe(tag);
  });

  it('keeps the payload fields a consumer reads', () => {
    const snapshot = roundTrip('session_snapshot', captures.session_snapshot).snapshot;
    expect(snapshot.protocol).toBe(17);
    expect(snapshot.focused_pane_id).toBe('wS:p1');
    expect(snapshot.workspaces[0]?.worktree?.repo_name).toBe('Proj');
    expect(snapshot.panes[0]?.scroll?.viewport_rows).toBe(49);
    expect(snapshot.layouts[0]?.splits[0]).toMatchObject({ direction: 'right', ratio: 0.5 });
    const read = roundTrip('pane_read', captures.pane_read).read;
    expect(read.text).toBe('› 为什么失败？\n');
    const list = roundTrip('worktree_list', captures.worktree_list);
    expect(list.worktrees[1]?.branch).toBeNull();
    expect(list.worktrees[1]?.is_detached).toBe(true);
    const pong = roundTrip('pong', captures.pong);
    expect(pong.capabilities?.ssh_agent_registration).toBe(true);
  });

  it('match the schema: each tag exists with the same required fields', () => {
    for (const tag of RESULT_TAGS) {
      const variant = variants.find((v) => v.properties.type.const === tag);
      expect(variant, tag).toBeDefined();
      if (!variant) continue;
      const required = Object.fromEntries(
        variant.required
          .filter((field) => field !== 'type')
          .map((field) => [field, schemaKind(variant.properties[field])]),
      );
      expect(RESULT_FIELDS[tag], tag).toEqual(required);
    }
  });

  it('cover every method the app calls, each a method the schema declares', () => {
    const declared = new Set(
      (
        schema.schemas.request as unknown as {
          oneOf: { properties: { method: { const: string } } }[];
        }
      ).oneOf.map((request) => request.properties.method.const),
    );
    expect(WIRE_METHODS.filter((method) => !declared.has(method))).toEqual([]);
    expect(new Set(Object.values(METHOD_RESULT))).toEqual(new Set(RESULT_TAGS));
  });
});

describe('leniency', () => {
  it('keeps unknown enum values intact through a round trip', () => {
    // herdr's API has no stability guarantee: a new enum value must not break decoding.
    const read = { ...(captures.pane_read as { read: object }).read, source: 'psychic' };
    const decoded = roundTrip('pane_read', { type: 'pane_read', read });
    expect(decoded.read.source as string).toBe('psychic');

    const agent = {
      ...(captures.agent_info as { agent: object }).agent,
      agent_status: 'haunted',
      future_field: { nested: true },
    };
    const info = roundTrip('agent_info', { type: 'agent_info', agent });
    expect(info.agent.agent_status as string).toBe('haunted');
    expect((info.agent as unknown as Record<string, unknown>).future_field).toEqual({
      nested: true,
    });
  });

  it('accepts older and newer capability sets', () => {
    const older = roundTrip('pong', { version: '0.7.5', protocol: 17 });
    expect(older.capabilities).toBeUndefined();
    const future = roundTrip('pong', {
      version: 'synthetic',
      protocol: 23,
      future_field: true,
      capabilities: { live_handoff: true, endpoint_protocol_generation: null },
    });
    expect(future.capabilities?.endpoint_protocol_generation).toBeNull();
  });
});
