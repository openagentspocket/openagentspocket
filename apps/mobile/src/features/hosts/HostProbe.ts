import {
  fingerprintFromBlob,
  type Host,
  type HostKeyFingerprint,
  type HostKeyPolicy,
  PREFLIGHT_ALL_PASSED,
  type PreflightError,
  type PreflightReport,
  preflightReportFor,
  verifyHostKey,
} from '@openagentspocket/core';

/** What one preflight run found. */
export interface ProbeOutcome {
  readonly report: PreflightReport;
  /** The route that reached the Host, when the connection check passed. */
  readonly routeInUse: string | null;
  /** The key the Host presented when it differs from the trusted one. */
  readonly changedKey: { known: HostKeyFingerprint; presented: HostKeyFingerprint } | null;
}

/**
 * The seam over the live transport: connect through the route race, check the host key
 * with `policy`, ping herdr. P1.7 implements it over SSH; `DemoHostProbe` stands in.
 */
export interface HostProbe {
  run(host: Host, policy: HostKeyPolicy): Promise<ProbeOutcome>;
}

const ALGORITHM = 'ssh-ed25519';

function asciiBytes(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0) & 0x7f);
}

/** An SSH wire-format public key blob: the algorithm string, then key bytes. */
function keyBlob(seed: string): Uint8Array {
  const name = asciiBytes(ALGORITHM);
  const body = asciiBytes(seed);
  const blob = new Uint8Array(4 + name.length + body.length);
  blob.set([0, 0, 0, name.length], 0);
  blob.set(name, 4);
  blob.set(body, 4 + name.length);
  return blob;
}

/**
 * Scripted Host for the offline build: each Host presents a stable key until `rotateKey`
 * changes it, and `failWith` makes the next runs fail past the host-key check.
 */
export class DemoHostProbe implements HostProbe {
  private readonly rotations = new Map<string, number>();
  private readonly failures = new Map<string, PreflightError>();

  /** The Host presents a different key from now on, as a reinstalled server does. */
  rotateKey(hostId: string): void {
    this.rotations.set(hostId, (this.rotations.get(hostId) ?? 0) + 1);
  }

  failWith(hostId: string, error: PreflightError | null): void {
    if (error) this.failures.set(hostId, error);
    else this.failures.delete(hostId);
  }

  async run(host: Host, policy: HostKeyPolicy): Promise<ProbeOutcome> {
    const route = host.routes[0];
    const presented = fingerprintFromBlob(
      keyBlob(`${host.id}#${this.rotations.get(host.id) ?? 0}`),
    );
    const failure = await verifyHostKey({
      host: route.address,
      port: route.port,
      trust: { kind: 'host', hostId: host.id },
      policy,
      presented,
    });
    const usesEndpoint = host.herdrEndpoint !== null;
    if (failure?.kind === 'hostKeyMismatch') {
      const error: PreflightError = { ...failure };
      return {
        report: preflightReportFor(error, host.authMethod, usesEndpoint),
        routeInUse: null,
        changedKey: { known: failure.known, presented: failure.presented },
      };
    }
    if (failure) {
      const error: PreflightError = { kind: 'hostKeyRejected', presented: failure.presented };
      return {
        report: preflightReportFor(error, host.authMethod, usesEndpoint),
        routeInUse: null,
        changedKey: null,
      };
    }
    const scripted = this.failures.get(host.id);
    if (scripted) {
      return {
        report: preflightReportFor(scripted, host.authMethod, usesEndpoint),
        routeInUse: route.id,
        changedKey: null,
      };
    }
    return { report: PREFLIGHT_ALL_PASSED, routeInUse: route.id, changedKey: null };
  }
}
