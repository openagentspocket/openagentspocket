import { encodeBase64Url } from '@openagentspocket/core';
import type { SharedKeychain } from 'agentico-app-group';
import { KeychainNotificationKeyStore } from './keychainKeyStore';

function fakeKeychain(): SharedKeychain & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    save: (account, value) => {
      items.set(account, value);
      return true;
    },
    read: (account) => items.get(account) ?? null,
    readAll: () => Object.fromEntries(items),
    remove: (account) => items.delete(account),
  };
}

const key = Uint8Array.from({ length: 32 }, (_, i) => i);

describe('KeychainNotificationKeyStore', () => {
  it('writes the versioned record the extension decodes and reads it back', () => {
    const keychain = fakeKeychain();
    const store = new KeychainNotificationKeyStore(keychain);
    store.save({ hostId: 'host-1', hostName: 'Studio', key });

    expect(JSON.parse(keychain.items.get('host-1') ?? '')).toEqual({
      v: 1,
      name: 'Studio',
      key: encodeBase64Url(key),
    });
    expect(store.record('host-1')?.key).toEqual(key);
    expect(store.allRecords()).toHaveLength(1);
  });

  it('skips records that no longer parse', () => {
    const keychain = fakeKeychain();
    const store = new KeychainNotificationKeyStore(keychain);
    store.save({ hostId: 'good', hostName: 'Studio', key });
    keychain.items.set('bad', 'not json');
    keychain.items.set('short', JSON.stringify({ v: 1, name: 'x', key: 'AAAA' }));
    keychain.items.set('future', JSON.stringify({ v: 2, name: 'x', key: encodeBase64Url(key) }));

    expect(store.allRecords().map((r) => r.hostId)).toEqual(['good']);
    expect(store.record('bad')).toBeNull();
  });

  it('refuses invalid records and throws when the Keychain refuses', () => {
    const store = new KeychainNotificationKeyStore(fakeKeychain());
    expect(() => store.save({ hostId: 'h', hostName: 'Studio', key: new Uint8Array(5) })).toThrow();
    expect(() => store.save({ hostId: 'h', hostName: ' ', key })).toThrow();
    const refusing = new KeychainNotificationKeyStore({ ...fakeKeychain(), save: () => false });
    expect(() => refusing.save({ hostId: 'h', hostName: 'Studio', key })).toThrow();
  });

  it('removes a record', () => {
    const store = new KeychainNotificationKeyStore(fakeKeychain());
    store.save({ hostId: 'h', hostName: 'Studio', key });
    store.removeRecord('h');
    expect(store.record('h')).toBeNull();
  });
});
