import type * as herdr from '../protocol/herdr-types.generated';
import { requestLine } from './envelope';
import { isJsonObject, type JsonValue, parseJson } from './json';

/**
 * Host-wide subscription kinds, in the canonical dotted spelling herdr's subscription API uses.
 * Subscribed with no params. `workspace.reordered` exists from protocol 19 on: subscribe to it
 * only after a current-connection snapshot reports protocol 19 or later.
 */
export const GLOBAL_EVENT_KINDS = [
  'workspace.created',
  'workspace.updated',
  'workspace.metadata_updated',
  'workspace.renamed',
  'workspace.moved',
  'workspace.reordered',
  'workspace.closed',
  'workspace.focused',
  'worktree.created',
  'worktree.opened',
  'worktree.removed',
  'tab.created',
  'tab.closed',
  'tab.focused',
  'tab.renamed',
  'tab.moved',
  'pane.created',
  'pane.closed',
  'pane.updated',
  'pane.focused',
  'pane.moved',
  'pane.exited',
  'pane.agent_detected',
  'layout.updated',
] as const;

export type GlobalEventKind = (typeof GLOBAL_EVENT_KINDS)[number];

/** Pane-scoped subscription kinds: their subscriptions carry a `pane_id`. */
export const PANE_EVENT_KINDS = ['pane.agent_status_changed', 'pane.scroll_changed'] as const;

export type PaneEventKind = (typeof PANE_EVENT_KINDS)[number];

/**
 * Subscribable only with a full output-match query (`source` + `match`; the server rejects a
 * bare pane id). Not subscribed today, but its events still decode canonically.
 */
export const PANE_OUTPUT_MATCHED = 'pane.output_matched';

/**
 * Synthetic, local-only kind: stands in for updates a bounded event buffer shed under overflow.
 * Never sent by herdr and not subscribable (absent from `KNOWN_EVENT_KINDS`). Consumers treat it
 * like a membership event: re-snapshot, because deltas may be missing.
 */
export const EVENTS_DROPPED = 'local.events_dropped';

/** Every kind herdr declares subscribable. */
export const KNOWN_EVENT_KINDS: readonly string[] = [
  ...GLOBAL_EVENT_KINDS,
  ...PANE_EVENT_KINDS,
  PANE_OUTPUT_MATCHED,
];

/** A canonical event kind. Unknown kinds keep their wire spelling. */
export type HerdrEventKind =
  | GlobalEventKind
  | PaneEventKind
  | typeof PANE_OUTPUT_MATCHED
  | typeof EVENTS_DROPPED
  | (string & {});

const BY_WIRE_NAME: ReadonlyMap<string, string> = new Map(
  KNOWN_EVENT_KINDS.flatMap((kind) => [
    [kind, kind],
    [kind.replace(/\./g, '_'), kind],
  ]),
);

/**
 * Maps a wire spelling (snake_case on event lines, dotted in the schema) onto the canonical kind.
 * Unknown names pass through untouched: herdr's API has no stability guarantee, and an unknown
 * kind must not be guess-mangled or kill the stream.
 */
export function eventKindFromWire(wireName: string): HerdrEventKind {
  return BY_WIRE_NAME.get(wireName) ?? wireName;
}

/** One event from the Host's events channel, in canonical naming; the payload stays schema-free. */
export interface HerdrEvent {
  readonly kind: HerdrEventKind;
  readonly data: JsonValue;
}

/**
 * The drop marker, yielded in place of updates a bounded buffer shed. Snapshot-then-delta makes
 * dropping events safe exactly when the consumer learns it happened; this event is how it learns.
 */
export const EVENTS_DROPPED_EVENT: HerdrEvent = { kind: EVENTS_DROPPED, data: null };

/**
 * Buffer bound for event delivery, sized for stall absorption, not history: events are single
 * JSON lines and bursts are tens of events, so 256 rides out a multi-second consumer stall.
 * Beyond that one snapshot resync beats replaying a stale backlog.
 */
export const EVENT_BUFFER_LIMIT = 256;

/**
 * A live `events.subscribe` stream over its Host's dedicated channel. Ending is explicit: call
 * `end()` (idempotent); `events` then finishes without error, and throws if the channel dies.
 */
export interface HerdrEventStream {
  readonly events: AsyncIterable<HerdrEvent>;
  end(): Promise<void>;
}

/** One entry of an `events.subscribe` request. */
export type EventSubscription =
  | { readonly kind: GlobalEventKind; readonly paneId?: undefined }
  | { readonly kind: PaneEventKind; readonly paneId: string };

/** Encodes an `events.subscribe` line: dotted types, pane-scoped entries carry their pane id. */
export function subscribeRequestLine(
  id: string,
  subscriptions: readonly EventSubscription[],
): string {
  return requestLine(id, 'events.subscribe', {
    subscriptions: subscriptions.map(wireSubscription),
  });
}

function wireSubscription(entry: EventSubscription): herdr.Subscription {
  return entry.paneId === undefined
    ? { type: entry.kind }
    : { type: entry.kind, pane_id: entry.paneId };
}

/**
 * Decodes one events-channel line; null for anything that is not an event line (response
 * envelopes, junk, empty lines). Lenient by design: junk on the stream is dropped, never fatal.
 */
export function decodeEvent(line: string): HerdrEvent | null {
  const value = parseJson(line);
  if (!isJsonObject(value)) return null;
  const event = Object.hasOwn(value, 'event') ? value.event : undefined;
  if (typeof event !== 'string') return null;
  const data = Object.hasOwn(value, 'data') ? value.data : undefined;
  return { kind: eventKindFromWire(event), data: data ?? null };
}
