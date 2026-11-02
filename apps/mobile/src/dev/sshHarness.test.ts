import { harnessParams, normalizePin } from './sshHarness';

const base = { host: 'h', user: 'u', sock: '/s', fsock: '/f', port: '22', fport: '47451' };

describe('harness pin', () => {
  const standard = 'SHA256:ab+cd/ef+gh';
  it('restores a + that a URL turned into a space', () => {
    expect(normalizePin('SHA256:ab cd/ef gh')).toBe(standard);
  });
  it('accepts base64url', () => {
    expect(normalizePin('SHA256:ab-cd_ef-gh')).toBe(standard);
  });
  it('keeps a standard fingerprint and drops an empty one', () => {
    expect(normalizePin(standard)).toBe(standard);
    expect(normalizePin('')).toBeUndefined();
    expect(normalizePin(undefined)).toBeUndefined();
  });
  it('flows through harnessParams', () => {
    expect(harnessParams({ ...base, pin: 'SHA256:ab cd' })?.pin).toBe('SHA256:ab+cd');
  });
});
