import { placePopover } from './menuPlacement';

const base = {
  width: 250,
  estimated: 200,
  window: { width: 400, height: 800 },
  insets: { top: 60, bottom: 30 },
  margin: 8,
  gap: 4,
  fallbackBottom: 16,
};

describe('placePopover', () => {
  it('opens under an anchor at the top edge, lined up with its leading edge', () => {
    const p = placePopover({ ...base, anchor: { x: 16, y: 64, width: 120, height: 41 } });
    expect(p).toMatchObject({ left: 16, top: 109 });
    expect(p.bottom).toBeUndefined();
  });

  it('opens above an anchor at the bottom edge', () => {
    const p = placePopover({ ...base, anchor: { x: 300, y: 700, width: 56, height: 56 } });
    expect(p.top).toBeUndefined();
    expect(p.bottom).toBe(800 - 700 + 4);
  });

  it('opens under an anchor in the middle', () => {
    const p = placePopover({ ...base, anchor: { x: 20, y: 400, width: 100, height: 40 } });
    expect(p.top).toBe(444);
  });

  it('keeps a wide panel inside the right margin, on the anchor trailing edge', () => {
    const p = placePopover({ ...base, anchor: { x: 330, y: 64, width: 60, height: 41 } });
    expect(p.left).toBe(140);
    expect(p.left + 250).toBeLessThanOrEqual(400 - 8);
  });

  it('never covers the anchor when it fits neither side: scrolls on the roomier side', () => {
    const p = placePopover({
      ...base,
      estimated: 900,
      anchor: { x: 16, y: 300, width: 100, height: 40 },
    });
    expect(p.top).toBe(344);
    expect(p.maxHeight).toBe(800 - 30 - 8 - 344);
  });

  it('centers near the bottom when the anchor is unmeasured', () => {
    const p = placePopover({ ...base, anchor: undefined });
    expect(p.left).toBe(75);
    expect(p.bottom).toBe(46);
    const zero = placePopover({ ...base, anchor: { x: 0, y: 0, width: 0, height: 0 } });
    expect(zero.bottom).toBe(46);
  });
});
