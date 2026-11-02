import { describe, expect, it } from 'vitest';
import { NotificationRegistrationCeremony } from './ceremony';
import { NotificationRegistrationError } from './errors';
import { FakeNotificationTransport, makeHost } from './fake-notification-transport';
import { MemoryNotificationKeyStore } from './key-store';
import { apnsToken } from './push-token';
import { NotificationRegistrationFile } from './registration-file';

const token = apnsToken('a1b2c3', 'production');
let counter = 0;
const randomBytes = (length: number) => new Uint8Array(length).fill(++counter);

async function registered(hostId = 'h1') {
  const keys = new MemoryNotificationKeyStore();
  const ceremony = new NotificationRegistrationCeremony(keys, randomBytes);
  const transport = new FakeNotificationTransport();
  const host = makeHost(hostId);
  await ceremony.register({ host, deviceToken: token, transport });
  const read = () => {
    const owner = ceremony.registrationOwner(host, token);
    return owner
      ? NotificationRegistrationFile.decode(transport.registration).liveActivity(owner)
      : null;
  };
  return { ceremony, transport, host, read };
}

const at = '2026-11-02T12:00:00Z';

describe('live_activity registration field', () => {
  it('writes token, start time and pins on the own entry, keeping the alert fields', async () => {
    const { ceremony, transport, host, read } = await registered();
    await ceremony.setLiveActivityToken({
      host,
      deviceToken: token,
      tokenHex: 'dead',
      startedAt: at,
      pinnedPaneIds: ['p1'],
      hostName: 'mbp',
      transport,
    });
    expect(read()).toEqual({ token: 'dead', startedAt: at, pinnedPaneIds: ['p1'] });
    const owner = ceremony.registrationOwner(host, token);
    const file = NotificationRegistrationFile.decode(transport.registration);
    expect(owner && file.preferences(owner)?.blocked).toBe(true);
  });

  it('refuses an unregistered Host instead of inventing an entry', async () => {
    const keys = new MemoryNotificationKeyStore();
    const ceremony = new NotificationRegistrationCeremony(keys, randomBytes);
    const transport = new FakeNotificationTransport();
    const attempt = ceremony.setLiveActivityToken({
      host: makeHost('h1'),
      deviceToken: token,
      tokenHex: 'dead',
      startedAt: at,
      pinnedPaneIds: [],
      transport,
    });
    await expect(attempt).rejects.toBeInstanceOf(NotificationRegistrationError);
  });

  it('updates pins only when a live_activity exists', async () => {
    const { ceremony, transport, host, read } = await registered();
    await ceremony.setLiveActivityPinnedPaneIds(host, token, ['p9'], transport);
    expect(read()).toBeNull();
    await ceremony.setLiveActivityToken({
      host,
      deviceToken: token,
      tokenHex: 'aa',
      startedAt: at,
      pinnedPaneIds: [],
      transport,
    });
    await ceremony.setLiveActivityPinnedPaneIds(host, token, ['p9', 'p2'], transport);
    expect(read()?.pinnedPaneIds).toEqual(['p9', 'p2']);
  });

  it('clears only a matching token, or any token when none is given', async () => {
    const { ceremony, transport, host, read } = await registered();
    await ceremony.setLiveActivityToken({
      host,
      deviceToken: token,
      tokenHex: 'aa',
      startedAt: at,
      pinnedPaneIds: [],
      transport,
    });
    await ceremony.clearLiveActivityToken(host, token, 'other', transport);
    expect(read()?.token).toBe('aa');
    await ceremony.clearLiveActivityToken(host, token, null, transport);
    expect(read()).toBeNull();
  });

  it('moves a token off another entry so one activity has one owner', async () => {
    const { ceremony, transport, host } = await registered('h1');
    const other = makeHost('h2', { sessionName: 'work' });
    await ceremony.register({ host: other, deviceToken: token, transport, notify: undefined });
    await ceremony.setLiveActivityToken({
      host,
      deviceToken: token,
      tokenHex: 'aa',
      startedAt: at,
      pinnedPaneIds: [],
      transport,
    });
    await ceremony.setLiveActivityToken({
      host: other,
      deviceToken: token,
      tokenHex: 'aa',
      startedAt: at,
      pinnedPaneIds: [],
      transport,
    });
    const file = NotificationRegistrationFile.decode(transport.registration);
    const ownerOne = ceremony.registrationOwner(host, token);
    const ownerTwo = ceremony.registrationOwner(other, token);
    expect(ownerOne && file.liveActivity(ownerOne)).toBeNull();
    expect(ownerTwo && file.liveActivity(ownerTwo)?.token).toBe('aa');
  });
});
