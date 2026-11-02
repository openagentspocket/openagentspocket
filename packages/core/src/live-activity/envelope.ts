import { gcm } from '@noble/ciphers/aes.js';
import { encodeSortedJson } from '../notifications/json';
import { NOTIFICATION_KEY_BYTES, notificationKeyId } from '../notifications/key-store';
import { decodeBase64Url, encodeBase64Url, utf8Decode, utf8Encode } from '../pairing/bytes';
import type { JsonObject, JsonValue } from '../wire/json';
import { isJsonObject } from '../wire/json';
import { MAX_AGENTS } from './desire';
import {
  ACTIVITY_RESULTS,
  type ActivityAgentDetail,
  type ActivityAsk,
  type ActivityDetails,
  type ActivityEnvelope,
  type ActivityResult,
} from './types';

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
/** Domain separation from the notification envelope (`HERDR-NOTIFY:1`). */
const AAD = utf8Encode('HERDR-ACTIVITY:1');

export type ActivityEnvelopeErrorKind =
  | 'bad_envelope'
  | 'unsupported_version'
  | 'decrypt_failed'
  | 'bad_payload';

export class ActivityEnvelopeError extends Error {
  override readonly name = 'ActivityEnvelopeError';
  constructor(readonly kind: ActivityEnvelopeErrorKind) {
    super(`ActivityEnvelope.${kind}`);
  }
}

function askWire(ask: ActivityAsk): JsonObject {
  return {
    act: ask.denyOnly ? 2 : 1,
    bid: ask.episodeId,
    opts: [...ask.options],
    q: ask.prompt,
    ...(ask.result ? { res: ask.result } : {}),
    ts: ask.timestamp,
  };
}

function agentWire(agent: ActivityAgentDetail): JsonObject {
  return {
    ...(agent.ask ? { ask: askWire(agent.ask) } : {}),
    kind: agent.kind,
    ...(agent.name ? { name: agent.name } : {}),
    pane: agent.paneId,
    status: agent.status,
    ...(agent.title ? { title: agent.title } : {}),
    ...(agent.workspace ? { workspace: agent.workspace } : {}),
  };
}

/** The canonical plaintext: compact JSON, keys ascending at every level, agents capped at 5. */
export function canonicalPlaintext(details: ActivityDetails): string {
  return encodeSortedJson({
    agents: details.agents.slice(0, MAX_AGENTS).map(agentWire),
    host: details.hostName,
    v: 1,
  });
}

export function keyId(key: Uint8Array): string {
  return encodeBase64Url(notificationKeyId(key));
}

/** The frame key order is fixed (`v`, `kid`, `n`, `ct`); it is not alphabetical. */
export function envelopeWireText(envelope: ActivityEnvelope): string {
  return `{"v":${envelope.v},"kid":"${envelope.kid}","n":"${envelope.n}","ct":"${envelope.ct}"}`;
}

/** Seals `details` under the Host's Notification Key; the nonce is injected (12 random bytes). */
export function sealActivity(
  details: ActivityDetails,
  key: Uint8Array,
  nonce: Uint8Array,
): ActivityEnvelope {
  if (key.length !== NOTIFICATION_KEY_BYTES) throw new ActivityEnvelopeError('decrypt_failed');
  if (nonce.length !== NONCE_BYTES) throw new ActivityEnvelopeError('bad_envelope');
  const sealed = gcm(key, nonce, AAD).encrypt(utf8Encode(canonicalPlaintext(details)));
  return { v: 1, kid: keyId(key), n: encodeBase64Url(nonce), ct: encodeBase64Url(sealed) };
}

function frameOf(input: string | JsonValue): { n: Uint8Array; sealed: Uint8Array } {
  let value: unknown = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch {
      throw new ActivityEnvelopeError('bad_envelope');
    }
  }
  if (!isJsonObject(value as JsonValue)) throw new ActivityEnvelopeError('bad_envelope');
  const frame = value as JsonObject;
  if (typeof frame.v !== 'number' || !Number.isInteger(frame.v)) {
    throw new ActivityEnvelopeError('bad_envelope');
  }
  if (frame.v !== 1) throw new ActivityEnvelopeError('unsupported_version');
  if (typeof frame.kid !== 'string' || frame.kid === '') {
    throw new ActivityEnvelopeError('bad_envelope');
  }
  const n = typeof frame.n === 'string' ? decodeBase64Url(frame.n) : null;
  const sealed = typeof frame.ct === 'string' ? decodeBase64Url(frame.ct) : null;
  if (!n || n.length !== NONCE_BYTES || !sealed || sealed.length < TAG_BYTES) {
    throw new ActivityEnvelopeError('bad_envelope');
  }
  return { n, sealed };
}

const bad = () => new ActivityEnvelopeError('bad_payload');
const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

function parseAsk(value: unknown): ActivityAsk | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const ask = value as Record<string, unknown>;
  const opts = ask.opts;
  if (
    typeof ask.bid !== 'string' ||
    typeof ask.q !== 'string' ||
    !Array.isArray(opts) ||
    !opts.every((o) => typeof o === 'string') ||
    typeof ask.ts !== 'number'
  ) {
    return undefined; // a malformed ask is dropped on its own
  }
  const result = ACTIVITY_RESULTS.find((r) => r === ask.res) as ActivityResult | undefined;
  return {
    episodeId: ask.bid,
    denyOnly: ask.act === 2,
    prompt: ask.q,
    options: opts as string[],
    timestamp: ask.ts,
    ...(result ? { result } : {}),
  };
}

/** Opens an envelope (JSON text or parsed frame) with the Host's Notification Key. */
export function openActivity(envelope: string | JsonValue, key: Uint8Array): ActivityDetails {
  const { n, sealed } = frameOf(envelope);
  let plaintext: Uint8Array;
  try {
    if (key.length !== NOTIFICATION_KEY_BYTES) throw new Error('key');
    plaintext = gcm(key, n, AAD).decrypt(sealed);
  } catch {
    throw new ActivityEnvelopeError('decrypt_failed');
  }
  let body: unknown;
  try {
    body = JSON.parse(utf8Decode(plaintext));
  } catch {
    throw bad();
  }
  const root = body as { v?: unknown; host?: unknown; agents?: unknown };
  if (typeof body !== 'object' || body === null || root.v !== 1) throw bad();
  const hostName = str(root.host);
  if (!hostName || !Array.isArray(root.agents)) throw bad();
  const agents = root.agents.map((item: Record<string, unknown>): ActivityAgentDetail => {
    const paneId = str(item?.pane);
    const kind = str(item?.kind);
    const status = str(item?.status);
    if (!paneId || !kind || !status) throw bad();
    const ask = parseAsk(item.ask);
    const [name, workspace, title] = [str(item.name), str(item.workspace), str(item.title)];
    return {
      paneId,
      kind,
      status,
      ...(name ? { name } : {}),
      ...(workspace ? { workspace } : {}),
      ...(title ? { title } : {}),
      ...(ask ? { ask } : {}),
    };
  });
  return { hostName, agents };
}
