import { fadeOffsets } from './EdgeFade';

describe('EdgeFade', () => {
  it('stays solid for the chrome height, then fades over the rest', () => {
    expect(fadeOffsets('top', 100, 75)).toEqual({ edge: 0, plateau: 0.75, clear: 1 });
  });

  it('mirrors for the bottom edge', () => {
    expect(fadeOffsets('bottom', 100, 75)).toEqual({ edge: 1, plateau: 0.25, clear: 0 });
  });

  it('is the plain fade with no plateau, and never leaves 0..1', () => {
    expect(fadeOffsets('top', 100, 0).plateau).toBe(0);
    expect(fadeOffsets('top', 100, 500).plateau).toBe(1);
    expect(fadeOffsets('top', 0, 10).plateau).toBe(0);
  });
});
