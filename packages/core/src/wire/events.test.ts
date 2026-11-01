import { describe, expect, it } from 'vitest';
import schema from '../../schema/herdr-schema.json';
import {
  decodeEvent,
  EVENTS_DROPPED,
  EVENTS_DROPPED_EVENT,
  eventKindFromWire,
  KNOWN_EVENT_KINDS,
  subscribeRequestLine,
} from './events';
import { jsonField } from './json';

// Canonical event naming and subscription wire shapes, ported from the Swift HerdrEventsTests.
// Event-line fixtures use the snake_case spelling the live wire sends.

describe('event kinds', () => {
  it('maps snake_case wire names to canonical dotted kinds', () => {
    expect(eventKindFromWire('pane_created')).toBe('pane.created');
    expect(eventKindFromWire('workspace_metadata_updated')).toBe('workspace.metadata_updated');
    expect(eventKindFromWire('pane_agent_status_changed')).toBe('pane.agent_status_changed');
  });

  it('maps every known kind from its snake_case and its dotted spelling', () => {
    for (const kind of KNOWN_EVENT_KINDS) {
      expect(eventKindFromWire(kind.replace(/\./g, '_'))).toBe(kind);
      expect(eventKindFromWire(kind)).toBe(kind);
    }
  });

  it('passes unknown wire names through unchanged', () => {
    expect(eventKindFromWire('pane_haunted')).toBe('pane_haunted');
  });

  it('covers every kind the schema declares subscribable', () => {
    const subscribable = (
      schema.schemas.request.$defs.Subscription as unknown as {
        oneOf: { properties: { type: { const: string } } }[];
      }
    ).oneOf.map((variant) => variant.properties.type.const);
    expect([...KNOWN_EVENT_KINDS].sort()).toEqual([...subscribable].sort());
  });

  it('keeps the local drop marker out of the subscribable set', () => {
    expect(KNOWN_EVENT_KINDS).not.toContain(EVENTS_DROPPED);
    expect(EVENTS_DROPPED_EVENT).toEqual({ kind: EVENTS_DROPPED, data: null });
  });
});

describe('subscribeRequestLine', () => {
  it('sends dotted types and the pane id only on pane-scoped entries', () => {
    const line = subscribeRequestLine('req-1', [
      { kind: 'pane.created' },
      { kind: 'pane.agent_status_changed', paneId: 'w1:p1' },
    ]);
    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line)).toEqual({
      id: 'req-1',
      method: 'events.subscribe',
      params: {
        subscriptions: [
          { type: 'pane.created' },
          { type: 'pane.agent_status_changed', pane_id: 'w1:p1' },
        ],
      },
    });
  });
});

describe('decodeEvent', () => {
  it('decodes an event line to its canonical kind and payload', () => {
    const event = decodeEvent(
      '{"event":"pane_agent_status_changed","data":{"pane_id":"w3:pB","workspace_id":"w3","agent_status":"blocked","state_labels":{}}}',
    );
    expect(event?.kind).toBe('pane.agent_status_changed');
    expect(jsonField(event?.data, 'pane_id')).toBe('w3:pB');
    expect(jsonField(event?.data, 'agent_status')).toBe('blocked');
  });

  it('still decodes an unknown kind', () => {
    const event = decodeEvent('{"event":"pane_haunted","data":{"pane_id":"w1:p1"}}');
    expect(event?.kind).toBe('pane_haunted');
    expect(jsonField(event?.data, 'pane_id')).toBe('w1:p1');
  });

  it('gives a line without data a null payload', () => {
    expect(decodeEvent('{"event":"pane_created"}')).toEqual({ kind: 'pane.created', data: null });
  });

  it('drops response envelopes, junk and empty lines instead of failing', () => {
    expect(decodeEvent('{"id":"x","result":{"type":"subscription_started"}}')).toBeNull();
    expect(decodeEvent('not json')).toBeNull();
    expect(decodeEvent('')).toBeNull();
    expect(decodeEvent('{"event":7}')).toBeNull();
    expect(decodeEvent('["pane_created"]')).toBeNull();
  });
});
