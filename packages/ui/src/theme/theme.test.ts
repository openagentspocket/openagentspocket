import { withAlpha } from './color';
import { spacing } from './metrics';
import { buildTheme } from './theme';
import { colorKeys, themeIds, themes } from './tokens.generated';

describe('tokens', () => {
  it('gives every theme the same color keys, all #RRGGBB', () => {
    for (const id of themeIds) {
      expect(Object.keys(themes[id].colors)).toEqual([...colorKeys]);
      for (const value of Object.values(themes[id].colors)) expect(value).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('ships a light theme and two dark ones', () => {
    expect(themeIds.map((id) => themes[id].appearance)).toEqual(['dark', 'light', 'dark']);
  });
});

describe('theme', () => {
  it('derives the hairline from the primary text color at 16%', () => {
    const theme = buildTheme('indigo');
    expect(theme.hairline).toBe(withAlpha(themes.indigo.colors.textPrimary, 0.16));
  });

  it('resolves status and tone colors from the theme tokens', () => {
    for (const id of themeIds) {
      const theme = buildTheme(id);
      expect(theme.status('blocked')).toBe(themes[id].colors.statusBlocked);
      expect(theme.status('idle')).toBe(themes[id].colors.statusIdle);
      expect(theme.tone('danger')).toBe(themes[id].colors.danger);
      expect(theme.tone('neutral')).toBe(themes[id].colors.textSecondary);
    }
  });

  it('washes a color at 15% and keeps radius 8 cards', () => {
    const theme = buildTheme('noche');
    expect(theme.wash(themes.noche.colors.accent)).toBe(
      withAlpha(themes.noche.colors.accent, 0.15),
    );
    expect(theme.metrics.cardRadius).toBe(8);
  });

  it('scales spacing by 1.3 over a 4-pt base', () => {
    expect(Object.values(spacing)).toEqual([5, 10, 16, 21, 31, 42]);
  });
});
