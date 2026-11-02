import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';

/** Must match `ios.entitlements` in app.json and the widget target's entitlements. */
export const APP_GROUP = 'group.com.openagentspocket.app';

export interface NativeAppGroup {
  containerPath(group: string): Promise<string | null>;
  writeFile(group: string, name: string, text: string): Promise<boolean>;
  readFile(group: string, name: string): Promise<string | null>;
  reloadWidgets(kinds: readonly string[]): Promise<void>;
}

/** What the app uses: the App Group file writer, shaped like core's `WidgetSnapshotPort`. */
export interface AppGroupStore {
  readonly available: boolean;
  containerPath(): Promise<string | null>;
  writeFile(name: string, text: string): Promise<boolean>;
  readFile(name: string): Promise<string | null>;
  reloadWidgets(kinds: readonly string[]): Promise<void>;
}

export function createAppGroupStore(native: NativeAppGroup, group = APP_GROUP): AppGroupStore {
  return {
    available: true,
    containerPath: () => native.containerPath(group),
    writeFile: (name, text) => native.writeFile(group, name, text),
    readFile: (name) => native.readFile(group, name),
    reloadWidgets: (kinds) => native.reloadWidgets(kinds),
  };
}

/** Widgets are Apple-only: elsewhere every call is a no-op that reports "not available". */
export const unavailableAppGroup: AppGroupStore = {
  available: false,
  containerPath: async () => null,
  writeFile: async () => false,
  readFile: async () => null,
  reloadWidgets: async () => undefined,
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
