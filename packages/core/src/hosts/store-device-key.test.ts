import { describe, expect, it } from 'vitest';
import { DeviceKeyStore, MemoryDeviceKeyPort } from './store-device-key';

describe('DeviceKeyStore', () => {
  it('creates the key once per alias and returns the same public line after', async () => {
    const port = new MemoryDeviceKeyPort();
    const store = new DeviceKeyStore(port);
    const first = await store.publicKey('a');
    expect(await store.publicKey('a')).toBe(first);
    expect(port.generated).toBe(1);
    expect(await store.publicKey('b')).not.toBe(first);
    expect(port.generated).toBe(2);
  });

  it('shares one generation between concurrent first uses', async () => {
    const port = new MemoryDeviceKeyPort();
    const store = new DeviceKeyStore(port);
    const keys = await Promise.all([store.publicKey('a'), store.publicKey('a')]);
    expect(keys[0]).toBe(keys[1]);
    expect(port.generated).toBe(1);
  });

  it('keeps the key across store instances', async () => {
    const port = new MemoryDeviceKeyPort();
    const first = await new DeviceKeyStore(port).publicKey();
    expect(await new DeviceKeyStore(port).publicKey()).toBe(first);
  });

  it('replaces the key only when asked', async () => {
    const port = new MemoryDeviceKeyPort();
    const store = new DeviceKeyStore(port);
    const old = await store.publicKey('a');
    expect(await store.replace('a')).not.toBe(old);
    expect(port.generated).toBe(2);
  });
});
