import { DRAG_THRESHOLD, settleDetent } from './sheetDetents';

describe('settleDetent', () => {
  it('grows medium to large on a long upward drag', () => {
    expect(settleDetent('medium', -DRAG_THRESHOLD, 0)).toBe('large');
  });
  it('shrinks large to medium on a long downward drag', () => {
    expect(settleDetent('large', DRAG_THRESHOLD, 0)).toBe('medium');
  });
  it('closes from medium or fit on a downward drag', () => {
    expect(settleDetent('medium', DRAG_THRESHOLD, 0)).toBe('close');
    expect(settleDetent('fit', DRAG_THRESHOLD, 0)).toBe('close');
  });
  it('stays put on a short, slow drag', () => {
    expect(settleDetent('large', 10, 0.1)).toBe('large');
    expect(settleDetent('medium', -10, 0.1)).toBe('medium');
  });
  it('a fast flick counts', () => {
    expect(settleDetent('medium', -10, -1)).toBe('large');
  });
});
