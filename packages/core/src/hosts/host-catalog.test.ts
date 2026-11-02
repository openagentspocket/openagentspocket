import { describe, expect, it } from 'vitest';
import { type Host, hostRoute } from './host';
import {
  HOSTS_STORAGE_KEY,
  HostCatalog,
  HostCatalogError,
  MemorySecretStore,
  passwordAccount,
  rsaKeyAccount,
} from './host-catalog';
import { duplicateHostDraft, hostFromDraft } from './host-draft';
import { MemoryStorage } from './known-hosts';

const host = (id: string, fields: Partial<Host> = {}): Host => ({
  id,
  name: id,
  username: 'dev',
  authMethod: 'deviceKey',
  sessionName: '',
  herdrEndpoint: null,
  routes: [hostRoute({ id: `${id}-route`, address: `${id}.example` })],
  ...fields,
});

const raw = (id: string, fields: Record<string, unknown> = {}) => ({
  ...JSON.parse(JSON.stringify(host(id))),
  ...fields,
});

function setup(stored?: unknown) {
  const storage = new MemoryStorage();
  if (stored !== undefined) {
    storage.set(HOSTS_STORAGE_KEY, typeof stored === 'string' ? stored : JSON.stringify(stored));
  }
  const secrets = new MemorySecretStore();
  return { storage, secrets, catalog: new HostCatalog(storage, secrets) };
}

const persisted = (storage: MemoryStorage) =>
  JSON.parse(storage.getString(HOSTS_STORAGE_KEY) ?? 'null') as {
    version: number;
    hosts: { id: string }[];
  };

describe('host catalog', () => {
  it('persists across instances in a versioned envelope', async () => {
    const { storage, secrets, catalog } = setup();
    await catalog.add(host('a'));
    expect(persisted(storage).version).toBe(1);
    expect(new HostCatalog(storage, secrets).hosts).toEqual([host('a')]);
  });

  it('hides a Host with an unknown auth method or endpoint, and keeps it on every write', async () => {
    const future = raw('future', { authMethod: 'hardwareBackedKey', futureField: 'preserve-me' });
    const badEndpoint = raw('studio', {
      herdrEndpoint: { socketPath: 'relative', executablePath: '/x' },
    });
    const stored = JSON.stringify({
      version: 1,
      hosts: [raw('first'), future, badEndpoint, raw('second')],
    });
    const { storage, catalog } = setup(stored);

    expect(catalog.hosts.map((h) => h.id)).toEqual(['first', 'second']);
    expect(catalog.catalogLoadError).toBeNull();
    // Loading must not rewrite the unread entries away.
    expect(storage.getString(HOSTS_STORAGE_KEY)).toBe(stored);

    await catalog.add(host('added'));
    await catalog.update({ ...host('first'), name: 'Edited' });
    await catalog.remove('second');

    const after = persisted(storage).hosts;
    expect(after.map((h) => h.id)).toEqual(['first', 'future', 'studio', 'added']);
    expect(after[1]).toEqual(future);
    expect(after[2]).toEqual(badEndpoint);
  });

  it('treats a malformed Host of a known auth method as an unreadable catalog', () => {
    const stored = JSON.stringify({
      version: 1,
      hosts: [raw('broken', { routes: [{ id: 'r', address: 'x', port: 'twenty-two' }] })],
    });
    const { storage, catalog } = setup(stored);
    expect(catalog.hosts).toEqual([]);
    expect(catalog.catalogLoadError).toBe('catalogUnreadable');
    expect(storage.getString(HOSTS_STORAGE_KEY)).toBe(stored);
  });

  it.each(['not-json', '[]', '{"version":2,"hosts":[]}', '{"version":1,"hosts":[{"id":"x"}]}'])(
    'never overwrites a catalog it could not read: %s',
    async (stored) => {
      const { storage, catalog } = setup(stored);
      await expect(catalog.add(host('a'))).rejects.toEqual(
        new HostCatalogError('catalogUnreadable'),
      );
      expect(storage.getString(HOSTS_STORAGE_KEY)).toBe(stored);
    },
  );

  it('replaces a stored Host on update, and refuses an unknown one', async () => {
    const { catalog } = setup();
    await catalog.add(host('a'));
    await catalog.update({ ...host('a'), name: 'Renamed' });
    expect(catalog.hosts.map((h) => h.name)).toEqual(['Renamed']);
    await expect(catalog.update(host('missing'))).rejects.toEqual(
      new HostCatalogError('unknownHost'),
    );
    await expect(catalog.remove('missing')).rejects.toEqual(new HostCatalogError('unknownHost'));
  });

  it('removes a Host and its password', async () => {
    const { secrets, catalog } = setup();
    await catalog.add(host('a', { authMethod: 'password' }), 'hunter2');
    await catalog.remove('a');
    expect(catalog.hosts).toEqual([]);
    expect(secrets.values.has(passwordAccount('a'))).toBe(false);
  });

  it('keeps an RSA key in secure storage, away from the Host record, and removes it with the Host', async () => {
    const { storage, secrets, catalog } = setup();
    const subject = host('a', { authMethod: 'rsaKey' });
    await catalog.add(subject);
    await catalog.setRsaKey(subject, 'PEM-TEXT');
    expect(await catalog.rsaKey(subject)).toBe('PEM-TEXT');
    expect(storage.getString(HOSTS_STORAGE_KEY)).not.toContain('PEM-TEXT');
    await catalog.remove('a');
    expect(secrets.values.has(rsaKeyAccount('a'))).toBe(false);
  });

  it('keeps passwords out of the Host record and round-trips them through secure storage', async () => {
    const { storage, catalog } = setup();
    const subject = host('a', { authMethod: 'password' });
    await catalog.add(subject, 'hunter2');
    expect(await catalog.password(subject)).toBe('hunter2');
    expect(storage.getString(HOSTS_STORAGE_KEY)).not.toContain('hunter2');
  });

  it('stores its own copy of the password for a duplicated Host', async () => {
    const { catalog } = setup();
    const original = host('a', { authMethod: 'password' });
    await catalog.add(original, 'hunter2');
    const draft = duplicateHostDraft(original, {
      password: await catalog.password(original),
      existingNames: ['a'],
      newId: () => 'b-route',
    });
    const copy = hostFromDraft(draft, 'b');
    expect(copy).not.toBeNull();
    await catalog.add(copy as Host, draft.password);
    await catalog.remove('a');
    expect(await catalog.password(copy as Host)).toBe('hunter2');
  });

  it('keeps the stored password when an edit leaves the field empty', async () => {
    const { catalog } = setup();
    const subject = host('a', { authMethod: 'password' });
    await catalog.add(subject, 'hunter2');
    await catalog.update({ ...subject, name: 'Renamed' }, null);
    expect(await catalog.password(subject)).toBe('hunter2');
  });

  it.each(['deviceKey', 'rsaKey'] as const)(
    'deletes the stored password when switching to %s',
    async (authMethod) => {
      const { catalog } = setup();
      const subject = host('a', { authMethod: 'password' });
      await catalog.add(subject, 'hunter2');
      await catalog.update({ ...subject, authMethod }, null);
      expect(await catalog.password(subject)).toBeNull();
    },
  );

  it('reorders Hosts, clamps the target and keeps hidden entries in place', async () => {
    const hidden = { ...host('future'), authMethod: 'passkey' };
    const { storage, catalog } = setup({
      version: 1,
      hosts: [host('a'), hidden, host('b'), host('c')],
    });
    catalog.move('c', 0);
    expect(catalog.hosts.map((h) => h.id)).toEqual(['c', 'a', 'b']);
    catalog.move('c', 99);
    expect(catalog.hosts.map((h) => h.id)).toEqual(['a', 'b', 'c']);
    expect(persisted(storage).hosts.map((h) => h.id)).toEqual(['a', 'future', 'b', 'c']);
    expect(() => catalog.move('missing', 0)).toThrow(HostCatalogError);
  });
});
