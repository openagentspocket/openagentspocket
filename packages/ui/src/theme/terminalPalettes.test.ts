import {
  terminalPalette,
  terminalThemeById,
  terminalThemeOptions,
  terminalThemes,
} from './terminalPalettes';

describe('terminal theme registry', () => {
  it('registers every theme once with a full palette', () => {
    expect(new Set(terminalThemes.map((theme) => theme.id)).size).toBe(terminalThemes.length);
    for (const theme of terminalThemes) {
      expect(theme.dark.ansi).toHaveLength(16);
      if (theme.light) expect(theme.light.ansi).toHaveLength(16);
    }
  });

  it('picks the half of the appearance and falls back to dark', () => {
    const paired = terminalThemes.find((theme) => theme.light);
    const single = terminalThemes.find((theme) => !theme.light);
    expect(paired && terminalPalette(paired.id, 'light').background).toBe(
      paired?.light?.background,
    );
    expect(single && terminalPalette(single.id, 'light').background).toBe(single?.dark.background);
  });

  it('falls back to the default theme for an unknown id and translates through the callback', () => {
    expect(terminalThemeById('missing')).toBe(terminalThemes[0]);
    expect(terminalThemeOptions('dark', (text) => `x${text}`)[0]?.name.startsWith('x')).toBe(true);
  });
});
