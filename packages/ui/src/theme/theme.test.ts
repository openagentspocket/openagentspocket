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

  it('scales spacing by 1.3 over a 4-pt base', () => {
    expect(Object.values(spacing)).toEqual([5, 10, 16, 21, 31, 42]);
  });
});
