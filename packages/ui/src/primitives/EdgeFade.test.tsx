import { fadeStops } from './EdgeFade';

describe('fadeStops', () => {
  it('draws the plain fade with no plateau: 0.96 at the edge, clear at the far end', () => {
    expect(fadeStops('top', 100, 0)).toEqual([
      { offset: 0, opacity: 0.96 },
      { offset: 1, opacity: 0 },
    ]);
  });

  it('is fully opaque for the chrome height, then fades over the rest', () => {
    expect(fadeStops('top', 100, 75)).toEqual([
      { offset: 0, opacity: 1 },
      { offset: 0.75, opacity: 1 },
      { offset: 1, opacity: 0 },
    ]);
  });

  it('mirrors for the bottom edge, still ascending', () => {
    expect(fadeStops('bottom', 100, 75)).toEqual([
      { offset: 0, opacity: 0 },
      { offset: 0.25, opacity: 1 },
      { offset: 1, opacity: 1 },
    ]);
  });

  it('never repeats an offset with the same opacity, and clamps the plateau', () => {
    for (const solid of [0, 50, 100, 500]) {
      for (const edge of ['top', 'bottom'] as const) {
        const stops = fadeStops(edge, 100, solid);
        const keys = stops.map((s) => `${s.offset}:${s.opacity}`);
        expect(new Set(keys).size).toBe(keys.length);
        expect(stops.map((s) => s.offset)).toEqual(
          [...stops.map((s) => s.offset)].sort((a, b) => a - b),
        );
      }
    }
    expect(fadeStops('top', 0, 10)).toHaveLength(2);
  });
});
