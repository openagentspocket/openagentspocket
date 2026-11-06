import { DEFAULT_DEVICE_KEY_ALIAS, KeyAccessGate } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { systemClock } from '@openagentspocket/transport';
import { appGroup } from 'agentico-app-group';
import { liveActivityController } from 'agentico-live-activity';
import { nativeSsh } from 'agentico-ssh';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { registerLiveRuntime } from '@/features/hosts/hostsRuntime';
import { secureRandomBytes } from '@/lib/secureRandom';
import { isApnsSandbox } from '@/notifications/apnsEnvironment';
import { createDevicePushTokenSource, lazyNotifications } from '@/notifications/devicePushToken';
import { deviceAuthenticator } from '@/settings/deviceAuthenticator';
import { settingsStore } from '@/settings/deviceSettings';
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
      keyAccess: new KeyAccessGate({
        isRequired: () => settingsStore.get('appLockForKeys'),
        authenticate: () =>
          deviceAuthenticator.authenticate(t('Unlock your SSH keys to connect to your Hosts.')),
        clock: systemClock,
      }),
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
        sandbox: isApnsSandbox(Constants.expoConfig, __DEV__),
      }),
    });
  }
  return services;
}

registerLiveRuntime(() => deviceServices().runtime);
