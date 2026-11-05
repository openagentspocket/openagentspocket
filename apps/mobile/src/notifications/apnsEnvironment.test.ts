import { isApnsSandbox } from './apnsEnvironment';

const signedWith = (environment: unknown) => ({
  ios: { entitlements: { 'aps-environment': environment } },
});

describe('isApnsSandbox', () => {
  it('follows the entitlement the app is signed with, whatever the bundle mode', () => {
    expect(isApnsSandbox(signedWith('development'), false)).toBe(true);
    expect(isApnsSandbox(signedWith('production'), true)).toBe(false);
  });

  it('falls back to the dev flag when the config has no entitlement', () => {
    expect(isApnsSandbox(undefined, true)).toBe(true);
    expect(isApnsSandbox(null, false)).toBe(false);
    expect(isApnsSandbox({ ios: {} }, true)).toBe(true);
    expect(isApnsSandbox(signedWith('something-else'), false)).toBe(false);
  });
});
