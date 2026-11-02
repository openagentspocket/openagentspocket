import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';

/** Must match `ios.entitlements` in app.json and the widget target's entitlements. */
export const APP_GROUP = 'group.com.openagentspocket.app';

export interface NativeAppGroup {
  containerPath(group: string): Promise<string | null>;
  writeFile(group: string, name: string, text: string): Promise<boolean>;
  readFile(group: string, name: string): Promise<string | null>;
  reloadWidgets(kinds: readonly string[]): Promise<void>;
  requestNotificationAuthorization(): Promise<boolean>;
  keychainSave(service: string, group: string, account: string, value: string): boolean;
  keychainRead(service: string, group: string, account: string): string | null;
  keychainReadAll(service: string, group: string): Record<string, string>;
  keychainRemove(service: string, group: string, account: string): boolean;
}

/** Keychain items in the access group the Notification Service Extension reads. Synchronous. */
export interface SharedKeychain {
  save(account: string, value: string): boolean;
  read(account: string): string | null;
  readAll(): Record<string, string>;
  remove(account: string): boolean;
}

/** Keychain service of the Notification Keys; must match the extension's `NotificationKeyStore`. */
export const NOTIFICATION_KEYCHAIN_SERVICE = 'com.openagentspocket.notifications';

/** What the app uses: the App Group file writer, shaped like core's `WidgetSnapshotPort`. */
export interface AppGroupStore {
  readonly available: boolean;
  containerPath(): Promise<string | null>;
  writeFile(name: string, text: string): Promise<boolean>;
  readFile(name: string): Promise<string | null>;
  reloadWidgets(kinds: readonly string[]): Promise<void>;
  /** Asks iOS for notification permission (alert, sound, badge); false when denied. */
  requestNotificationAuthorization(): Promise<boolean>;
  /** The Notification Keys' Keychain (shared with the extension); null where there is none. */
  readonly notificationKeychain: SharedKeychain | null;
}

export function createAppGroupStore(native: NativeAppGroup, group = APP_GROUP): AppGroupStore {
  return {
    available: true,
    containerPath: () => native.containerPath(group),
    writeFile: (name, text) => native.writeFile(group, name, text),
    readFile: (name) => native.readFile(group, name),
    reloadWidgets: (kinds) => native.reloadWidgets(kinds),
    requestNotificationAuthorization: () => native.requestNotificationAuthorization(),
    notificationKeychain: {
      save: (account, value) =>
        native.keychainSave(NOTIFICATION_KEYCHAIN_SERVICE, group, account, value),
      read: (account) => native.keychainRead(NOTIFICATION_KEYCHAIN_SERVICE, group, account),
      readAll: () => native.keychainReadAll(NOTIFICATION_KEYCHAIN_SERVICE, group),
      remove: (account) => native.keychainRemove(NOTIFICATION_KEYCHAIN_SERVICE, group, account),
    },
  };
}

/** Widgets are Apple-only: elsewhere every call is a no-op that reports "not available". */
export const unavailableAppGroup: AppGroupStore = {
  available: false,
  containerPath: async () => null,
  writeFile: async () => false,
  readFile: async () => null,
  reloadWidgets: async () => undefined,
  requestNotificationAuthorization: async () => false,
  notificationKeychain: null,
};

let store: AppGroupStore | undefined;

/** Loaded on first use so importing this package never requires the native module. */
export function appGroup(): AppGroupStore {
  store ??=
    Platform.OS === 'ios'
      ? createAppGroupStore(requireNativeModule<NativeAppGroup>('AgenticoAppGroup'))
      : unavailableAppGroup;
  return store;
}
