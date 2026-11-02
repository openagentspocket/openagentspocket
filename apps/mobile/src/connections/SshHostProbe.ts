import {
  asTransportError,
  type Clock,
  fingerprintFromDigest,
  type Host,
  type HostKeyPolicy,
  PREFLIGHT_ALL_PASSED,
  type PreflightError,
  preflightReportFor,
  renderText,
  serverInfoFromPing,
  type TransportError,
  UNKNOWN_HOST_KEY_ALGORITHM,
} from '@openagentspocket/core';
import { connectTransport } from '@openagentspocket/transport';
import type { HostKey, SshModule } from 'agentico-ssh';
import type { HostProbe, ProbeOutcome } from '@/features/hosts/HostProbe';
import { digestOf } from '@/features/hosts/pairingAdapters';
import { transportSettingsFor } from './transportSettings';

export interface SshHostProbeOptions {
  readonly ssh: SshModule;
  readonly keyAlias: string;
  readonly clock: Clock;
  readonly ensureDeviceKey: () => Promise<unknown>;
  readonly connect?: typeof connectTransport;
}

/** The transport's display-string fingerprints back to the objects preflight reports on. */
export function toPreflightError(error: TransportError, algorithm: string): PreflightError {
  const parse = (display: string) => fingerprintFromDigest(digestOf(display), algorithm);
  switch (error.kind) {
    case 'hostKeyRejected':
      return { kind: 'hostKeyRejected', presented: parse(error.presented) };
    case 'hostKeyMismatch':
      return {
        kind: 'hostKeyMismatch',
        known: parse(error.known),
        presented: parse(error.presented),
      };
    case 'jumpHostFailed':
      return { kind: 'jumpHostFailed', underlying: toPreflightError(error.underlying, algorithm) };
    case 'noRouteReached':
      return {
        kind: 'noRouteReached',
        failures: error.failures.map((failure) => ({
          ...failure,
          error: toPreflightError(failure.error, algorithm),
        })),
      };
    case 'malformedResponse':
      return { kind: 'malformedResponse', detail: renderText(error.detail) };
    case 'attachExited':
      return { kind: 'attachExited', status: error.status, output: error.output ?? null };
    default:
      return error;
  }
}

function mismatchIn(error: PreflightError): ProbeOutcome['changedKey'] {
  if (error.kind === 'hostKeyMismatch') return { known: error.known, presented: error.presented };
  if (error.kind !== 'noRouteReached') return null;
  for (const failure of error.failures) {
    const found = mismatchIn(failure.error);
    if (found) return found;
  }
  return null;
}

/**
 * The real preflight: connect through the route race with the screen's host-key policy, then
 * ping herdr (which resolves HOME, finds the socket, wakes the server and applies the protocol
 * floor). A run fails at exactly one check, as the report expects.
 */
export class SshHostProbe implements HostProbe {
  constructor(private readonly options: SshHostProbeOptions) {}

  async run(host: Host, policy: HostKeyPolicy): Promise<ProbeOutcome> {
    const { options } = this;
    const usesEndpoint = host.herdrEndpoint !== null;
    let presentedKey: HostKey | null = null;
    // Remembers the key the Host presented, so a mismatch can show both sides.
    const recording: SshModule = {
      generateKey: (alias) => options.ssh.generateKey(alias),
      publicKey: (alias) => options.ssh.publicKey(alias),
      deleteKey: (alias) => options.ssh.deleteKey(alias),
      connect: (connectOptions) =>
        options.ssh.connect({
          ...connectOptions,
          confirmHostKey: connectOptions.confirmHostKey
            ? async (key) => {
                presentedKey = key;
                return (await connectOptions.confirmHostKey?.(key)) ?? true;
              }
            : undefined,
        }),
    };
    try {
      await options.ensureDeviceKey();
      const settings = transportSettingsFor(host, {
        keyAlias: options.keyAlias,
        clock: options.clock,
        policy,
      });
      const transport = await (options.connect ?? connectTransport)(recording, settings);
      try {
        serverInfoFromPing(await transport.ping());
      } catch (error) {
        return this.failed(error, host, usesEndpoint, presentedKey, transport.routeId ?? null);
      } finally {
        await transport.close().catch(() => undefined);
      }
      return {
        report: PREFLIGHT_ALL_PASSED,
        routeInUse: transport.routeId ?? null,
        changedKey: null,
      };
    } catch (error) {
      return this.failed(error, host, usesEndpoint, presentedKey, null);
    }
  }

  private failed(
    thrown: unknown,
    host: Host,
    usesEndpoint: boolean,
    presentedKey: HostKey | null,
    routeInUse: string | null,
  ): ProbeOutcome {
    const error = toPreflightError(
      asTransportError(thrown),
      presentedKey?.algorithm ?? UNKNOWN_HOST_KEY_ALGORITHM,
    );
    return {
      report: preflightReportFor(error, host.authMethod, usesEndpoint),
      routeInUse,
      changedKey: mismatchIn(error),
    };
  }
}
