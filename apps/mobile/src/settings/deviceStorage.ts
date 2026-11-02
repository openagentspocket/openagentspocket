import type { KeyValueStorage } from '@openagentspocket/core';
import Storage from 'expo-sqlite/kv-store';

/** The on-device key-value store (expo-sqlite's synchronous localStorage-style API). */
export const deviceStorage: KeyValueStorage = {
  getString: (key) => Storage.getItemSync(key) ?? undefined,
  set: (key, value) => Storage.setItemSync(key, value),
};
