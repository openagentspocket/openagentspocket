import { DEFAULT_DEVICE_KEY_ALIAS } from '@openagentspocket/core';
import { nativeSsh } from 'agentico-ssh';
import { AppState } from 'react-native';
import { systemClock } from '@/console/systemClock';
import { registerLiveRuntime } from '@/features/hosts/hostsRuntime';
import { deviceStorage } from '@/settings/deviceStorage';
import { createDeviceStores } from '@/stores';
import { createChatTranscriptCache } from '@/stores/expoCacheFileStore';
import { createLiveServices, type LiveServices } from './liveServices';

let services: LiveServices | undefined;

/** The app's one set of live services, built on first use from the device adapters. */
export function deviceServices(): LiveServices {
  if (!services) {
    const stores = createDeviceStores();
    services = createLiveServices({
      ssh: nativeSsh(),
      hostCatalog: stores.hostCatalog,
      knownHosts: stores.knownHosts,
      deviceKey: stores.deviceKey,
      storage: deviceStorage,
      chatCache: createChatTranscriptCache(stores.knownHosts),
      clock: systemClock,
      keyAlias: DEFAULT_DEVICE_KEY_ALIAS,
      initiallyActive: AppState.currentState === 'active',
    });
  }
  return services;
}

registerLiveRuntime(() => deviceServices().runtime);
