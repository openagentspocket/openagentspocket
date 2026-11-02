import {
  FakeClock,
  type Host,
  hostRoute,
  KnownHostsStore,
  TransportFailure,
} from '@openagentspocket/core';
import { type SettingsContext, transportSettingsFor } from './transportSettings';

jest.mock('expo-secure-store', () => ({}));

const host = (authMethod: Host['authMethod']): Host => ({
  id: 'h1',
  name: 'h1',
  username: 'dev',
  authMethod,
  sessionName: '',
  herdrEndpoint: null,
  routes: [hostRoute({ id: 'r1', address: 'h1.example' })],
});

const context = (secrets: { password: string | null; rsaKey: string | null }): SettingsContext => ({
  keyAlias: 'device',
  clock: new FakeClock(),
  policy: { knownHosts: new KnownHostsStore(), confirmFirstConnect: async () => true },
  secrets: { password: async () => secrets.password, rsaKey: async () => secrets.rsaKey },
});

describe('transportSettingsFor credentials', () => {
  it('uses the device key alias for a device key Host', () => {
    const settings = transportSettingsFor(
      host('deviceKey'),
      context({ password: null, rsaKey: null }),
    );
    expect(settings.keyAlias).toBe('device');
    expect(settings.credential).toBeUndefined();
  });

  it('reads the saved password lazily and the saved RSA key likewise', async () => {
    const ctx = context({ password: 'pw', rsaKey: 'PEM' });
    const password = transportSettingsFor(host('password'), ctx).credential;
    const rsa = transportSettingsFor(host('rsaKey'), ctx).credential;
    expect(typeof password === 'function' && (await password())).toEqual({
      kind: 'password',
      password: 'pw',
    });
    expect(typeof rsa === 'function' && (await rsa())).toEqual({
      kind: 'rsaKey',
      privateKey: 'PEM',
    });
  });

  it('fails as a transport error when the saved secret is gone', async () => {
    const ctx = context({ password: null, rsaKey: null });
    const password = transportSettingsFor(host('password'), ctx).credential;
    const rsa = transportSettingsFor(host('rsaKey'), ctx).credential;
    await expect(typeof password === 'function' && password()).rejects.toBeInstanceOf(
      TransportFailure,
    );
    await expect(typeof rsa === 'function' && rsa()).rejects.toBeInstanceOf(TransportFailure);
  });
});
