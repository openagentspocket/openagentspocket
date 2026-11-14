import { CHROME_KEYBOARD_GAP, CHROME_MIN_BOTTOM, CHROME_TOP_GAP, chromeInsets } from './chrome';
import { metrics } from './metrics';

describe('chromeInsets', () => {
  it('puts a Face ID iPhone bottom bar 20 pt from the bottom, into the indicator strip', () => {
    const { top, bottom } = chromeInsets({ top: 62, bottom: 34 }, 'ios');
    expect(top).toBe(62 + CHROME_TOP_GAP);
    expect(bottom).toBe(34 - metrics.homeIndicatorOverlap);
    expect(bottom).toBe(20);
  });

  it('keeps a bar above the home indicator (8 pt up, 5 pt tall)', () => {
    expect(chromeInsets({ top: 62, bottom: 34 }, 'ios').bottom).toBeGreaterThan(8 + 5);
  });

  it('keeps a small margin on a phone with no home indicator', () => {
    expect(chromeInsets({ top: 20, bottom: 0 }, 'ios')).toEqual({
      top: 20 + CHROME_TOP_GAP,
      bottom: CHROME_MIN_BOTTOM,
    });
  });

  it('never goes under the margin on a short indicator strip (iPad)', () => {
    expect(chromeInsets({ top: 24, bottom: 20 }, 'ios').bottom).toBe(CHROME_MIN_BOTTOM);
  });

  it('stays above Android navigation, and starts under its status bar', () => {
    expect(chromeInsets({ top: 24, bottom: 48 }, 'android')).toEqual({
      top: 24 + CHROME_TOP_GAP,
      bottom: 48,
    });
    expect(chromeInsets({ top: 24, bottom: 0 }, 'android').bottom).toBe(CHROME_MIN_BOTTOM);
  });

  it('keeps only the small gap over the keyboard', () => {
    expect(chromeInsets({ top: 62, bottom: 34 }, 'ios', true).bottom).toBe(CHROME_KEYBOARD_GAP);
    expect(chromeInsets({ top: 24, bottom: 48 }, 'android', true).bottom).toBe(CHROME_KEYBOARD_GAP);
  });
});
