import {
  fingerprintDisplay,
  fingerprintFromDigest,
  type Host,
  hostRoute,
  hostTrustKey,
  type NewPairedHost,
  type PairingCancellation,
  PairingCancelledError,
  type PairingCatalogHost,
  type PairingCode,
  type PairingConnector,
  type PairingDeviceKey,
  type PairingHostCatalog,
  type PairingResult,
  type PairingStep,
  routeUsesJumpHost,
} from '@openagentspocket/core';
import type { HostsModel } from './HostsModel';

function toPairingHost(host: Host): PairingCatalogHost {
  return {
    id: host.id,
    username: host.username,
    usesDeviceKey: host.authMethod === 'deviceKey',
    endpoint: host.herdrEndpoint,
    sessionName: host.sessionName,
    routes: host.routes.map((route) => ({
      address: route.address,
      port: route.port,
      usesJumpHost: routeUsesJumpHost(route),
    })),
  };
}

/** `SHA256:<unpadded base64>` back to its 32 digest bytes. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function digestOf(fingerprint: string): Uint8Array {
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of fingerprint.slice('SHA256:'.length)) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) continue;
    value = (value << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

/** The pairing flow's view of the Host catalog and the pinned host keys, over HostsModel. */
export class ModelPairingCatalog implements PairingHostCatalog {
  constructor(private readonly model: HostsModel) {}

  async hosts(): Promise<readonly PairingCatalogHost[]> {
    return this.model.getSnapshot().hosts.map(toPairingHost);
  }

  async pinnedFingerprints(hostId: string): Promise<readonly string[]> {
    const key = hostTrustKey(hostId);
    return this.model.knownHosts.fingerprints(key.host, key.port).map(fingerprintDisplay);
  }

  async addHost(paired: NewPairedHost): Promise<string> {
    const id = this.model.newId();
    const [first, ...rest] = paired.addresses.map((address) =>
      hostRoute({ id: this.model.newId(), address, port: paired.port }),
    );
    if (!first) throw new Error('a paired Host needs an address');
    await this.model.add(
      {
        id,
        name: '',
        username: paired.username,
        authMethod: 'deviceKey',
        sessionName: '',
        herdrEndpoint: paired.endpoint,
        routes: [first, ...rest],
      },
      null,
    );
    const key = hostTrustKey(id);
    this.model.knownHosts.setFingerprint(
      fingerprintFromDigest(digestOf(paired.hostKeyFingerprint)),
      key.host,
      key.port,
    );
    return id;
  }

  async addRoutes(
    hostId: string,
    routes: readonly { address: string; port: number }[],
  ): Promise<void> {
    const host = this.model.find(hostId);
    if (!host) throw new Error('unknown Host');
    const added = routes.map((route) => hostRoute({ id: this.model.newId(), ...route }));
    await this.model.update({ ...host, routes: [...host.routes, ...added] }, null);
  }
}

/** The key the offline build "enrolls": no private half exists. */
export const demoDeviceKey: PairingDeviceKey = {
  authorizedKeysLine: (comment) => `ssh-ed25519 AAAAdemo ${comment}`,
  fingerprint: 'SHA256:6+jncNdibsG2cqvfoLApGrO8CvIwAEMzsB+IilOs8tg',
};

const STEP_MS = 250;

/** Walks the ceremony's steps and succeeds against the first address of the code. */
export class DemoPairingConnector implements PairingConnector {
  constructor(private readonly stepMs: number = STEP_MS) {}

  async pair(
    code: PairingCode,
    _deviceKey: PairingDeviceKey,
    onStep: (step: PairingStep) => void,
    cancellation?: PairingCancellation,
  ): Promise<PairingResult> {
    const steps: PairingStep[] =
      code.bootstrap === null ? ['reach', 'verify'] : ['reach', 'enroll', 'verify'];
    for (const step of steps) {
      onStep(step);
      await new Promise<void>((resolve) => setTimeout(resolve, this.stepMs));
      if (cancellation?.aborted) throw new PairingCancelledError();
    }
    return {
      address: code.addresses[0] ?? '',
      port: code.port,
      username: code.username,
      hostKeyFingerprint: code.hostKeyFingerprint,
    };
  }
}
