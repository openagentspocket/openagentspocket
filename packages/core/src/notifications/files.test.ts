import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../hosts/known-hosts';
import { utf8Decode, utf8Encode } from '../pairing/bytes';
import { NotificationConfigFile } from './config-file';
import { NotificationRegistrationError } from './errors';
import { MemoryNotificationKeyStore } from './key-store';
import { checkRelayInput } from './relay-endpoint';
import { NotificationRelaySettings } from './relay-settings';
import {
  type HostCommandRunner,
  type RegistrationSftp,
  resolvePluginConfigDir,
  sftpNotificationTransport,
} from './transport';

const bytes = utf8Encode;

describe('NotificationConfigFile', () => {
  it.each([null, bytes('not json'), bytes('[1]'), bytes('"x"')])(
    'decodes absent or corrupt content as empty',
    (data) => {
      expect(NotificationConfigFile.decode(data).relayURL).toBeNull();
      expect(NotificationConfigFile.decode(data).equals(new NotificationConfigFile())).toBe(true);
    },
  );

  it('reads relay_url with the trailing slash trimmed', () => {
    const file = NotificationConfigFile.decode(bytes('{"relay_url":"https://r.example//"}'));
    expect(file.relayURL).toBe('https://r.example');
  });

  it('sets relay_url without touching other fields', () => {
    const file = NotificationConfigFile.decode(bytes('{"debounce_ms":5,"retry_delay_ms":9}'));
    const updated = file.settingRelayURL('https://r.example/');
    expect(JSON.parse(utf8Decode(updated.encoded()))).toEqual({
      debounce_ms: 5,
      retry_delay_ms: 9,
      relay_url: 'https://r.example',
    });
  });

  it('equals the decoded file when the same normalized URL is set again', () => {
    const file = new NotificationConfigFile().settingRelayURL('https://r.example/');
    const decoded = NotificationConfigFile.decode(file.encoded());
    expect(decoded.settingRelayURL('https://r.example').equals(decoded)).toBe(true);
  });
});

describe('checkRelayInput', () => {
  it('treats blank as no override', () => {
    expect(checkRelayInput('   ')).toEqual({ kind: 'empty' });
  });

  it('accepts https, and flags http as insecure', () => {
    expect(checkRelayInput('https://r.example/')).toEqual({
      kind: 'valid',
      url: 'https://r.example',
      isInsecureHTTP: false,
    });
    expect(checkRelayInput('http://127.0.0.1:8787')).toMatchObject({ isInsecureHTTP: true });
  });

  it('accepts a path prefix and trims whitespace', () => {
    expect(checkRelayInput('  https://r.example/relay  ')).toMatchObject({
      kind: 'valid',
      url: 'https://r.example/relay',
    });
  });

  it.each(['ftp://r.example', 'r.example', 'https://', 'https://a b', 'https://u@r.example'])(
    'rejects %j',
    (text) => {
      expect(checkRelayInput(text)).toEqual({ kind: 'invalid' });
    },
  );
});

describe('NotificationKeyStore', () => {
  it('round-trips and replaces by Host', () => {
    const store = new MemoryNotificationKeyStore();
    store.save({ hostId: 'a', hostName: 'A', key: new Uint8Array(32).fill(1) });
    store.save({ hostId: 'a', hostName: 'A2', key: new Uint8Array(32).fill(2) });
    expect(store.allRecords()).toHaveLength(1);
    expect(store.record('a')?.hostName).toBe('A2');
    store.removeRecord('a');
    expect(store.record('a')).toBeNull();
  });

  it('rejects a key that is not 32 bytes and a blank Host name', () => {
    const store = new MemoryNotificationKeyStore();
    expect(() => store.save({ hostId: 'a', hostName: 'A', key: new Uint8Array(16) })).toThrow();
    expect(() => store.save({ hostId: 'a', hostName: ' ', key: new Uint8Array(32) })).toThrow();
  });
});

describe('sftpNotificationTransport', () => {
  const files = new Map<string, Uint8Array>();
  const writes: { path: string; replace: boolean; permissions: number }[] = [];
  const sftp: RegistrationSftp = {
    read: async (path) => files.get(path) ?? null,
    write: async (path, data, options) => {
      files.set(path, data);
      writes.push({ path, ...options });
    },
  };

  it('replaces atomically with owner-only permissions in the config dir', async () => {
    const transport = sftpNotificationTransport(sftp, '/cfg/agentico/');
    expect(await transport.readRegistration()).toBeNull();
    await transport.replaceRegistration(bytes('{}'));
    await transport.replaceConfig(bytes('{}'));
    expect(writes).toEqual([
      { path: '/cfg/agentico/notifications.json', replace: true, permissions: 0o600 },
      { path: '/cfg/agentico/notify.json', replace: true, permissions: 0o600 },
    ]);
    expect(await transport.readRegistration()).toEqual(bytes('{}'));
  });

  it('surfaces a failed write as writeFailed', async () => {
    const failing = sftpNotificationTransport(
      { ...sftp, write: async () => Promise.reject(new Error('disk full')) },
      '/cfg',
    );
    await expect(failing.replaceRegistration(bytes('{}'))).rejects.toMatchObject({
      failure: { kind: 'writeFailed' },
    });
  });

  it('surfaces a failed read as readFailed', async () => {
    const failing = sftpNotificationTransport(
      { ...sftp, read: async () => Promise.reject(new Error('denied')) },
      '/cfg',
    );
    await expect(failing.readRegistration()).rejects.toMatchObject({
      failure: { kind: 'readFailed' },
    });
  });
});

describe('resolvePluginConfigDir', () => {
  const list = (plugins: unknown) => JSON.stringify({ plugins });
  const runner =
    (listOutput: string, dirOutput = '/cfg/agentico\n', status = 0): HostCommandRunner =>
    async (command) =>
      command === 'list'
        ? { exitStatus: status, stdout: listOutput }
        : { exitStatus: 0, stdout: dirOutput };
  const resolve = (run: HostCommandRunner) =>
    resolvePluginConfigDir(run, 'list', (id) => `dir ${id}`);

  it('returns the config dir of the enabled Agentico plugin, ignoring shell noise', async () => {
    const run = runner(
      list([{ plugin_id: 'agentico', enabled: true }]),
      'welcome\n/cfg/agentico\n',
    );
    expect(await resolve(run)).toBe('/cfg/agentico');
  });

  it('asks for the legacy id the Host still runs', async () => {
    const commands: string[] = [];
    const base = runner(list([{ plugin_id: 'herdr-mobile.pairing' }]));
    await resolvePluginConfigDir(
      async (command) => {
        commands.push(command);
        return base(command);
      },
      'list',
      (id) => `dir ${id}`,
    );
    expect(commands).toEqual(['list', 'dir herdr-mobile.pairing']);
  });

  it('reports a missing or disabled plugin before touching any directory', async () => {
    for (const plugins of [[], [{ plugin_id: 'agentico', enabled: false }]]) {
      await expect(resolve(runner(list(plugins)))).rejects.toMatchObject({
        failure: { kind: 'pluginNotInstalled' },
      });
    }
  });

  it('reports a broken probe', async () => {
    for (const run of [runner('nope'), runner('{}'), runner(list([]), '', 1)]) {
      await expect(resolve(run)).rejects.toBeInstanceOf(NotificationRegistrationError);
    }
    await expect(resolve(runner(list([]), '', 2))).rejects.toMatchObject({
      failure: { kind: 'pluginProbeFailed' },
    });
  });
});

describe('NotificationRelaySettings', () => {
  it('is empty by default, meaning the default relay', () => {
    const settings = new NotificationRelaySettings(new MemoryStorage());
    expect(settings.rawValue).toBe('');
    expect(settings.customBaseURL).toBeNull();
    expect(settings.hasInvalidEntry).toBe(false);
  });

  it('persists the raw value and flags invalid and insecure entries', () => {
    const storage = new MemoryStorage();
    const settings = new NotificationRelaySettings(storage);
    let notified = 0;
    settings.subscribe(() => {
      notified += 1;
    });
    settings.rawValue = 'nonsense';
    expect(settings.hasInvalidEntry).toBe(true);
    expect(settings.customBaseURL).toBeNull();
    settings.rawValue = 'http://relay.example';
    expect(settings.hasInsecureHTTPEntry).toBe(true);
    expect(new NotificationRelaySettings(storage).customBaseURL).toBe('http://relay.example');
    expect(notified).toBe(2);
  });
});
