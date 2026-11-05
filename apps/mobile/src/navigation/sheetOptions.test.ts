import { metrics } from '@openagentspocket/ui';
import { Platform } from 'react-native';
import { sheetOptions } from './sheetOptions';

const theme = { metrics };
const setOS = (os: 'ios' | 'android' | 'web') => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
};

describe('sheetOptions', () => {
  afterEach(() => setOS('ios'));

  it('is the native form sheet on iOS with the radius token and the given detents', () => {
    setOS('ios');
    expect(sheetOptions(theme, { size: 'full' })).toMatchObject({
      presentation: 'formSheet',
      sheetAllowedDetents: [1],
      sheetCornerRadius: metrics.sheetRadius,
      sheetGrabberVisible: true,
    });
    expect(sheetOptions(theme).sheetAllowedDetents).toEqual([1]);
    expect(sheetOptions(theme, { size: 'fit' }).sheetAllowedDetents).toBe('fitToContents');
  });

  it('keeps the full-screen modal where there is no native form sheet', () => {
    for (const os of ['android', 'web'] as const) {
      setOS(os);
      expect(sheetOptions(theme)).toEqual({ presentation: 'modal' });
    }
  });
});
