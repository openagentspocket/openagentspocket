import { utf8Decode, utf8Encode, utf8Length } from './bytes';
import {
  isTailscaleSSH,
  PairingCancelledError,
  type PairingCeremonyFailure,
  type PairingResult,
  type PairingStep,
  parseEnrollmentResponse,
} from './ceremony';
import type { PairingCode } from './code';
import {
  AUTHENTICATION_TIMEOUT_MS,
  checkCancellation,
  closeQuietly,
  describeError,
  ENROLLMENT_COMMAND,
  fail,
  isAuthenticationFailure,
  isCancellation,
  MAXIMUM_ENROLLMENT_LINE_BYTES,
  type PairingCancellation,
  type PairingConnector,
  type PairingDeviceKey,
  type PairingIdentity,
  type PairingSSHConnection,
  PairingSSHError,
  type SSHPairingConnectorOptions,
} from './connector';
import { sameFingerprint } from './fingerprint';

interface ReachedHost {
  readonly connection: PairingSSHConnection;
  readonly address: string;
  readonly presented: string;
}

/**
 * The production ceremony client over the SSH seam: two short-lived
 * connections perform Bootstrap Enrollment and the verified Device Key
 * reconnect, with the code's host key pin enforced before either
 * authentication attempt. A config-only code (no Bootstrap Key) only reaches
 * and verifies with the Device Key.
 */
export function createSSHPairingConnector(options: SSHPairingConnectorOptions): PairingConnector {
  const perAddressTimeoutMs = options.perAddressTimeoutMs ?? 4_000;
  const enrollTimeoutMs = options.enrollTimeoutMs ?? 20_000;
  const comment = options.deviceKeyComment ?? 'agentico';
  const identifiesTailscale = options.identifiesTailscaleSSH ?? isTailscaleSSH;
  const { dial } = options;

  /** A dial whose failure other than cancellation is reported, not thrown. */
  async function tryDial(
    host: string,
    port: number,
  ): Promise<{ connection: PairingSSHConnection } | { error: unknown }> {
    if (host === '' || !Number.isInteger(port) || port < 0 || port > 65535) {
      return { error: new Error('invalid SSH endpoint') };
    }
    try {
      return { connection: await dial({ host, port }, perAddressTimeoutMs) };
    } catch (error) {
      if (isCancellation(error)) throw new PairingCancelledError();
      return { error };
    }
  }

  /**
   * Tries candidates in order. A different host key is another machine and
   * is skipped. Once the pin matches, an authentication rejection is
   * authoritative and stops failover. With `refusingTailscaleSSH`, a
   * candidate answered by Tailscale SSH is skipped before its key is even
   * compared: tailscaled can present the system's OpenSSH key.
   */
  async function reach(
    code: PairingCode,
    identity: PairingIdentity,
    refusingTailscaleSSH: boolean,
    whenAuthenticationFails: PairingCeremonyFailure,
    cancellation: PairingCancellation | undefined,
  ): Promise<ReachedHost> {
    const attempts: string[] = [];
    const tailscaleAddresses: string[] = [];
    for (const address of code.addresses) {
      checkCancellation(cancellation);
      const dialed = await tryDial(address, code.port);
      if ('error' in dialed) {
        attempts.push(`${address}: ${describeError(dialed.error)}`);
        continue;
      }
      const { connection } = dialed;
      if (refusingTailscaleSSH && identifiesTailscale(connection.serverIdentification)) {
        await closeQuietly(connection);
        attempts.push(`${address}: answered by Tailscale SSH`);
        tailscaleAddresses.push(address);
        continue;
      }
      const presented = connection.hostKeyFingerprint;
      if (!sameFingerprint(presented, code.hostKeyFingerprint)) {
        await closeQuietly(connection);
        attempts.push(`${address}: presented ${presented}, not the pinned host key`);
        continue;
      }
      try {
        await connection.authenticate(code.username, identity, AUTHENTICATION_TIMEOUT_MS);
        return { connection, address, presented };
      } catch (error) {
        await closeQuietly(connection);
        if (isAuthenticationFailure(error)) throw fail(whenAuthenticationFails);
        if (isCancellation(error)) throw new PairingCancelledError();
        attempts.push(`${address}: ${describeError(error)}`);
      }
    }
    if (tailscaleAddresses.length > 0) {
      throw fail({ kind: 'tailscaleSSH', addresses: tailscaleAddresses, port: code.port });
    }
    throw fail({ kind: 'hostUnreachable', detail: attempts.join('; ') });
  }

  /**
   * The Bootstrap authorized_keys entry forces the Enrollment command, so the
   * requested command is inert. Exactly one Device Key line goes out and only
   * one bounded protocol line is accepted.
   */
  async function enroll(deviceKey: PairingDeviceKey, connection: PairingSSHConnection) {
    const line = deviceKey.authorizedKeysLine(comment);
    if (/[\0\n\r]/.test(line) || utf8Length(line) >= MAXIMUM_ENROLLMENT_LINE_BYTES) {
      throw fail({
        kind: 'enrollmentFailed',
        detail: 'the Device Key submission was not one bounded line',
      });
    }
    let response: Uint8Array;
    try {
      response = await connection.executeResponseLine(
        ENROLLMENT_COMMAND,
        utf8Encode(`${line}\n`),
        MAXIMUM_ENROLLMENT_LINE_BYTES,
        enrollTimeoutMs,
      );
    } catch (error) {
      if (isCancellation(error)) throw new PairingCancelledError();
      const kind = error instanceof PairingSSHError ? error.kind : 'other';
      if (kind === 'timedOut') {
        throw fail({ kind: 'enrollmentFailed', detail: 'the Enrollment exchange timed out' });
      }
      if (kind === 'unexpectedEOF') throw fail({ kind: 'enrollmentUnanswered' });
      throw fail({ kind: 'enrollmentFailed', detail: describeError(error) });
    }
    if (response[response.length - 1] !== 0x0a) throw fail({ kind: 'enrollmentUnanswered' });
    const responseLine = utf8Decode(response.subarray(0, response.length - 1));
    const parsed = parseEnrollmentResponse(responseLine);
    if (parsed === null) {
      throw fail({
        kind: 'enrollmentFailed',
        detail: `unexpected accept response: ${[...responseLine].slice(0, 200).join('')}`,
      });
    }
    if (parsed.kind === 'refused') {
      throw fail({ kind: 'enrollmentRefused', refusal: parsed.refusal });
    }
    if (parsed.fingerprint !== deviceKey.fingerprint) {
      throw fail({
        kind: 'enrollmentFailed',
        detail: `the Host enrolled a different key: ${parsed.fingerprint}`,
      });
    }
  }

  /** Reconnects to the successful candidate with the same pin and the Device Key. */
  async function verify(
    code: PairingCode,
    address: string,
    deviceKey: PairingDeviceKey,
  ): Promise<PairingResult> {
    const dialed = await tryDial(address, code.port);
    if ('error' in dialed) {
      throw fail({ kind: 'verificationFailed', detail: describeError(dialed.error) });
    }
    const { connection } = dialed;
    const presented = connection.hostKeyFingerprint;
    if (!sameFingerprint(presented, code.hostKeyFingerprint)) {
      await closeQuietly(connection);
      throw fail({
        kind: 'verificationFailed',
        detail: `the host key changed mid-ceremony to ${presented}`,
      });
    }
    try {
      await connection.authenticate(
        code.username,
        { kind: 'device', key: deviceKey },
        AUTHENTICATION_TIMEOUT_MS,
      );
    } catch (error) {
      await closeQuietly(connection);
      if (isCancellation(error)) throw new PairingCancelledError();
      const detail = isAuthenticationFailure(error)
        ? 'the Host did not accept the enrolled Device Key'
        : describeError(error);
      throw fail({ kind: 'verificationFailed', detail });
    }
    await closeQuietly(connection);
    return { address, port: code.port, username: code.username, hostKeyFingerprint: presented };
  }

  async function pair(
    code: PairingCode,
    deviceKey: PairingDeviceKey,
    onStep: (step: PairingStep) => void,
    cancellation?: PairingCancellation,
  ): Promise<PairingResult> {
    const device: PairingIdentity = { kind: 'device', key: deviceKey };
    if (code.bootstrap === null) {
      onStep('reach');
      const reached = await reach(
        code,
        device,
        false,
        {
          kind: 'verificationFailed',
          detail: 'The Host did not accept the Device Key; it is not enrolled there yet.',
        },
        cancellation,
      );
      onStep('verify');
      await closeQuietly(reached.connection);
      return {
        address: reached.address,
        port: code.port,
        username: code.username,
        hostKeyFingerprint: reached.presented,
      };
    }

    onStep('reach');
    const reached = await reach(
      code,
      { kind: 'bootstrap', seed: code.bootstrap.seed },
      true,
      { kind: 'bootstrapRejected' },
      cancellation,
    );
    onStep('enroll');
    try {
      await enroll(deviceKey, reached.connection);
    } finally {
      await closeQuietly(reached.connection);
    }
    checkCancellation(cancellation);
    onStep('verify');
    return verify(code, reached.address, deviceKey);
  }

  return { pair };
}
