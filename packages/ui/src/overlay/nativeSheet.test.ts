import { nativeDetents } from './NativeSheet';

describe('nativeDetents', () => {
  it('maps the sheet detents to the native ones', () => {
    expect(nativeDetents('fit', 0.92)).toEqual(['auto']);
    expect(nativeDetents('medium', 0.92)).toEqual([0.5]);
    expect(nativeDetents('large', 0.92)).toEqual([0.92]);
    expect(nativeDetents({ fraction: 0.65 }, 0.92)).toEqual([0.65]);
    expect(nativeDetents({ fraction: 2 }, 0.92)).toEqual([0.92]);
  });
});
