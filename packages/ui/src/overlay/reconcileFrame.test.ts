import { reconcileFrame } from './anchors';

describe('reconcileFrame', () => {
  const pill = { x: 21, y: 64, width: 136, height: 41 };

  it('keeps a measured frame that holds the press', () => {
    expect(reconcileFrame(pill, { pageX: 80, pageY: 84 })).toEqual(pill);
  });

  it('keeps the measured frame when there is no press (a screen reader)', () => {
    expect(reconcileFrame(pill)).toEqual(pill);
  });

  it('replaces a parent-relative frame by one centered on the press', () => {
    const wrong = { x: 21, y: 2, width: 136, height: 41 };
    expect(reconcileFrame(wrong, { pageX: 80, pageY: 84 })).toEqual({
      x: 80 - 68,
      y: 84 - 20.5,
      width: 136,
      height: 41,
    });
  });

  it('treats an empty or missing frame as no anchor', () => {
    expect(reconcileFrame({ x: 0, y: 0, width: 0, height: 0 }, { pageX: 5, pageY: 5 })).toBeNull();
    expect(reconcileFrame(null)).toBeNull();
  });
});
