import {
  apnsToken,
  type DevicePushTokenSource,
  fcmToken,
  type PushRegistrationState,
} from '@openagentspocket/core';

/** The slice of `expo-notifications` the token source uses; tests pass a fake. */
export interface NotificationsApi {
  getPermissionsAsync(): Promise<{ status: string }>;
  requestPermissionsAsync(): Promise<{ status: string }>;
  getDevicePushTokenAsync(): Promise<{ data: unknown }>;
  /** Android only: a channel must exist before any notification shows. */
  setNotificationChannelAsync?(
    id: string,
    channel: { name: string; importance: number },
  ): Promise<unknown>;
}

export interface DevicePushTokenOptions {
  readonly platform: 'ios' | 'android';
  /** iOS: a development build registers with the APNs sandbox. */
  readonly sandbox: boolean;
}

/** Android's `AndroidImportance.HIGH`; the channel makes pushes heads-up instead of silent. */
const CHANNEL_IMPORTANCE_HIGH = 4;

function granted(status: string): boolean {
  return status === 'granted';
}

/**
 * The real push token source. `state()` never prompts; `enable()` asks the OS for permission (the
 * Settings explainer runs first, Swift's "enable notifications" moment) and then reads the device
 * token. A denied permission is reported as `denied` so the screen can point to system settings.
 */
export function createDevicePushTokenSource(
  api: NotificationsApi,
  options: DevicePushTokenOptions,
): DevicePushTokenSource {
  const fetchToken = async (): Promise<PushRegistrationState> => {
    if (options.platform === 'android') {
      await api.setNotificationChannelAsync?.('default', {
        name: 'Agents',
        importance: CHANNEL_IMPORTANCE_HIGH,
      });
    }
    const { data } = await api.getDevicePushTokenAsync();
    if (typeof data !== 'string' || data === '') {
      return { kind: 'failed', message: 'The device did not return a push token.' };
    }
    const token =
      options.platform === 'android'
        ? fcmToken(data)
        : apnsToken(data, options.sandbox ? 'sandbox' : 'production');
    return { kind: 'registered', token };
  };
  return {
    async state() {
      try {
        const { status } = await api.getPermissionsAsync();
        if (granted(status)) return await fetchToken();
        return { kind: status === 'denied' ? 'denied' : 'needsPermission' };
      } catch {
        return { kind: 'needsPermission' };
      }
    },
    async enable() {
      try {
        let { status } = await api.getPermissionsAsync();
        if (!granted(status)) ({ status } = await api.requestPermissionsAsync());
        if (!granted(status)) return { kind: 'denied' };
        return await fetchToken();
      } catch (error) {
        return { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
