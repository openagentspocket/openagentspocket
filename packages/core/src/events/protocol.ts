import { failures, failWith } from './failure';

/** The oldest herdr protocol this app speaks. A floor, never an equality check. */
export const MINIMUM_PROTOCOL_VERSION = 17;
/** The protocol the committed schema snapshot was generated against. Advisory only. */
export const GENERATED_PROTOCOL_VERSION = 22;

/** What `ping` reports: the server's version and protocol. */
export interface PingInfo {
  readonly version: string;
  readonly protocolVersion: number;
}

export interface ServerInfo extends PingInfo {
  /**
   * The Host speaks a protocol newer than this build's schema snapshot. The
   * connection is usable (herdr's additions have been additive); features
   * added after this build cannot be driven. Surface it, never refuse on it.
   */
  readonly exceedsGeneratedProtocol: boolean;
}

/**
 * Applies the protocol floor to a `ping` answer. Below the floor throws a
 * `protocolVersionMismatch` failure, which is not retryable.
 */
export function serverInfoFromPing(ping: PingInfo): ServerInfo {
  if (!(ping.protocolVersion >= MINIMUM_PROTOCOL_VERSION)) {
    throw failWith(
      failures.protocolVersionMismatch(ping.protocolVersion, MINIMUM_PROTOCOL_VERSION),
    );
  }
  return {
    version: ping.version,
    protocolVersion: ping.protocolVersion,
    exceedsGeneratedProtocol: ping.protocolVersion > GENERATED_PROTOCOL_VERSION,
  };
}
