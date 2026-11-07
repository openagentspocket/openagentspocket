import { withAlpha } from './color';
import { spacing } from './metrics';
import { contrast } from './programTint';
import { buildTheme } from './theme';
import { colorKeys, themeIds, themes } from './tokens.generated';

describe('tokens', () => {
  it('gives every theme the same color keys, all #RRGGBB', () => {
    for (const id of themeIds) {
      expect(Object.keys(themes[id].colors)).toEqual([...colorKeys]);
      for (const value of Object.values(themes[id].colors)) expect(value).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('ships a light theme and three dark ones', () => {
    expect(themeIds.map((id) => themes[id].appearance)).toEqual(['dark', 'dark', 'light', 'dark']);
  });

  it('keeps a primary button readable in every theme', () => {
    for (const id of themeIds) {
      const { accent, onAccent } = themes[id].colors;
      expect(contrast(accent, onAccent)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps Negro black, with color only where it means something', () => {
    const { colors } = themes.negro;
    const grey = (hex: string) =>
      hex.slice(1, 3) === hex.slice(3, 5) && hex.slice(3, 5) === hex.slice(5, 7);
    const { statusBlocked, statusWorking, statusDone, success, warning, danger, ...neutral } =
      colors;
    for (const value of Object.values(neutral)) expect(grey(value)).toBe(true);
    for (const value of [statusBlocked, statusWorking, statusDone, success, warning, danger])
      expect(grey(value)).toBe(false);
    expect(colors.canvas).toBe('#000000');
    expect(colors.glow).toBe(colors.canvas);
    expect(contrast(colors.textSecondary, colors.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.textTertiary, colors.canvas)).toBeGreaterThanOrEqual(3);
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

  it('dims overlays with a dark scrim in every theme, light ones included', () => {
    // WCAG relative luminance of a #RRGGBB color.
    const luminance = (hex: string) => {
      const linear = (at: number) => {
        const c = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * linear(1) + 0.7152 * linear(3) + 0.0722 * linear(5);
    };
    for (const id of themeIds) {
      const { scrim, canvas } = themes[id].colors;
      expect(buildTheme(id).backdrop).toBe(withAlpha(scrim, 0.45));
      expect(luminance(scrim)).toBeLessThan(0.02);
      expect(luminance(scrim)).toBeLessThanOrEqual(luminance(canvas));
    }
  });

  it('scales spacing by 1.3 over a 4-pt base', () => {
    expect(Object.values(spacing)).toEqual([5, 10, 16, 21, 31, 42]);
  });
});
