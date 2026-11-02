/**
 * This device's push token as a Host's registration entry carries it. iOS entries use the APNs
 * environments; Android entries use `env: "fcm"` and `platform: "android"` (plugin >= 0.12.0,
 * see `PLUGIN_FEATURE_MINIMUM.androidPush`).
 */
export interface PushDeviceToken {
  readonly platform: 'ios' | 'android';
  /** Hex APNs token, or the FCM registration token. */
  readonly token: string;
  readonly env: 'production' | 'sandbox' | 'fcm';
}

export function apnsToken(token: string, env: 'production' | 'sandbox'): PushDeviceToken {
  return { platform: 'ios', token, env };
}

export function fcmToken(token: string): PushDeviceToken {
  return { platform: 'android', token, env: 'fcm' };
}

/** Where the OS permission and push token stand, for the settings screen. */
export type PushRegistrationState =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'needsPermission' }
  | { readonly kind: 'waitingForToken' }
  | { readonly kind: 'registered'; readonly token: PushDeviceToken }
  | { readonly kind: 'denied' }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * The seam P5.3 (FCM) and P5.4 (APNs) implement: ask for permission, then fetch the token.
 * Nothing in this task fetches a token; the settings screen only drives this interface.
 */
export interface DevicePushTokenSource {
  /** The current state without prompting. */
  state(): Promise<PushRegistrationState>;
  /** Prompts for permission when needed, then resolves the token. Never throws. */
  enable(): Promise<PushRegistrationState>;
}

/** The stub used until a platform implementation lands: permission never granted, no token. */
export const unavailablePushTokenSource: DevicePushTokenSource = {
  state: async () => ({ kind: 'needsPermission' }),
  enable: async () => ({ kind: 'failed', message: 'Push is not available in this build.' }),
};
