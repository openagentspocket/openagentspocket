import { DeviceKeyStore } from '@openagentspocket/core';
import { FakeSsh } from 'agentico-ssh';
import { deviceKeyPort } from './deviceKeyPort';
import { secureSecretStore } from './secureSecretStore';

const mockItems = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  getItemAsync: async (key: string) => mockItems.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockItems.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    mockItems.delete(key);
  },
}));

describe('device stores', () => {
  it('round-trips secrets through the secure store adapter', async () => {
    await secureSecretStore.setItem('k', 'v');
    expect(await secureSecretStore.getItem('k')).toBe('v');
    await secureSecretStore.deleteItem('k');
    expect(await secureSecretStore.getItem('k')).toBeNull();
  });

  it('creates the device key once through the ssh module', async () => {
    const store = new DeviceKeyStore(deviceKeyPort(new FakeSsh()));
    const first = await store.publicKey('alias');
    expect(await store.publicKey('alias')).toBe(first);
  });
});
