import { DeviceKeyStore, HostCatalog, KnownHostsStore } from '@openagentspocket/core';
import { nativeSsh } from 'agentico-ssh';
import { deviceStorage } from '../settings/deviceStorage';
import { deviceKeyPort } from './deviceKeyPort';
import { secureSecretStore } from './secureSecretStore';

export { deviceKeyPort, secureSecretStore };

/** The persistent stores of the app, on the device adapters. */
export function createDeviceStores() {
  return {
    hostCatalog: new HostCatalog(deviceStorage, secureSecretStore),
    knownHosts: new KnownHostsStore(deviceStorage),
    deviceKey: new DeviceKeyStore(deviceKeyPort(nativeSsh())),
  };
}
