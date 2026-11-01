import { HerdrApiError } from '../errors/herdr-api-error';
import { message, type Text } from '../errors/text';
import { TransportFailure } from '../errors/transport-error';
import { isJsonObject, type JsonObject, type JsonValue, parseJson } from './json';
import {
  type FieldKind,
  type HerdrMethod,
  type ParamsOf,
  RESULT_FIELDS,
  type ResultOf,
  type ResultTag,
} from './methods';

// herdr's NDJSON wire format: request `{"id","method","params"}` + "\n", success
// `{"id","result"}`, failure `{"id","error":{"code","message"}}`. One request per connection;
// decoding is lenient (unknown fields ignored) because herdr's API has no stability guarantee.

const PREVIEW_LENGTH = 200;

function malformed(detail: Text): TransportFailure {
  return new TransportFailure({ kind: 'malformedResponse', detail });
}

/**
 * Encodes one request line, trailing newline included. Parameterless methods send `{}`. Fields
 * left `undefined` are omitted, never sent as `null` (herdr reads an omitted `name` as "clear").
 */
export function requestLine<M extends HerdrMethod>(
  id: string,
  method: M,
  params?: ParamsOf<M>,
): string {
  try {
    return `${JSON.stringify({ id, method, params: params ?? {} })}\n`;
  } catch (error) {
    // A diagnostic, not catalog copy (unlocalized on the Swift side too).
    const reason = error instanceof Error ? error.message : String(error);
    throw malformed(`failed to encode request for ${method}: ${reason}`);
  }
}

function hasKind(value: JsonValue | undefined, kind: FieldKind): boolean {
  switch (kind) {
    case 'any':
      return value !== undefined;
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isJsonObject(value);
  }
}

function own(object: JsonObject, key: string): JsonValue | undefined {
  return Object.hasOwn(object, key) ? object[key] : undefined;
}

/** herdr's error body; `code` may be a string or an integer on the wire. */
function decodeErrorBody(body: JsonValue): HerdrApiError | undefined {
  if (!isJsonObject(body)) return undefined;
  const code = own(body, 'code');
  const text = own(body, 'message');
  if (typeof text !== 'string') return undefined;
  if (typeof code === 'string') return new HerdrApiError(code, text);
  if (Number.isInteger(code)) return new HerdrApiError(String(code), text);
  return undefined;
}

/**
 * Decodes one response line: unwraps the envelope, checks id correlation, and either returns the
 * result (its required fields checked against `tag`) or throws herdr's `HerdrApiError`.
 * Everything else throws a `TransportFailure` carrying `malformedResponse`.
 *
 * Each herdr API connection serves one request, so the response on a connection is always for
 * that connection's sole in-flight request. Success still requires an exact id match. Errors do
 * not: herdr answers unparseable requests (and, in some versions, invalid JSON and non-string
 * ids) with `id: ""`, and some versions answer `events.subscribe` probe failures with a derived
 * id that does not echo the request's. Without this fallback those requests would pend until the
 * deadline instead of failing with the server's error.
 */
export function decodeResult<T extends ResultTag>(
  line: string,
  requestId: string,
  tag: T,
): ResultOf<T> {
  const newline = line.indexOf('\n');
  const text = newline === -1 ? line : line.slice(0, newline);
  const undecodable = () =>
    malformed(message('undecodable response line: %@', text.slice(0, PREVIEW_LENGTH)));

  const envelope = parseJson(text);
  if (!isJsonObject(envelope)) throw undecodable();
  const id = own(envelope, 'id');
  if (id !== undefined && id !== null && typeof id !== 'string') throw undecodable();

  const errorBody = own(envelope, 'error');
  if (errorBody !== undefined && errorBody !== null) {
    throw decodeErrorBody(errorBody) ?? undecodable();
  }
  if (id !== requestId) {
    throw malformed(
      message('response id %@ does not match request id %@', id ?? '<none>', requestId),
    );
  }
  const result = own(envelope, 'result');
  if (result === undefined || result === null) {
    throw malformed(message('response has neither result nor error'));
  }
  if (!isJsonObject(result)) throw undecodable();
  const fields: Readonly<Record<string, FieldKind>> = RESULT_FIELDS[tag];
  for (const [field, kind] of Object.entries(fields)) {
    if (!hasKind(own(result, field), kind)) throw undecodable();
  }
  return result as unknown as ResultOf<T>;
}
