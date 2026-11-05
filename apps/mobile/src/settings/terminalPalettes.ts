import type { Appearance } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import type { TerminalPalette, TerminalThemeOption } from '@openagentspocket/ui';
import data from './terminalPalettes.json';
import { PALETTE_DETAILS } from './terminalPalettesDetails';

interface CatalogTheme {
  background: string;
  foreground: string;
  /** The 16 ANSI colors. */
  palette: readonly string[];
}

const catalog = data.themes as Record<string, CatalogTheme>;

const themeOf = (id: string, appearance: Appearance): CatalogTheme => {
  const option = data.options.find((candidate) => candidate.id === id) ?? data.options[0];
  const name = appearance === 'dark' ? option?.dark : option?.light;
  const theme = name ? catalog[name] : undefined;
  return theme ?? (Object.values(catalog)[0] as CatalogTheme);
};

/** The colors the preview card draws from one palette half (ANSI slots: 2 green, 3 yellow, 8 dim, 12 blue, 13 pink). */
export function terminalPalette(id: string, appearance: Appearance): TerminalPalette {
  const { background, foreground, palette } = themeOf(id, appearance);
  const ansi = (slot: number) => palette[slot] ?? foreground;
  return {
    background,
    foreground,
    accent: ansi(13),
    success: ansi(2),
    directory: ansi(12),
    prompt: ansi(3),
    muted: ansi(8),
  };
}

/** Every curated palette as a picker row: the thumbnail follows the active appearance. */
export function terminalThemeOptions(appearance: Appearance): TerminalThemeOption[] {
  return data.options.map((option) => {
    const { background, foreground, palette } = themeOf(option.id, appearance);
    return {
      id: option.id,
      name: option.id === 'follow-system' ? t('Default') : option.title,
      subtitle: PALETTE_DETAILS[option.id]?.() ?? '',
      swatch: {
        background,
        bars: [palette[12] ?? foreground, foreground, palette[8] ?? foreground],
      },
    };
  });
}

/** The palette's display name, for the value on the Theme page row. */
export function terminalThemeName(id: string): string {
  return terminalThemeOptions('dark').find((option) => option.id === id)?.name ?? '';
}
