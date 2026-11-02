import { PROGRAM_BRANDS } from '@openagentspocket/core';
import { brandColors } from './brands.generated';
import {
  contrast,
  isAchromatic,
  MARK_CONTRAST_FLOOR,
  markSurfaces,
  mixed,
  programTint,
  raisedToContrast,
} from './programTint';
import { themeIds, themes } from './tokens.generated';

describe('programTint', () => {
  it('has a color for every brand the core knows, as #RRGGBB', () => {
    expect(Object.keys(brandColors).sort()).toEqual([...PROGRAM_BRANDS].sort());
    for (const color of Object.values(brandColors)) expect(color).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('clears the contrast floor on every surface of every theme, for every brand and none', () => {
    for (const id of themeIds) {
      const theme = themes[id];
      for (const brand of [...PROGRAM_BRANDS, undefined]) {
        const tint = programTint(brand, theme);
        for (const surface of markSurfaces(theme)) {
          expect(contrast(tint, surface)).toBeGreaterThanOrEqual(MARK_CONTRAST_FLOOR);
        }
      }
    }
  });

  it('draws black brand marks in the primary text color and no brand in the secondary', () => {
    for (const id of themeIds) {
      const theme = themes[id];
      for (const brand of PROGRAM_BRANDS) {
        if (isAchromatic(brandColors[brand])) {
          expect(programTint(brand, theme)).toBe(theme.colors.textPrimary);
        }
      }
      expect(programTint(undefined, theme)).toBe(theme.colors.textSecondary);
    }
  });

  it('keeps a passing brand color and darkens a failing one on a light theme', () => {
    const light = themes.papel;
    expect(programTint('claude', themes.indigo)).toBe(brandColors.claude);
    const deepened = programTint('claude', light);
    expect(deepened).not.toBe(brandColors.claude);
    expect(contrast(deepened, light.colors.surface)).toBeGreaterThanOrEqual(3);
    // Darkening moves toward black, so it stands out more from white than the brand color did.
    expect(contrast(deepened, '#FFFFFF')).toBeGreaterThan(contrast(brandColors.claude, '#FFFFFF'));
  });

  it('mixes and raises one 5% step at a time, stopping at the first that passes', () => {
    expect(mixed('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mixed('#000000', '#FFFFFF', 1)).toBe('#FFFFFF');
    expect(mixed('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    const surface = '#121416';
    const raised = raisedToContrast('#333333', 3, [surface], '#FFFFFF');
    expect(contrast(raised, surface)).toBeGreaterThanOrEqual(3);
    expect(raised).not.toBe('#FFFFFF');
    expect(raisedToContrast(brandColors.claude, 3, [surface], '#FFFFFF')).toBe(brandColors.claude);
    expect(isAchromatic('#18181B')).toBe(true);
    expect(isAchromatic(brandColors.claude)).toBe(false);
  });
});
