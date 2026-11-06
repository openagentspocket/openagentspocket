import { layoutModeFor } from './layoutMode';

describe('layoutModeFor', () => {
  it('names the three layouts by window width', () => {
    expect(layoutModeFor(390)).toBe('compact');
    expect(layoutModeFor(600)).toBe('regular');
    expect(layoutModeFor(859)).toBe('regular');
    expect(layoutModeFor(860)).toBe('wide');
    expect(layoutModeFor(1160)).toBe('expansive');
  });
});
