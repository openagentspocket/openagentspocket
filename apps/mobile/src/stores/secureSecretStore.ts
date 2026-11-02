import type { SecretStore } from '@openagentspocket/core';
import * as SecureStore from 'expo-secure-store';

/** Secrets in the platform keychain/keystore; unreadable until first unlock, never backed up. */
export const secureSecretStore: SecretStore = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  deleteItem: (key) => SecureStore.deleteItemAsync(key),
};
