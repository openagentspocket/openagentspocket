import type { PortsStore } from '@openagentspocket/core';
import { demoPortsFactory } from './demo';

/** The Host a Ports screen opens on. */
export interface PortsTarget {
  hostId: string;
  hostName: string;
}

export type PortsStoreFactory = (target: PortsTarget) => PortsStore;

let factory: PortsStoreFactory = demoPortsFactory;
const stores = new Map<string, PortsStore>();

/** Swap the demo Host for the real one at the composition root (`sshPortsFactory`). */
export function setPortsStoreFactory(next: PortsStoreFactory): void {
  factory = next;
  stores.clear();
}

/** One store per Host while its Ports screens are open; `releasePortsStore` closes it. */
export function portsStoreFor(target: PortsTarget): PortsStore {
  let store = stores.get(target.hostId);
  if (!store) {
    store = factory(target);
    stores.set(target.hostId, store);
  }
  return store;
}

/** The Ports screens closed: stops the tunnel and ends the preview's connection. */
export function releasePortsStore(hostId: string): void {
  stores.get(hostId)?.close();
  stores.delete(hostId);
}
