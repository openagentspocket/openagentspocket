// What one rollout line holds, read from its first bytes only (Swift CodexLineClassifier).
// The envelope's `type` sits in the first hundred bytes and a turn item's `type` within the first
// few hundred, so a short prefix decides which lines are worth decoding.

import {
  CLOSE_BRACE,
  COLON,
  COMMA,
  decodeString,
  isJsonWhitespace,
  OPEN_BRACE,
  QUOTE,
  valueEnd,
} from './json-bytes';

export type CodexLineKind =
  | { type: 'sessionMeta' }
  | { type: 'event'; value: string }
  | { type: 'item'; value: string }
  | { type: 'response'; value: string }
  | { type: 'retainedContext'; value: string }
  | { type: 'compacted' }
  | { type: 'ignorable'; value: string }
  | { type: 'unknown'; value: string }
  | { type: 'unclassified' };

export interface CodexLineClassification {
  kind: CodexLineKind;
  /** The envelope's `ordinal`; absent in legacy rollouts. */
  ordinal: number | null;
  /** `payload.name`: a response item's tool name. */
  name: string | null;
  /** `payload.role`: a response message's role. */
  role: string | null;
  /** `payload.call_id`, when it falls inside the scanned prefix. */
  callID: string | null;
}

/** How much of a line the classifier reads by default. */
export const CLASSIFIER_PREFIX_LIMIT = 512;

/** Top-level types Codex writes that hold nothing for Chat. */
export const IGNORABLE_TYPES: ReadonlySet<string> = new Set([
  'turn_context',
  'world_state',
  'token_usage_record',
  'security_risk_score',
  'inter_agent_communication',
  'inter_agent_communication_metadata',
  'realtime_item',
]);

type Level = 'root' | 'payload' | 'item';

interface Found {
  rootType: string | null;
  ordinal: number | null;
  payloadType: string | null;
  name: string | null;
  role: string | null;
  callID: string | null;
  itemType: string | null;
}

class Scanner {
  index = 0;
  readonly found: Found = {
    rootType: null,
    ordinal: null,
    payloadType: null,
    name: null,
    role: null,
    callID: null,
    itemType: null,
  };

  constructor(private readonly bytes: Uint8Array) {}

  scan(): void {
    this.skipWhitespace();
    if (this.bytes[this.index] !== OPEN_BRACE) return;
    this.index += 1;
    this.scanObject('root');
  }

  private skipWhitespace(): void {
    while (this.index < this.bytes.length && isJsonWhitespace(this.bytes[this.index] as number)) {
      this.index += 1;
    }
  }

  private readString(): string | null {
    if (this.bytes[this.index] !== QUOTE) return null;
    const decoded = decodeString(this.bytes, this.index);
    if (!decoded) return null;
    this.index = decoded[1];
    return decoded[0];
  }

  private skipValue(): boolean {
    const end = valueEnd(this.bytes, this.index);
    if (end === null) return false;
    this.index = end;
    return true;
  }

  private capture(
    field: 'rootType' | 'payloadType' | 'name' | 'role' | 'callID' | 'itemType',
  ): boolean {
    if (this.bytes[this.index] !== QUOTE) return this.skipValue();
    const value = this.readString();
    if (value === null) return false;
    this.found[field] = value;
    return true;
  }

  private captureOrdinal(): boolean {
    const start = this.index;
    if (!this.skipValue()) return false;
    let token = '';
    for (let i = start; i < this.index; i += 1)
      token += String.fromCharCode(this.bytes[i] as number);
    if (/^[0-9]+$/.test(token)) this.found.ordinal = Number(token);
    return true;
  }

  private descend(level: Level): boolean {
    if (this.bytes[this.index] !== OPEN_BRACE) return this.skipValue();
    this.index += 1;
    return this.scanObject(level);
  }

  private scanMember(level: Level, key: string): boolean {
    if (level === 'root') {
      if (key === 'type') return this.capture('rootType');
      if (key === 'ordinal') return this.captureOrdinal();
      if (key === 'payload') return this.descend('payload');
    } else if (level === 'payload') {
      if (key === 'type') return this.capture('payloadType');
      if (key === 'name') return this.capture('name');
      if (key === 'role') return this.capture('role');
      if (key === 'call_id') return this.capture('callID');
      if (key === 'item') return this.descend('item');
    } else if (key === 'type') {
      return this.capture('itemType');
    }
    return this.skipValue();
  }

  /** False when the bytes ran out or stopped making sense, which ends the whole scan. */
  private scanObject(level: Level): boolean {
    this.skipWhitespace();
    if (this.bytes[this.index] === CLOSE_BRACE) {
      this.index += 1;
      return true;
    }
    for (;;) {
      this.skipWhitespace();
      const key = this.readString();
      if (key === null) return false;
      this.skipWhitespace();
      if (this.bytes[this.index] !== COLON) return false;
      this.index += 1;
      this.skipWhitespace();
      if (this.index >= this.bytes.length) return false;
      if (!this.scanMember(level, key)) return false;
      this.skipWhitespace();
      const next = this.bytes[this.index];
      if (next === COMMA) this.index += 1;
      else if (next === CLOSE_BRACE) {
        this.index += 1;
        return true;
      } else return false;
    }
  }
}

function kindOf(found: Found): CodexLineKind {
  const { rootType, payloadType, itemType } = found;
  if (rootType === null) return { type: 'unclassified' };
  switch (rootType) {
    case 'session_meta':
      return { type: 'sessionMeta' };
    case 'event_msg':
      if (payloadType === null) return { type: 'unclassified' };
      if (payloadType === 'item_completed') {
        return itemType === null ? { type: 'unclassified' } : { type: 'item', value: itemType };
      }
      return { type: 'event', value: payloadType };
    case 'response_item':
      return payloadType === null
        ? { type: 'unclassified' }
        : { type: 'response', value: payloadType };
    case 'retained_context':
      return payloadType === null
        ? { type: 'unclassified' }
        : { type: 'retainedContext', value: payloadType };
    case 'compacted':
      return { type: 'compacted' };
    default:
      return IGNORABLE_TYPES.has(rootType)
        ? { type: 'ignorable', value: rootType }
        : { type: 'unknown', value: rootType };
  }
}

/**
 * Classifies a line from at most `limit` of its first bytes. Fields the limit cuts off stay null;
 * a kind the prefix cannot settle is `unclassified`, and the caller may retry with a larger limit.
 */
export function classifyLine(
  bytes: Uint8Array,
  limit: number = CLASSIFIER_PREFIX_LIMIT,
): CodexLineClassification {
  const scanner = new Scanner(bytes.subarray(0, Math.max(0, limit)));
  scanner.scan();
  const found = scanner.found;
  return {
    kind: kindOf(found),
    ordinal: found.ordinal,
    name: found.name,
    role: found.role,
    callID: found.callID,
  };
}
