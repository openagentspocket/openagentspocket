import type { TerminalThemeOption } from '../components/TerminalThemePicker';
import type { TerminalPalette } from '../components/TerminalThemePreview';
import {
  type TerminalThemeColors,
  type TerminalThemeData,
  terminalThemes,
} from './terminalThemes.generated';

export type { TerminalThemeColors, TerminalThemeData };
export { terminalThemes };

type Appearance = 'dark' | 'light';
type Translate = (text: string) => string;

/** The theme registered under an id; the first one (the default) when the id is unknown. */
export function terminalThemeById(id: string): TerminalThemeData {
  return (
    terminalThemes.find((theme) => theme.id === id) ?? (terminalThemes[0] as TerminalThemeData)
  );
}

/** The colors of one appearance; a theme without a light half renders the same in Light Mode. */
export const terminalColors = (theme: TerminalThemeData, appearance: Appearance) =>
  (appearance === 'light' ? theme.light : undefined) ?? theme.dark;

/** The preview card's colors (ANSI slots: 2 green, 3 yellow, 8 dim, 12 blue, 13 pink). */
export function terminalPalette(id: string, appearance: Appearance): TerminalPalette {
  const { background, foreground, ansi } = terminalColors(terminalThemeById(id), appearance);
  const slot = (index: number) => ansi[index] ?? foreground;
  return {
    background,
    foreground,
    accent: slot(13),
    success: slot(2),
    directory: slot(12),
    prompt: slot(3),
    muted: slot(8),
  };
}

/**
 * Every registered theme as a picker row. `translate` maps the Swift title and description (English)
 * to the current language; the registry itself stays plain data.
 */
export function terminalThemeOptions(
  appearance: Appearance,
  translate: Translate = (text) => text,
): TerminalThemeOption[] {
  return terminalThemes.map((theme) => {
    const { background, foreground, ansi } = terminalColors(theme, appearance);
    return {
      id: theme.id,
      name: translate(theme.title),
      subtitle: translate(theme.detail),
      swatch: { background, bars: [ansi[12] ?? foreground, foreground, ansi[8] ?? foreground] },
    };
  });
}
