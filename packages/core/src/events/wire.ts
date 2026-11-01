import type { Subscription } from '../protocol/herdr-types.generated';
import { failures, failWith } from './failure';
import { canonicalEventKind, type EventSubscription, type HerdrEvent } from './types';

/** One subscription entry as herdr reads it: dotted kind, `pane_id` when pane-scoped. */
export function wireSubscription(subscription: EventSubscription): Subscription {
  return subscription.scope === 'pane'
    ? { type: subscription.kind, pane_id: subscription.paneId }
    : { type: subscription.kind };
}

/** The `events.subscribe` request line, trailing newline included. */
export function subscribeRequestLine(
  requestId: string,
  subscriptions: readonly EventSubscription[],
): string {
  const request = {
    id: requestId,
    method: 'events.subscribe',
    params: { subscriptions: subscriptions.map(wireSubscription) },
  };
  return `${JSON.stringify(request)}\n`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Checks the subscription acknowledgement line. Errors are attributable to
 * the connection's sole request even when the id does not echo it (herdr
 * answers unparseable requests with `id: ""`); success must match the id.
 */
export function checkSubscribeAck(line: string, requestId: string): void {
  let envelope: unknown;
  try {
    envelope = JSON.parse(line);
  } catch {
    throw failWith(failures.malformedResponse(`undecodable response line: ${line.slice(0, 200)}`));
  }
  if (!isRecord(envelope)) {
    throw failWith(failures.malformedResponse(`undecodable response line: ${line.slice(0, 200)}`));
  }
  const error = envelope.error;
  if (error !== undefined && error !== null) {
    const code = isRecord(error) ? error.code : undefined;
    const message = isRecord(error) ? error.message : undefined;
    if ((typeof code !== 'string' && typeof code !== 'number') || typeof message !== 'string') {
      throw failWith(failures.malformedResponse('undecodable error envelope'));
    }
    throw failWith(failures.apiRejected(String(code), message));
  }
  if (envelope.id !== requestId) {
    const id = typeof envelope.id === 'string' ? envelope.id : '<none>';
    throw failWith(
      failures.malformedResponse(`response id ${id} does not match request id ${requestId}`),
    );
  }
  if (!isRecord(envelope.result)) {
    throw failWith(failures.malformedResponse('response has neither result nor error'));
  }
}

/**
 * Decodes one events-channel line, or returns undefined for anything that is
 * not an event line: lenient by design, junk on the stream is dropped.
 */
export function decodeEventLine(line: string): HerdrEvent | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!isRecord(value) || typeof value.event !== 'string') return undefined;
  return { kind: canonicalEventKind(value.event), data: value.data ?? null };
}
