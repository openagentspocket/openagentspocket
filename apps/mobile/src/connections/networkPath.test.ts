import { NetworkPathWatch } from './networkPath';

const wifi = { type: 'WIFI', isConnected: true };
const cellular = { type: 'CELLULAR', isConnected: true };
const none = { type: 'NONE', isConnected: false };

describe('what counts as a new network', () => {
  it('takes the first reading as the baseline', () => {
    expect(new NetworkPathWatch().didMove(wifi)).toBe(false);
  });

  it('sees Wi-Fi to cellular and back', () => {
    const watch = new NetworkPathWatch();
    watch.didMove(wifi);
    expect(watch.didMove(cellular)).toBe(true);
    expect(watch.didMove(wifi)).toBe(true);
  });

  it('ignores a repeat of the same path', () => {
    const watch = new NetworkPathWatch();
    watch.didMove(wifi);
    expect(watch.didMove(wifi)).toBe(false);
  });

  it('waits out no network, and moves when one comes back, even the same kind', () => {
    const watch = new NetworkPathWatch();
    watch.didMove(wifi);
    expect(watch.didMove(none)).toBe(false);
    expect(watch.didMove(wifi)).toBe(true);
  });
});
