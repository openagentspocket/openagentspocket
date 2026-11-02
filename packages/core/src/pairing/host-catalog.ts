import type { PairingResult } from './ceremony';
import type { PairingCode } from './code';
import { type HerdrEndpoint, sameHerdrEndpoint } from './endpoint';
import { sameFingerprint } from './fingerprint';

/** A saved Host as the pairing flow needs to see it (the Host model lives in hosts). */
export interface PairingCatalogHost {
  readonly id: string;
  readonly username: string;
  readonly usesDeviceKey: boolean;
  readonly endpoint: HerdrEndpoint | null;
  /** The herdr session preflight chose; `''` is the default session. */
  readonly sessionName: string;
  readonly routes: readonly {
    readonly address: string;
    readonly port: number;
    readonly usesJumpHost: boolean;
  }[];
}

/** The Host a verified ceremony creates. */
export interface NewPairedHost {
  readonly username: string;
  readonly port: number;
  /** One direct route per address, the one that answered first; the first route takes the Host's id. */
  readonly addresses: readonly string[];
  readonly endpoint: HerdrEndpoint | null;
  /** Pinned with the Host, so preflight never asks to trust it. */
  readonly hostKeyFingerprint: string;
}

/**
 * The seam over the Host catalog and the known-hosts store. Writes throw when
 * the catalog cannot be written; the store then reports `saveFailed`.
 */
export interface PairingHostCatalog {
  hosts(): Promise<readonly PairingCatalogHost[]>;
  /** The fingerprints already pinned for a saved Host. */
  pinnedFingerprints(hostId: string): Promise<readonly string[]>;
  /** Saves the Host, then pins its fingerprint. Resolves with the new Host id. */
  addHost(host: NewPairedHost): Promise<string>;
  /** Appends direct routes to a saved Host. */
  addRoutes(hostId: string, routes: readonly { address: string; port: number }[]): Promise<void>;
}

/**
 * Every candidate the code offered, led by the one that answered, so the
 * Host stays reachable from the networks each address was picked for.
 */
export function pairedAddresses(result: PairingResult, code: PairingCode): string[] {
  return [result.address, ...code.addresses.filter((address) => address !== result.address)];
}

/**
 * Whether a saved Host is the one this ceremony reached again: a Device Key
 * Host with the same account, the same herdr endpoint and the host key it
 * already pinned. A code without an endpoint names the default session, so
 * it matches only a Host with no session chosen.
 */
export function mayBePairedTwin(
  host: PairingCatalogHost,
  result: PairingResult,
  endpoint: HerdrEndpoint | null,
): boolean {
  return (
    host.usesDeviceKey &&
    host.username === result.username &&
    sameHerdrEndpoint(host.endpoint, endpoint) &&
    (endpoint !== null || host.sessionName === '')
  );
}

/** The saved twin of this ceremony's Host, if any; re-pairing updates it instead of adding another. */
export async function findPairedTwin(
  catalog: PairingHostCatalog,
  result: PairingResult,
  endpoint: HerdrEndpoint | null,
): Promise<PairingCatalogHost | null> {
  for (const host of await catalog.hosts()) {
    if (!mayBePairedTwin(host, result, endpoint)) continue;
    const pinned = await catalog.pinnedFingerprints(host.id);
    if (pinned.some((fingerprint) => sameFingerprint(fingerprint, result.hostKeyFingerprint))) {
      return host;
    }
  }
  return null;
}

/** The addresses a twin does not route to directly yet, on the ceremony's port. */
export function missingRoutes(
  host: PairingCatalogHost,
  addresses: readonly string[],
  port: number,
): { address: string; port: number }[] {
  const known = new Set(
    host.routes.filter((route) => !route.usesJumpHost).map((r) => `${r.address}:${r.port}`),
  );
  return addresses
    .filter((address) => !known.has(`${address}:${port}`))
    .map((address) => ({ address, port }));
}
