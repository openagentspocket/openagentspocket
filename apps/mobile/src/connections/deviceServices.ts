import { DEFAULT_DEVICE_KEY_ALIAS } from '@openagentspocket/core';
import { appGroup } from 'agentico-app-group';
import { liveActivityController } from 'agentico-live-activity';
import { nativeSsh } from 'agentico-ssh';
import { AppState, Platform } from 'react-native';
import { systemClock } from '@/console/systemClock';
import { registerLiveRuntime } from '@/features/hosts/hostsRuntime';
import { secureRandomBytes } from '@/lib/secureRandom';
import { createDevicePushTokenSource, lazyNotifications } from '@/notifications/devicePushToken';
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
      appGroup: appGroup(),
      liveActivities: liveActivityController(),
      randomBytes: secureRandomBytes,
      pushTokenSource: createDevicePushTokenSource(lazyNotifications, {
        platform: Platform.OS === 'android' ? 'android' : 'ios',
        sandbox: __DEV__,
      }),
    });
  }
  return services;
}

registerLiveRuntime(() => deviceServices().runtime);
