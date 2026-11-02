import { createDevicePushTokenSource, type NotificationsApi } from './devicePushToken';

function fakeApi(initial: string, afterRequest: string) {
  let status = initial;
  const calls: string[] = [];
  const api: NotificationsApi = {
    getPermissionsAsync: async () => ({ status }),
    requestPermissionsAsync: async () => {
      calls.push('request');
      status = afterRequest;
      return { status };
    },
    getDevicePushTokenAsync: async () => ({ data: 'abc123' }),
    setNotificationChannelAsync: async () => {
      calls.push('channel');
    },
  };
  return { api, calls };
}

describe('device push token source', () => {
  it('reads the state without prompting', async () => {
    const { api, calls } = fakeApi('undetermined', 'granted');
    const source = createDevicePushTokenSource(api, { platform: 'ios', sandbox: true });
    expect((await source.state()).kind).toBe('needsPermission');
    expect(calls).toEqual([]);
  });

  it('asks the OS when enabling, then registers the token', async () => {
    const { api, calls } = fakeApi('undetermined', 'granted');
    const source = createDevicePushTokenSource(api, { platform: 'ios', sandbox: true });
    const state = await source.enable();
    expect(calls).toEqual(['request']);
    expect(state).toMatchObject({ kind: 'registered', token: { platform: 'ios', env: 'sandbox' } });
  });

  it('creates the Android channel and registers an FCM token', async () => {
    const { api, calls } = fakeApi('undetermined', 'granted');
    const source = createDevicePushTokenSource(api, { platform: 'android', sandbox: false });
    const state = await source.enable();
    expect(calls).toEqual(['request', 'channel']);
    expect(state).toMatchObject({ kind: 'registered', token: { platform: 'android', env: 'fcm' } });
  });

  it('reports a refusal as denied and never fetches a token', async () => {
    const { api } = fakeApi('undetermined', 'denied');
    const source = createDevicePushTokenSource(api, { platform: 'ios', sandbox: false });
    expect((await source.enable()).kind).toBe('denied');
    expect((await source.state()).kind).toBe('denied');
  });

  it('does not ask again once permission is granted', async () => {
    const { api, calls } = fakeApi('granted', 'granted');
    const source = createDevicePushTokenSource(api, { platform: 'ios', sandbox: false });
    expect((await source.enable()).kind).toBe('registered');
    expect(calls).toEqual([]);
  });
});
